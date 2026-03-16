import { Router, type IRouter } from "express";
import { db, predictionsTable, racesTable, horsesTable, raceEntriesTable, tracksTable } from "@workspace/db";
import { eq, desc, ne } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { fetchHorseRacingNews } from "../utils/news";

const router: IRouter = Router();

router.get("/predictions", async (req, res) => {
  try {
    const raceId = req.query.raceId ? parseInt(req.query.raceId as string) : undefined;

    let rows = await db
      .select({
        id: predictionsTable.id,
        raceId: predictionsTable.raceId,
        predictedWinnerId: predictionsTable.predictedWinnerId,
        confidenceScore: predictionsTable.confidenceScore,
        reasoning: predictionsTable.reasoning,
        topPicksJson: predictionsTable.topPicksJson,
        wasCorrect: predictionsTable.wasCorrect,
        actualWinnerId: predictionsTable.actualWinnerId,
        createdAt: predictionsTable.createdAt,
        raceName: racesTable.raceName,
        raceDate: racesTable.raceDate,
        trackName: tracksTable.name,
      })
      .from(predictionsTable)
      .innerJoin(racesTable, eq(predictionsTable.raceId, racesTable.id))
      .innerJoin(tracksTable, eq(racesTable.trackId, tracksTable.id))
      .orderBy(desc(predictionsTable.createdAt));

    if (raceId) rows = rows.filter((r) => r.raceId === raceId);

    const result = await Promise.all(
      rows.map(async (p) => {
        const [predictedHorse] = await db.select().from(horsesTable).where(eq(horsesTable.id, p.predictedWinnerId));
        let actualWinnerName: string | null = null;
        if (p.actualWinnerId) {
          const [h] = await db.select().from(horsesTable).where(eq(horsesTable.id, p.actualWinnerId));
          actualWinnerName = h?.name ?? null;
        }
        return formatPrediction(p, predictedHorse?.name ?? "Unknown", actualWinnerName);
      })
    );

    res.json(result);
  } catch (err) {
    console.error("Error listing predictions:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/predictions/generate", async (req, res) => {
  try {
    const { raceId } = req.body;
    if (!raceId) return res.status(400).json({ error: "raceId is required" });

    const [race] = await db
      .select({ id: racesTable.id, raceName: racesTable.raceName, raceDate: racesTable.raceDate, distance: racesTable.distance, surface: racesTable.surface, conditions: racesTable.conditions, purse: racesTable.purse, trackName: tracksTable.name })
      .from(racesTable)
      .innerJoin(tracksTable, eq(racesTable.trackId, tracksTable.id))
      .where(eq(racesTable.id, raceId));

    if (!race) return res.status(404).json({ error: "Race not found" });

    const entries = await db
      .select({
        id: raceEntriesTable.id,
        horseId: raceEntriesTable.horseId,
        postPosition: raceEntriesTable.postPosition,
        jockey: raceEntriesTable.jockey,
        trainer: raceEntriesTable.trainer,
        morningLineOdds: raceEntriesTable.morningLineOdds,
        weight: raceEntriesTable.weight,
        lastRaceDate: raceEntriesTable.lastRaceDate,
        lastRaceFinish: raceEntriesTable.lastRaceFinish,
        horseName: horsesTable.name,
        age: horsesTable.age,
        totalRaces: horsesTable.totalRaces,
        totalWins: horsesTable.totalWins,
        totalPlaces: horsesTable.totalPlaces,
        totalShows: horsesTable.totalShows,
        earnings: horsesTable.earnings,
        sire: horsesTable.sire,
        trainer2: horsesTable.trainer,
      })
      .from(raceEntriesTable)
      .innerJoin(horsesTable, eq(raceEntriesTable.horseId, horsesTable.id))
      .where(eq(raceEntriesTable.raceId, raceId))
      .orderBy(raceEntriesTable.postPosition);

    if (entries.length === 0) return res.status(400).json({ error: "No entries found for this race" });

    const entriesText = entries
      .map(
        (e) =>
          `- Post #${e.postPosition}: ${e.horseName} (Age ${e.age}) | Jockey: ${e.jockey} | Trainer: ${e.trainer} | Odds: ${e.morningLineOdds} | Record: ${e.totalWins}-${e.totalPlaces}-${e.totalShows} from ${e.totalRaces} starts | Earnings: $${e.earnings.toLocaleString()} | Last race: ${e.lastRaceDate ?? "N/A"} (finished ${e.lastRaceFinish ?? "N/A"}) | Sire: ${e.sire}`
      )
      .join("\n");

    // --- Build historical context ---
    // 1. Overall model accuracy
    const allPastPredictions = await db
      .select({ wasCorrect: predictionsTable.wasCorrect, confidenceScore: predictionsTable.confidenceScore })
      .from(predictionsTable)
      .where(ne(predictionsTable.raceId, raceId));

    const resolvedPast = allPastPredictions.filter((p) => p.wasCorrect !== null);
    const overallAccuracy = resolvedPast.length > 0
      ? ((resolvedPast.filter((p) => p.wasCorrect).length / resolvedPast.length) * 100).toFixed(1)
      : null;
    const avgConfidence = resolvedPast.length > 0
      ? (resolvedPast.reduce((s, p) => s + p.confidenceScore, 0) / resolvedPast.length * 100).toFixed(1)
      : null;

    // 2. Per-horse history at this track/surface
    const horseIds = entries.map((e) => e.horseId);
    const horsePastPredictions = await Promise.all(
      horseIds.map(async (horseId) => {
        const rows = await db
          .select({
            wasCorrect: predictionsTable.wasCorrect,
            confidenceScore: predictionsTable.confidenceScore,
            surface: racesTable.surface,
            trackName: tracksTable.name,
            predictedWinnerId: predictionsTable.predictedWinnerId,
          })
          .from(predictionsTable)
          .innerJoin(racesTable, eq(predictionsTable.raceId, racesTable.id))
          .innerJoin(tracksTable, eq(racesTable.trackId, tracksTable.id))
          .where(eq(predictionsTable.predictedWinnerId, horseId))
          .orderBy(desc(predictionsTable.createdAt))
          .limit(10);
        return { horseId, rows };
      })
    );

    // Build per-horse summary
    const horseHistoryLines = horsePastPredictions
      .map(({ horseId, rows }) => {
        const entry = entries.find((e) => e.horseId === horseId);
        if (!entry || rows.length === 0) return null;
        const resolved = rows.filter((r) => r.wasCorrect !== null);
        if (resolved.length === 0) return `  - ${entry.horseName}: Model picked this horse ${rows.length}x, no results recorded yet`;
        const wins = resolved.filter((r) => r.wasCorrect).length;
        const sameSurface = resolved.filter((r) => r.surface === race.surface);
        const surfaceWins = sameSurface.filter((r) => r.wasCorrect).length;
        let line = `  - ${entry.horseName}: Model picked ${wins}/${resolved.length} correct (${((wins / resolved.length) * 100).toFixed(0)}% hit rate)`;
        if (sameSurface.length > 0) line += `, ${surfaceWins}/${sameSurface.length} on ${race.surface}`;
        return line;
      })
      .filter(Boolean)
      .join("\n");

    // 3. Track-specific accuracy
    const trackPredictions = await db
      .select({ wasCorrect: predictionsTable.wasCorrect })
      .from(predictionsTable)
      .innerJoin(racesTable, eq(predictionsTable.raceId, racesTable.id))
      .innerJoin(tracksTable, eq(racesTable.trackId, tracksTable.id))
      .where(eq(tracksTable.name, race.trackName));
    const trackResolved = trackPredictions.filter((p) => p.wasCorrect !== null);
    const trackAccuracy = trackResolved.length > 0
      ? ((trackResolved.filter((p) => p.wasCorrect).length / trackResolved.length) * 100).toFixed(0)
      : null;

    const historicalSection = [
      "MODEL HISTORICAL PERFORMANCE (use this to calibrate confidence — where the model has been wrong before, adjust accordingly):",
      overallAccuracy !== null
        ? `  - Overall accuracy: ${overallAccuracy}% correct from ${resolvedPast.length} resolved predictions (avg confidence used: ${avgConfidence}%)`
        : "  - No resolved predictions yet (this is an early prediction — be appropriately conservative with confidence scores)",
      trackAccuracy !== null
        ? `  - At ${race.trackName}: ${trackAccuracy}% accuracy from ${trackResolved.length} resolved picks`
        : `  - No prior picks at ${race.trackName}`,
      horseHistoryLines ? `  Per-horse model record:\n${horseHistoryLines}` : "  - No prior picks on horses in this field",
    ].join("\n");

    const horseNames = entries.map((e) => e.horseName);
    const newsSection = await fetchHorseRacingNews(race.trackName, horseNames);

    const prompt = `You are an expert horse racing analyst with 30 years of experience handicapping US races. You are also reviewing your own model's past performance to improve your predictions.

RACE INFO:
- Race: ${race.raceName} at ${race.trackName}
- Date: ${race.raceDate}
- Distance: ${race.distance}
- Surface: ${race.surface}
- Conditions: ${race.conditions || "Standard conditions"}
- Purse: $${race.purse.toLocaleString()}

HORSES ENTERED:
${entriesText}

${historicalSection}
${newsSection ? `\n${newsSection}\n\nNEWS ANALYSIS INSTRUCTIONS — complete this BEFORE selecting picks:\nFor each headline above, identify:\n  • Which horse(s) or jockey is mentioned (if any)?\n  • Does the news suggest a scratch, injury, track condition change, or form reversal?\n  • Does it improve or reduce a horse's chances in THIS race?\nCapture each meaningful finding in the "newsInsights" field.` : ""}

PREDICTION INSTRUCTIONS:
- Let the news analysis directly influence your pick — a late scratch or injury report outweighs historical stats
- Use the historical performance data to calibrate confidence — reduce confidence where the model has been wrong
- A horse with strong model hit rate in similar surface/distance conditions is a positive signal
- If the model has struggled at this track, widen the confidence gap between your top pick and the rest

Provide your analysis in this exact JSON format (no markdown, just JSON):
{
  "topPicks": [
    { "rank": 1, "horseName": "Horse Name", "postPosition": 1, "confidenceScore": 0.72, "keyFactors": ["Factor 1 (can cite news)", "Factor 2", "Factor 3"] },
    { "rank": 2, "horseName": "Horse Name", "postPosition": 2, "confidenceScore": 0.55, "keyFactors": ["Factor 1", "Factor 2"] },
    { "rank": 3, "horseName": "Horse Name", "postPosition": 3, "confidenceScore": 0.40, "keyFactors": ["Factor 1", "Factor 2"] }
  ],
  "reasoning": "3-5 sentences: lead with the single most impactful news finding, then cover form, distance/surface fit, and model calibration.",
  "newsInsights": ["How news item 1 affects a specific horse or the race", "How news item 2 shifts the edge"]
}

Focus on: recent form, class level, distance/surface suitability, jockey/trainer statistics, breeding, pace, news-driven factors, and model calibration.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let aiResult: any;
    try {
      aiResult = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response");
      }
    }

    const topPicks = aiResult.topPicks ?? [];
    const winner = topPicks[0];
    if (!winner) return res.status(500).json({ error: "AI returned no picks" });

    const winnerEntry = entries.find((e) => e.horseName === winner.horseName);
    if (!winnerEntry) return res.status(500).json({ error: "Could not match predicted winner to entries" });

    const topPicksWithIds = topPicks.map((pick: any) => {
      const entry = entries.find((e) => e.horseName === pick.horseName);
      return {
        horseId: entry?.horseId ?? 0,
        horseName: pick.horseName,
        rank: pick.rank,
        confidenceScore: pick.confidenceScore,
        keyFactors: pick.keyFactors ?? [],
      };
    });

    const [pred] = await db
      .insert(predictionsTable)
      .values({
        raceId,
        predictedWinnerId: winnerEntry.horseId,
        confidenceScore: winner.confidenceScore,
        reasoning: aiResult.reasoning ?? "AI analysis complete.",
        topPicksJson: JSON.stringify({ picks: topPicksWithIds, newsInsights: aiResult.newsInsights ?? [] }),
      })
      .returning();

    const [track] = await db.select().from(tracksTable).innerJoin(racesTable, eq(racesTable.trackId, tracksTable.id)).where(eq(racesTable.id, raceId));

    return res.json({
      id: pred.id,
      raceId: pred.raceId,
      raceName: race.raceName,
      trackName: race.trackName,
      raceDate: race.raceDate,
      predictedWinnerId: pred.predictedWinnerId,
      predictedWinnerName: winnerEntry.horseName,
      confidenceScore: pred.confidenceScore,
      reasoning: pred.reasoning,
      topPicks: topPicksWithIds,
      wasCorrect: null,
      actualWinnerId: null,
      actualWinnerName: null,
      createdAt: pred.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("Error generating prediction:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/predictions/news", async (req, res) => {
  try {
    const { track, horses } = req.query as { track?: string; horses?: string };
    if (!track) return res.status(400).json({ error: "track query param required" });

    const horseList = horses ? horses.split(",").map((h) => h.trim()).filter(Boolean).slice(0, 4) : [];
    const { fetchRaceNewsItems } = await import("../utils/news");
    const items = await fetchRaceNewsItems(track, horseList);
    res.json(items);
  } catch (err) {
    console.error("Error fetching race news:", err);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

router.patch("/predictions/:id/result", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { wasCorrect, actualWinnerName } = req.body;

    if (typeof wasCorrect !== "boolean") {
      return res.status(400).json({ error: "wasCorrect (boolean) is required" });
    }

    let actualWinnerId: number | null = null;
    if (actualWinnerName) {
      const [horse] = await db.select().from(horsesTable).where(eq(horsesTable.name, actualWinnerName));
      actualWinnerId = horse?.id ?? null;
    }

    const [updated] = await db
      .update(predictionsTable)
      .set({ wasCorrect, actualWinnerId })
      .where(eq(predictionsTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Prediction not found" });

    res.json({ success: true, id: updated.id, wasCorrect: updated.wasCorrect });
  } catch (err) {
    console.error("Error updating prediction result:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/predictions/stats", async (req, res) => {
  try {
    const allPredictions = await db.select().from(predictionsTable);
    const total = allPredictions.length;
    const withResult = allPredictions.filter((p) => p.wasCorrect !== null && p.wasCorrect !== undefined);
    const correct = withResult.filter((p) => p.wasCorrect === true).length;
    const accuracyPercentage = withResult.length > 0 ? Number(((correct / withResult.length) * 100).toFixed(1)) : 0;
    const avgConfidence = total > 0 ? Number((allPredictions.reduce((sum, p) => sum + p.confidenceScore, 0) / total).toFixed(3)) : 0;

    const recent = allPredictions.slice(-10).filter((p) => p.wasCorrect !== null && p.wasCorrect !== undefined);
    const recentCorrect = recent.filter((p) => p.wasCorrect === true).length;
    const recentAccuracy = recent.length > 0 ? Number(((recentCorrect / recent.length) * 100).toFixed(1)) : 0;

    res.json({
      totalPredictions: total,
      correctPredictions: correct,
      accuracyPercentage,
      averageConfidence: avgConfidence,
      recentAccuracy,
    });
  } catch (err) {
    console.error("Error getting stats:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatPrediction(p: any, predictedWinnerName: string, actualWinnerName: string | null) {
  let topPicks: any[] = [];
  let newsInsights: string[] = [];
  try {
    const raw = JSON.parse(p.topPicksJson ?? "[]");
    // Support both old format (array) and new format ({ picks, newsInsights })
    if (Array.isArray(raw)) {
      topPicks = raw;
    } else {
      topPicks = raw.picks ?? [];
      newsInsights = raw.newsInsights ?? [];
    }
  } catch {}
  return {
    id: p.id,
    raceId: p.raceId,
    raceName: p.raceName ?? null,
    trackName: p.trackName ?? null,
    raceDate: p.raceDate ?? null,
    predictedWinnerId: p.predictedWinnerId,
    predictedWinnerName,
    confidenceScore: p.confidenceScore,
    reasoning: p.reasoning,
    topPicks,
    newsInsights,
    wasCorrect: p.wasCorrect ?? null,
    actualWinnerId: p.actualWinnerId ?? null,
    actualWinnerName,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

export default router;
