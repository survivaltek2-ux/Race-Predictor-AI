import { Router, type IRouter } from "express";
import { db, predictionsTable, racesTable, horsesTable, raceEntriesTable, tracksTable } from "@workspace/db";
import { eq, desc, ne } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { fetchHorseRacingNews } from "../utils/news";
import { fetchWeather, getTrackCoords, buildWeatherPromptSection } from "../utils/weather";

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

    // --- Derived analytics per entry ---
    // 1. Win percentage from morning line odds (ML odds → implied probability)
    const mlToImplied = (odds: string | null): number | null => {
      if (!odds) return null;
      const normalized = odds.trim().replace(/\s/g, "");
      // Handle fractional (e.g. "5-2", "7/2") and decimal (e.g. "3.5") formats
      if (normalized.includes("-") || normalized.includes("/")) {
        const sep = normalized.includes("/") ? "/" : "-";
        const parts = normalized.split(sep);
        const num = parseFloat(parts[0]);
        const den = parseFloat(parts[1]);
        if (isNaN(num) || isNaN(den) || den === 0) return null;
        return den / (num + den);
      }
      const n = parseFloat(normalized);
      if (isNaN(n)) return null;
      return 1 / (n + 1);
    };

    // 2. Days since last race
    const daysSince = (lastRaceDate: string | null | Date): number | null => {
      if (!lastRaceDate) return null;
      return Math.floor((Date.now() - new Date(lastRaceDate).getTime()) / 86400000);
    };

    // 3. Jockey/trainer cross-field win rate comparison
    const jockeyGroups: Record<string, { names: string[]; wins: number; total: number }> = {};
    const trainerGroups: Record<string, { names: string[]; wins: number; total: number }> = {};
    for (const e of entries) {
      if (e.jockey) {
        if (!jockeyGroups[e.jockey]) jockeyGroups[e.jockey] = { names: [], wins: 0, total: 0 };
        jockeyGroups[e.jockey].names.push(e.horseName);
        jockeyGroups[e.jockey].wins += e.totalWins;
        jockeyGroups[e.jockey].total += e.totalRaces;
      }
      if (e.trainer) {
        if (!trainerGroups[e.trainer]) trainerGroups[e.trainer] = { names: [], wins: 0, total: 0 };
        trainerGroups[e.trainer].names.push(e.horseName);
        trainerGroups[e.trainer].wins += e.totalWins;
        trainerGroups[e.trainer].total += e.totalRaces;
      }
    }

    // 4. Pace projection: classify each horse as speed, presser, or closer
    const classifyPaceRole = (e: typeof entries[0]): string => {
      const impl = mlToImplied(e.morningLineOdds);
      const winRate = e.totalRaces > 0 ? e.totalWins / e.totalRaces : 0;
      const lastFinish = e.lastRaceFinish ?? 99;
      // Heuristic: favorites with high win rates that tend to finish fast are speed horses
      if (impl && impl > 0.35 && winRate > 0.3) return "Speed/Pace Setter";
      if (lastFinish <= 2) return "Presser";
      if (lastFinish >= 5) return "Closer";
      return "Mid-pack";
    };

    // 5. Class analysis: compare purse to career earnings per start
    const avgEarningsPerStart = (e: typeof entries[0]): number =>
      e.totalRaces > 0 ? e.earnings / e.totalRaces : 0;

    // 6. Post position analysis (statistical priors)
    const distanceFurlongs = (() => {
      const d = race.distance?.toLowerCase() ?? "";
      const m = d.match(/([\d.]+)\s*(?:furlong|mile|f|m)/);
      if (!m) return null;
      const n = parseFloat(m[1]);
      return d.includes("mile") ? n * 8 : n;
    })();
    const postPositionNote = distanceFurlongs
      ? distanceFurlongs <= 7
        ? "Sprint race (≤7f): Inside posts (1-3) have a statistical advantage — saves ground around turn."
        : "Route race (8f+): Outside posts more manageable — horses have time to find position."
      : "";

    const fieldSize = entries.length;

    const entriesText = entries
      .map((e) => {
        const impl = mlToImplied(e.morningLineOdds);
        const implPct = impl != null ? `${(impl * 100).toFixed(1)}% implied win prob` : "";
        const winRate = e.totalRaces > 0
          ? `${((e.totalWins / e.totalRaces) * 100).toFixed(1)}% career win rate`
          : "no career stats";
        const itm = e.totalRaces > 0
          ? `${(((e.totalWins + e.totalPlaces + e.totalShows) / e.totalRaces) * 100).toFixed(1)}% in-the-money`
          : "";
        const rest = daysSince(e.lastRaceDate);
        const restNote = rest == null ? "" : rest < 14 ? ` | ⚡ Only ${rest}d rest` : rest > 60 ? ` | ⚠ Layoff: ${rest}d` : ` | ${rest}d since last`;
        const lastFinNote = e.lastRaceFinish != null ? ` (finished ${e.lastRaceFinish}${e.lastRaceFinish === 1 ? "st" : e.lastRaceFinish === 2 ? "nd" : e.lastRaceFinish === 3 ? "rd" : "th"})` : "";
        const avgEPS = avgEarningsPerStart(e);
        const classNote = avgEPS > 0 ? ` | Avg $${Math.round(avgEPS).toLocaleString()}/start` : "";
        const paceRole = classifyPaceRole(e);
        return [
          `Post #${e.postPosition}: ${e.horseName} (${e.age}yo)`,
          `  Odds: ${e.morningLineOdds ?? "N/A"}${implPct ? ` (${implPct})` : ""}`,
          `  Jockey: ${e.jockey ?? "N/A"} | Trainer: ${e.trainer ?? "N/A"}`,
          `  Record: ${e.totalWins}-${e.totalPlaces}-${e.totalShows} from ${e.totalRaces} starts | ${winRate} | ${itm}`,
          `  Earnings: $${e.earnings.toLocaleString()}${classNote}`,
          `  Last race: ${e.lastRaceDate ?? "N/A"}${lastFinNote}${restNote}`,
          `  Sire: ${e.sire ?? "Unknown"} | Pace Profile: ${paceRole} | Weight: ${e.weight ?? "N/A"}lbs`,
        ].join("\n");
      })
      .join("\n\n");

    const jockeySection = Object.entries(jockeyGroups)
      .map(([j, d]) => {
        const wr = d.total > 0 ? ((d.wins / d.total) * 100).toFixed(1) : "N/A";
        return `  ${j} (riding ${d.names.join(", ")}): ${d.wins}-for-${d.total} combined career wins (${wr}% win rate on mounts)`;
      })
      .join("\n");

    const trainerSection = Object.entries(trainerGroups)
      .map(([t, d]) => {
        const wr = d.total > 0 ? ((d.wins / d.total) * 100).toFixed(1) : "N/A";
        return `  ${t} (trains ${d.names.join(", ")}): ${d.wins}-for-${d.total} combined career wins (${wr}% win rate on trainees)`;
      })
      .join("\n");

    // Pace shape projection for the race
    const paceRoles = entries.map((e) => ({ name: e.horseName, pp: e.postPosition, role: classifyPaceRole(e) }));
    const speedCount = paceRoles.filter((r) => r.role === "Speed/Pace Setter").length;
    const closerCount = paceRoles.filter((r) => r.role === "Closer").length;
    const paceProjection = speedCount >= 3
      ? `Hot pace projected (${speedCount} speed horses) — closers get a BOOST, front-runners fade late`
      : speedCount === 0
        ? "Slow pace projected — front-runners and pressers get a BOOST, closers disadvantaged"
        : `Moderate pace (${speedCount} speed, ${closerCount} closers) — neutral pace scenario`;

    const impliedProbLines = entries
      .map((e) => {
        const impl = mlToImplied(e.morningLineOdds);
        return impl != null
          ? `  Post #${e.postPosition} ${e.horseName}: ${(impl * 100).toFixed(1)}% implied win probability`
          : null;
      })
      .filter(Boolean)
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
    const [newsSection, weatherResult] = await Promise.all([
      fetchHorseRacingNews(race.trackName, horseNames),
      (async () => {
        const coords = getTrackCoords(race.trackName);
        return coords ? fetchWeather(coords[0], coords[1]) : null;
      })(),
    ]);
    const weatherSection = weatherResult ? buildWeatherPromptSection(weatherResult, "racing") : null;

    const prompt = `You are an expert horse racing handicapper with 30 years of experience at US tracks. You have access to deep race analytics including implied win probabilities, pace projections, class analysis, jockey/trainer stats, weather, news, and your model's historical accuracy. Synthesize ALL data sources.

═══ RACE INFO ═══
Race: ${race.raceName} at ${race.trackName}
Date: ${race.raceDate}
Distance: ${race.distance}${distanceFurlongs ? ` (~${distanceFurlongs} furlongs)` : ""}
Surface: ${race.surface}
Conditions: ${race.conditions || "Standard conditions"}
Purse: $${race.purse.toLocaleString()} | Field size: ${fieldSize} horses
${weatherSection ? `\n${weatherSection}` : ""}

═══ POST POSITION ANALYSIS ═══
${postPositionNote || "No specific post position bias data available."}

═══ PACE PROJECTION ═══
${paceProjection}
Pace roles by horse:
${paceRoles.map((r) => `  Post #${r.pp} ${r.name}: ${r.role}`).join("\n")}

How to use pace:
• Hot pace (3+ speed horses) favors closers — they get a free trip while speed battles up front
• Slow pace favors speed/pressers — they control the race and are not challenged
• Identify which closer has the best late kick in a hot pace scenario
• On a wet/sloppy track, pace pressure matters less — class and fitness take over

═══ MARKET IMPLIED PROBABILITIES ═══
${impliedProbLines || "  No morning line data available"}
Note: The morning line is set by the track handicapper, not the public — it reflects a professional's assessment. Horses beating their morning line (being bet down) indicate strong public/sharp confidence.

═══ JOCKEY ANALYSIS ═══
${jockeySection || "  No jockey data available"}

═══ TRAINER ANALYSIS ═══
${trainerSection || "  No trainer data available"}

═══ FULL FIELD DETAILS ═══
${entriesText}

═══ CLASS ANALYSIS ═══
Current purse: $${race.purse.toLocaleString()}
Avg earnings/start by horse (indicates class level):
${entries.map((e) => {
  const avg = avgEarningsPerStart(e);
  const classLabel = avg > race.purse * 0.3 ? "HIGH CLASS" : avg > race.purse * 0.1 ? "Competitive" : "Step up in class";
  return `  ${e.horseName}: $${Math.round(avg).toLocaleString()}/start — ${classLabel}`;
}).join("\n")}

Class note: A horse with avg earnings significantly lower than today's purse is stepping up in class (harder test). A horse well above the purse average is stepping down (easier test — positive signal).

═══ MODEL HISTORICAL PERFORMANCE ═══
${historicalSection}
${newsSection ? `\n═══ RECENT NEWS ═══\n${newsSection}\n\nNEWS ANALYSIS — complete BEFORE selecting picks:\nFor each headline:\n  • Which horse(s) or jockey is mentioned?\n  • Does it suggest a scratch, injury, track condition change, equipment change, or form reversal?\n  • Does it improve or reduce a horse's chances in THIS race?\nCapture findings in "newsInsights".` : ""}

═══ HANDICAPPING PRIORITY ORDER ═══
1. NEWS first — a confirmed scratch, injury, or equipment change overrides everything.
2. PACE second — identify the pace scenario (hot/slow) and which pace profile wins.
3. CLASS third — a sharp class drop or horse stepping up too fast is a major signal.
4. MORNING LINE / IMPLIED PROBABILITY fourth — the track handicapper's professional view.
5. FORM (recent finishes) fifth — last race finish, days since last race, layoff concerns.
6. JOCKEY/TRAINER combo sixth — a top jockey switch or hot trainer barn matters.
7. WEATHER seventh — wet tracks heavily favor certain sires/breeding, inside posts.
8. HISTORICAL MODEL accuracy last — calibrate confidence based on past performance.

When multiple sources align on the same horse → high confidence (0.75+). When pace, market, and form conflict → lower confidence (0.50–0.65) and explain.

Provide your analysis in this exact JSON format (no markdown, just JSON):
{
  "topPicks": [
    {
      "rank": 1,
      "horseName": "Horse Name",
      "postPosition": 1,
      "confidenceScore": 0.72,
      "keyFactors": [
        "PACE: Benefits from hot pace as a closer — 3 speed horses set up for late run",
        "CLASS: Stepping down from $200k race — significant class advantage",
        "JOCKEY: Top jockey switch signals connections are serious about this one",
        "FORM: Won last 2, both on dirt — surface fit is strong"
      ]
    },
    {
      "rank": 2,
      "horseName": "Horse Name",
      "postPosition": 2,
      "confidenceScore": 0.55,
      "keyFactors": ["Factor 1 with source label", "Factor 2"]
    },
    {
      "rank": 3,
      "horseName": "Horse Name",
      "postPosition": 3,
      "confidenceScore": 0.40,
      "keyFactors": ["Factor 1 with source label", "Factor 2"]
    }
  ],
  "reasoning": "5–7 sentences: lead with pace scenario, then class/form, then key jockey/trainer insight, then news findings, close with confidence calibration from historical model accuracy.",
  "newsInsights": ["Specific news impact on a horse or track conditions", "Another finding"],
  "paceAnalysis": "1-2 sentences on the projected pace shape and which type of horse it sets up for"
}`;

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
        topPicksJson: JSON.stringify({
          picks: topPicksWithIds,
          newsInsights: aiResult.newsInsights ?? [],
          weatherData: weatherResult ?? null,
          paceAnalysis: aiResult.paceAnalysis ?? null,
        }),
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
      newsInsights: aiResult.newsInsights ?? [],
      weatherData: weatherResult ?? null,
      paceAnalysis: aiResult.paceAnalysis ?? null,
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
  let weatherData: any = null;
  let paceAnalysis: string | null = null;
  try {
    const raw = JSON.parse(p.topPicksJson ?? "[]");
    if (Array.isArray(raw)) {
      topPicks = raw;
    } else {
      topPicks = raw.picks ?? [];
      newsInsights = raw.newsInsights ?? [];
      weatherData = raw.weatherData ?? null;
      paceAnalysis = raw.paceAnalysis ?? null;
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
    weatherData,
    paceAnalysis,
    wasCorrect: p.wasCorrect ?? null,
    actualWinnerId: p.actualWinnerId ?? null,
    actualWinnerName,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  };
}

export default router;
