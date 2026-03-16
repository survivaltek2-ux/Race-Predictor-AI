import { Router, type IRouter } from "express";
import { db, sportsPredictionsTable, sportsEventsTable } from "@workspace/db";
import { eq, desc, and, or } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { fetchTeamNews } from "../utils/news";
import { fetchWeather, getVenueCoords, buildWeatherPromptSection, OUTDOOR_SPORT_KEYS } from "../utils/weather";

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
    if (!home || !away) return res.status(400).json({ error: "home and away query params required" });

    const { fetchTeamNewsItems } = await import("../utils/news");
    const items = await fetchTeamNewsItems(home, away, sport ?? "");
    res.json(items);
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

function computeLineMovement(openingOdds: any, currentOdds: any): { summary: string; movements: any[] } | null {
  try {
    const openBook = openingOdds?.bookmakers?.[0];
    const currBook = currentOdds?.bookmakers?.[0];
    if (!openBook || !currBook) return null;
    const openH2H = openBook.markets?.find((m: any) => m.key === "h2h");
    const currH2H = currBook.markets?.find((m: any) => m.key === "h2h");
    if (!openH2H || !currH2H) return null;
    const movements: any[] = [];
    for (const outcome of currH2H.outcomes) {
      const open = openH2H.outcomes.find((o: any) => o.name === outcome.name);
      if (!open) continue;
      const change = outcome.price - open.price;
      movements.push({ team: outcome.name, opening: open.price, current: outcome.price, change });
    }
    const significant = movements.filter((m) => Math.abs(m.change) >= 5);
    if (significant.length === 0) return null;
    const lines = significant.map((m) => {
      const dir = m.change < 0 ? "shortened" : "drifted";
      return `${m.team}: ${m.opening > 0 ? "+" : ""}${m.opening} → ${m.current > 0 ? "+" : ""}${m.current} (${dir} ${Math.abs(m.change)} pts)`;
    });
    const sharpTeam = significant.sort((a: any, b: any) => Math.abs(b.change) - Math.abs(a.change))[0];
    const summary = `Line movement: ${lines.join("; ")} — sharp action likely on ${sharpTeam.change < 0 ? sharpTeam.team : significant.find((m: any) => m.team !== sharpTeam.team)?.team ?? sharpTeam.team}`;
    return { summary, movements };
  } catch {
    return null;
  }
}

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

    // Upsert event to track opening odds (first time we see this event = opening line)
    const oddsStr = JSON.stringify(oddsData ?? {});
    const storedEvent = await db
      .select()
      .from(sportsEventsTable)
      .where(eq(sportsEventsTable.externalId, eventId))
      .limit(1);

    let openingOdds: any = null;
    if (storedEvent.length === 0) {
      await db.insert(sportsEventsTable).values({
        externalId: eventId,
        sportKey,
        sportTitle,
        homeTeam,
        awayTeam,
        commenceTime: new Date(commenceTime),
        oddsJson: oddsStr,
        openingOddsJson: oddsStr,
      });
      openingOdds = oddsData;
    } else {
      const row = storedEvent[0];
      openingOdds = row.openingOddsJson ? JSON.parse(row.openingOddsJson) : oddsData;
      await db
        .update(sportsEventsTable)
        .set({ oddsJson: oddsStr })
        .where(eq(sportsEventsTable.externalId, eventId));
    }

    const lineMovement = computeLineMovement(openingOdds, oddsData);

    const oddsLines = oddsData?.bookmakers?.slice(0, 3).map((b: any) => {
      const market = b.markets?.find((m: any) => m.key === "h2h");
      if (!market) return null;
      const outcomes = market.outcomes.map((o: any) => `${o.name}: ${o.price > 0 ? "+" : ""}${o.price}`).join(", ");
      return `${b.title}: ${outcomes}`;
    }).filter(Boolean).join("\n") || "No odds available";

    // Fetch weather for outdoor sports
    const venueCoords = getVenueCoords(homeTeam, sportKey);
    const weatherResult = venueCoords ? await fetchWeather(venueCoords[0], venueCoords[1]) : null;
    const weatherSection = weatherResult ? buildWeatherPromptSection(weatherResult, "sports") : null;

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

    const prompt = `You are an expert sports analyst and betting handicapper with access to live news and historical model data.

MATCHUP: ${awayTeam} @ ${homeTeam}
SPORT: ${sportTitle}
DATE: ${new Date(commenceTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

CURRENT ODDS (American format):
${oddsLines}
${lineMovement ? `\nODDS LINE MOVEMENT (opening → current):\n${lineMovement.summary}\nInstruction: Sharp line movement is a strong signal — the side the money is on is likely the sharper side. Factor this into your pick and confidence.\n` : ""}
${weatherSection ? `\n${weatherSection}\n` : ""}
${newsSection ? `\n${newsSection}\n\nNEWS ANALYSIS INSTRUCTIONS — do this FIRST before picking:\nFor each news headline above, determine:\n  • Which team is affected (${homeTeam} or ${awayTeam})?\n  • Is the effect positive (momentum, key player back) or negative (injury, suspension, fatigue)?\n  • How much does it shift the probability edge?\nSummarise your findings in the "newsInsights" field — list each meaningful news impact as a concise sentence.` : ""}

${historicalSection}

PREDICTION INSTRUCTIONS:
- Analyze in this order: (1) line movement, (2) weather impact, (3) news, (4) historical model performance
- Line movement is the highest-signal factor — if sharp money moved the line, follow it unless news contradicts
- For outdoor sports in bad weather, lean toward the running game / lower totals / home team advantage
- If a key player is injured or suspended, lower confidence for that team significantly
- Use the historical record to calibrate confidence — reduce if the model has been overconfident
- Your confidence must reflect genuine win probability, not wishful thinking

Respond ONLY with valid JSON (no markdown):
{
  "predictedWinner": "Team Name (must be exactly '${homeTeam}' or '${awayTeam}')",
  "confidenceScore": 0.72,
  "reasoning": "3-5 sentences: lead with the single most important news finding, then cover odds value and historical calibration",
  "keyFactors": ["factor 1 (can reference a news item)", "factor 2", "factor 3"],
  "recommendedBet": "Brief betting recommendation",
  "valueSide": "${homeTeam} or ${awayTeam}",
  "newsInsights": ["Specific impact from news item 1", "Specific impact from news item 2"]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 2048,
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
        newsInsights: parsed.newsInsights || [],
        oddsAtPrediction: oddsData,
        weatherData: weatherResult ?? null,
        lineMovement: lineMovement ?? null,
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
    newsInsights: analysis.newsInsights || [],
    weatherData: analysis.weatherData ?? null,
    lineMovement: analysis.lineMovement ?? null,
    wasCorrect: p.wasCorrect ?? null,
    actualWinner: p.actualWinner ?? null,
    createdAt: p.createdAt,
  };
}

export default router;
