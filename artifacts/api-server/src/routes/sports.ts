import { Router, type IRouter } from "express";
import { db, sportsPredictionsTable, sportsEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const ODDS_API_KEY = process.env["ODDS_API_KEY"];
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

async function fetchOddsApi(path: string) {
  const url = `${ODDS_API_BASE}${path}${path.includes("?") ? "&" : "?"}apiKey=${ODDS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API error: ${res.status} ${res.statusText}`);
  return res.json();
}

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

    const prompt = `You are an expert sports analyst and betting handicapper. Analyze this upcoming ${sportTitle} matchup and provide a prediction.

MATCHUP: ${awayTeam} @ ${homeTeam}
DATE: ${new Date(commenceTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

CURRENT ODDS (American format):
${oddsLines}

Provide a structured prediction with:
1. Predicted winner (must be exactly "${homeTeam}" or "${awayTeam}")
2. Confidence score (0.0-1.0)
3. Detailed reasoning (2-4 sentences) covering team form, matchup advantages, and value assessment
4. Key factors as a list

Respond ONLY with valid JSON:
{
  "predictedWinner": "Team Name",
  "confidenceScore": 0.72,
  "reasoning": "Your detailed analysis here...",
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
