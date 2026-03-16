import { Router, type IRouter } from "express";
import { db, sportsPredictionsTable, sportsEventsTable } from "@workspace/db";
import { eq, desc, and, or } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { fetchTeamNews } from "../utils/news";

const router: IRouter = Router();

const ODDS_API_KEY = process.env["ODDS_API_KEY"];
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

async function fetchOddsApi(path: string) {
  const url = `${ODDS_API_BASE}${path}${path.includes("?") ? "&" : "?"}apiKey=${ODDS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API error: ${res.status} ${res.statusText}`);
  return res.json();
}

router.get("/sports/news", async (req, res) => {
  try {
    const { home, away, sport } = req.query as { home?: string; away?: string; sport?: string };
    if (!home && !away) return res.status(400).json({ error: "home or away query param required" });

    const [homeItems, awayItems] = await Promise.all([
      home && sport ? (await import("../utils/news")).fetchNews(`${home} ${sport}`, 4) : Promise.resolve([]),
      away && sport ? (await import("../utils/news")).fetchNews(`${away} ${sport}`, 4) : Promise.resolve([]),
    ]);

    const all = [...homeItems, ...awayItems].filter((item, idx, arr) =>
      arr.findIndex((o) => o.title === item.title) === idx
    );

    res.json(all);
  } catch (err) {
    console.error("Error fetching sports news:", err);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

router.get("/sports/list", async (_req, res) => {
  try {
    const sports = await fetchOddsApi("/sports?all=false");
    res.json(sports);
  } catch (err) {
    console.error("Error fetching sports:", err);
    res.status(500).json({ error: "Failed to fetch sports list" });
  }
});

router.get("/sports/events", async (req, res) => {
  try {
    const sport = req.query.sport as string;
    if (!sport) return res.status(400).json({ error: "sport query param required" });

    const events = await fetchOddsApi(
      `/sports/${sport}/odds?regions=us&markets=h2h&oddsFormat=american`
    );
    res.json(events);
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

router.post("/sports/predictions", async (req, res) => {
  try {
    const { eventId, sportKey, sportTitle, homeTeam, awayTeam, commenceTime, oddsData } = req.body;

    if (!eventId || !sportKey || !homeTeam || !awayTeam) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existing = await db
      .select()
      .from(sportsPredictionsTable)
      .where(eq(sportsPredictionsTable.externalEventId, eventId))
      .orderBy(desc(sportsPredictionsTable.createdAt))
      .limit(1);

    if (existing.length > 0) {
      return res.json(formatSportsPrediction(existing[0]));
    }

    const oddsLines = oddsData?.bookmakers?.slice(0, 3).map((b: any) => {
      const market = b.markets?.find((m: any) => m.key === "h2h");
      if (!market) return null;
      const outcomes = market.outcomes.map((o: any) => `${o.name}: ${o.price > 0 ? "+" : ""}${o.price}`).join(", ");
      return `${b.title}: ${outcomes}`;
    }).filter(Boolean).join("\n") || "No odds available";

    // --- Build historical context ---
    // 1. Overall accuracy for this sport
    const allSportPreds = await db
      .select({ wasCorrect: sportsPredictionsTable.wasCorrect, confidenceScore: sportsPredictionsTable.confidenceScore, predictedWinner: sportsPredictionsTable.predictedWinner })
      .from(sportsPredictionsTable)
      .where(eq(sportsPredictionsTable.sportKey, sportKey));

    const resolvedSport = allSportPreds.filter((p) => p.wasCorrect !== null);
    const sportCorrect = resolvedSport.filter((p) => p.wasCorrect).length;
    const sportAccuracy = resolvedSport.length > 0
      ? ((sportCorrect / resolvedSport.length) * 100).toFixed(1)
      : null;
    const sportAvgConf = resolvedSport.length > 0
      ? (resolvedSport.reduce((s, p) => s + p.confidenceScore, 0) / resolvedSport.length * 100).toFixed(1)
      : null;

    // 2. Past matchups involving these specific teams
    const teamPreds = await db
      .select({
        homeTeam: sportsPredictionsTable.homeTeam,
        awayTeam: sportsPredictionsTable.awayTeam,
        predictedWinner: sportsPredictionsTable.predictedWinner,
        wasCorrect: sportsPredictionsTable.wasCorrect,
        actualWinner: sportsPredictionsTable.actualWinner,
        confidenceScore: sportsPredictionsTable.confidenceScore,
        commenceTime: sportsPredictionsTable.commenceTime,
      })
      .from(sportsPredictionsTable)
      .where(
        and(
          eq(sportsPredictionsTable.sportKey, sportKey),
          or(
            eq(sportsPredictionsTable.homeTeam, homeTeam),
            eq(sportsPredictionsTable.awayTeam, homeTeam),
            eq(sportsPredictionsTable.homeTeam, awayTeam),
            eq(sportsPredictionsTable.awayTeam, awayTeam),
          )
        )
      )
      .orderBy(desc(sportsPredictionsTable.commenceTime))
      .limit(10);

    const teamHistoryLines = teamPreds.map((p) => {
      const matchup = `${p.awayTeam} @ ${p.homeTeam}`;
      const dateStr = new Date(p.commenceTime).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const outcome = p.wasCorrect === null
        ? "(pending)"
        : p.wasCorrect
          ? `✓ CORRECT (${p.actualWinner ?? "confirmed"})`
          : `✗ WRONG — actual winner: ${p.actualWinner ?? "unknown"}`;
      return `  - ${dateStr}: ${matchup} → Picked: ${p.predictedWinner} (${Math.round(p.confidenceScore * 100)}% confidence) → ${outcome}`;
    }).join("\n");

    // 3. Home/away team win rates from resolved predictions
    const homeTeamPicks = resolvedSport.filter((p: any) => p.predictedWinner === homeTeam);
    const awayTeamPicks = resolvedSport.filter((p: any) => p.predictedWinner === awayTeam);

    const historicalSection = [
      `MODEL HISTORICAL PERFORMANCE FOR ${sportTitle.toUpperCase()} (calibrate your confidence based on this):`,
      sportAccuracy !== null
        ? `  - Overall ${sportTitle} accuracy: ${sportAccuracy}% from ${resolvedSport.length} resolved predictions (avg confidence used: ${sportAvgConf}%)`
        : `  - No resolved ${sportTitle} predictions yet — use conservative confidence scores`,
      sportAccuracy !== null && Number(sportAccuracy) < Number(sportAvgConf)
        ? `  ⚠ Model has been OVERCONFIDENT (accuracy ${sportAccuracy}% < avg confidence ${sportAvgConf}%) — reduce confidence scores accordingly`
        : sportAccuracy !== null
          ? `  ✓ Model confidence is well-calibrated`
          : "",
      homeTeamPicks.length > 0 ? `  - ${homeTeam} picked ${homeTeamPicks.length}x, correct ${homeTeamPicks.filter((p: any) => p.wasCorrect).length} times` : "",
      awayTeamPicks.length > 0 ? `  - ${awayTeam} picked ${awayTeamPicks.length}x, correct ${awayTeamPicks.filter((p: any) => p.wasCorrect).length} times` : "",
      teamPreds.length > 0 ? `\n  Prior predictions involving these teams:\n${teamHistoryLines}` : "  - No prior predictions involving these teams",
    ].filter(Boolean).join("\n");

    const newsSection = await fetchTeamNews(homeTeam, awayTeam, sportTitle);

    const prompt = `You are an expert sports analyst and betting handicapper. You are reviewing your own model's historical performance to make a better-calibrated prediction.

MATCHUP: ${awayTeam} @ ${homeTeam}
SPORT: ${sportTitle}
DATE: ${new Date(commenceTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

CURRENT ODDS (American format):
${oddsLines}

${historicalSection}
${newsSection ? `\n${newsSection}` : ""}

INSTRUCTIONS:
- Use the historical record to adjust your confidence — if the model has been overconfident, lower your scores
- If you've previously picked a team and been wrong, factor that into your reasoning
- If the model has no history for this sport, be conservative with confidence scores
- Analyze the news section for injuries, suspensions, roster changes, recent form, or travel fatigue that shifts the edge
- Your confidence should reflect genuine probability, not wishful thinking

Provide a structured prediction. Respond ONLY with valid JSON:
{
  "predictedWinner": "Team Name (must be exactly '${homeTeam}' or '${awayTeam}')",
  "confidenceScore": 0.72,
  "reasoning": "2-4 sentences covering matchup advantages, historical model performance context, and value assessment",
  "keyFactors": ["factor 1", "factor 2", "factor 3"],
  "recommendedBet": "Brief betting recommendation",
  "valueSide": "${homeTeam} or ${awayTeam}"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1024,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");

    const parsed = JSON.parse(content);

    const [saved] = await db.insert(sportsPredictionsTable).values({
      externalEventId: eventId,
      sportKey,
      sportTitle,
      homeTeam,
      awayTeam,
      commenceTime: new Date(commenceTime),
      predictedWinner: parsed.predictedWinner,
      confidenceScore: parsed.confidenceScore,
      reasoning: parsed.reasoning,
      analysisJson: JSON.stringify({
        keyFactors: parsed.keyFactors || [],
        recommendedBet: parsed.recommendedBet || "",
        valueSide: parsed.valueSide || "",
        oddsAtPrediction: oddsData,
      }),
    }).returning();

    res.json(formatSportsPrediction(saved));
  } catch (err) {
    console.error("Error generating sports prediction:", err);
    res.status(500).json({ error: "Failed to generate prediction" });
  }
});

router.get("/sports/predictions", async (req, res) => {
  try {
    const sportKey = req.query.sport as string | undefined;
    let rows = await db
      .select()
      .from(sportsPredictionsTable)
      .orderBy(desc(sportsPredictionsTable.createdAt));

    if (sportKey) rows = rows.filter((r) => r.sportKey === sportKey);

    res.json(rows.map(formatSportsPrediction));
  } catch (err) {
    console.error("Error fetching sports predictions:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/sports/predictions/:id/result", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { wasCorrect, actualWinner } = req.body;

    if (typeof wasCorrect !== "boolean") {
      return res.status(400).json({ error: "wasCorrect (boolean) is required" });
    }

    const [updated] = await db
      .update(sportsPredictionsTable)
      .set({ wasCorrect, actualWinner: actualWinner ?? null })
      .where(eq(sportsPredictionsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Prediction not found" });

    res.json({ success: true, id: updated.id, wasCorrect: updated.wasCorrect });
  } catch (err) {
    console.error("Error updating sports prediction result:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sports/predictions/stats", async (_req, res) => {
  try {
    const all = await db.select().from(sportsPredictionsTable);
    const total = all.length;
    const withResult = all.filter((p) => p.wasCorrect !== null && p.wasCorrect !== undefined);
    const correct = withResult.filter((p) => p.wasCorrect).length;
    const accuracy = withResult.length > 0 ? Number(((correct / withResult.length) * 100).toFixed(1)) : 0;
    const avgConf = total > 0 ? Number((all.reduce((s, p) => s + p.confidenceScore, 0) / total).toFixed(3)) : 0;
    res.json({ totalPredictions: total, correctPredictions: correct, accuracyPercentage: accuracy, averageConfidence: avgConf });
  } catch (err) {
    console.error("Error fetching sports stats:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatSportsPrediction(p: any) {
  let analysis: any = {};
  try { analysis = JSON.parse(p.analysisJson || "{}"); } catch {}
  return {
    id: p.id,
    externalEventId: p.externalEventId,
    sportKey: p.sportKey,
    sportTitle: p.sportTitle,
    homeTeam: p.homeTeam,
    awayTeam: p.awayTeam,
    commenceTime: p.commenceTime,
    predictedWinner: p.predictedWinner,
    confidenceScore: p.confidenceScore,
    reasoning: p.reasoning,
    keyFactors: analysis.keyFactors || [],
    recommendedBet: analysis.recommendedBet || "",
    valueSide: analysis.valueSide || "",
    wasCorrect: p.wasCorrect ?? null,
    actualWinner: p.actualWinner ?? null,
    createdAt: p.createdAt,
  };
}

export default router;
