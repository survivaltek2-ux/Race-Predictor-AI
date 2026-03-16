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

    // Fetch all three markets in one request for richer data
    const events = await fetchOddsApi(
      `/sports/${sport}/odds?regions=us&markets=h2h,spreads,totals&oddsFormat=american`
    );
    res.json(events);
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

function fmt(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}

function computeLineMovement(openingOdds: any, currentOdds: any): { summary: string; movements: any[]; spreadMovements: any[] } | null {
  try {
    // Find the same bookmaker in both snapshots for a fair comparison
    const currBookmakers: any[] = currentOdds?.bookmakers ?? [];
    const openBookmakers: any[] = openingOdds?.bookmakers ?? [];
    if (!currBookmakers.length || !openBookmakers.length) return null;

    // Try to match on bookmaker key, fall back to index 0
    const currBook = currBookmakers[0];
    const openBook = openBookmakers.find((b: any) => b.key === currBook.key) ?? openBookmakers[0];

    const openH2H    = openBook.markets?.find((m: any) => m.key === "h2h");
    const currH2H    = currBook.markets?.find((m: any) => m.key === "h2h");
    const openSpread = openBook.markets?.find((m: any) => m.key === "spreads");
    const currSpread = currBook.markets?.find((m: any) => m.key === "spreads");

    const movements: any[] = [];
    if (openH2H && currH2H) {
      for (const outcome of currH2H.outcomes) {
        const open = openH2H.outcomes.find((o: any) => o.name === outcome.name);
        if (!open) continue;
        const change = outcome.price - open.price;
        if (Math.abs(change) >= 5) {
          movements.push({ market: "moneyline", team: outcome.name, opening: open.price, current: outcome.price, change });
        }
      }
    }

    const spreadMovements: any[] = [];
    if (openSpread && currSpread) {
      for (const outcome of currSpread.outcomes) {
        const open = openSpread.outcomes.find((o: any) => o.name === outcome.name);
        if (!open) continue;
        const pointChange = (outcome.point ?? 0) - (open.point ?? 0);
        const priceChange = outcome.price - open.price;
        if (Math.abs(pointChange) >= 0.5 || Math.abs(priceChange) >= 5) {
          spreadMovements.push({
            market: "spread",
            team: outcome.name,
            openingPoint: open.point,
            currentPoint: outcome.point,
            openingPrice: open.price,
            currentPrice: outcome.price,
            pointChange,
            priceChange,
          });
        }
      }
    }

    const allMovements = [...movements, ...spreadMovements];
    if (allMovements.length === 0) return null;

    const summaryParts: string[] = [];

    if (movements.length > 0) {
      const ml = movements.map((m) => {
        const dir = m.change < 0 ? "shortened" : "drifted";
        return `${m.team} ML: ${fmt(m.opening)} → ${fmt(m.current)} (${dir} ${Math.abs(m.change)} pts)`;
      });
      summaryParts.push(ml.join("; "));
    }

    if (spreadMovements.length > 0) {
      const sp = spreadMovements.map((m) => {
        const half = m.pointChange !== 0 ? ` spread ${m.openingPoint > 0 ? "+" : ""}${m.openingPoint} → ${m.currentPoint > 0 ? "+" : ""}${m.currentPoint}` : "";
        return `${m.team}${half} (${Math.abs(m.priceChange) >= 5 ? `price ${fmt(m.openingPrice)} → ${fmt(m.currentPrice)}` : "point shift"})`;
      });
      summaryParts.push(`Spread: ${sp.join("; ")}`);
    }

    // Identify the sharp side (biggest moneyline shortening = backed = sharp)
    const sharpedMoneyline = movements.sort((a: any, b: any) => a.change - b.change)[0]; // most negative = shortened
    const sharpedSpread    = spreadMovements.sort((a: any, b: any) => a.pointChange - b.pointChange)[0]; // most negative = fewer points given = backed
    const sharpSide = sharpedMoneyline?.change < 0
      ? sharpedMoneyline.team
      : sharpedSpread?.pointChange < 0
        ? sharpedSpread.team
        : null;

    const summary = summaryParts.join(" | ") + (sharpSide ? ` — sharp action detected on ${sharpSide}` : "");
    return { summary, movements, spreadMovements };
  } catch {
    return null;
  }
}

function buildOddsSection(oddsData: any): string {
  if (!oddsData?.bookmakers?.length) return "No odds available";

  const books: any[] = oddsData.bookmakers.slice(0, 4);
  const sections: string[] = [];

  // --- Moneyline ---
  const mlLines = books.map((b: any) => {
    const m = b.markets?.find((m: any) => m.key === "h2h");
    if (!m) return null;
    const outcomes = m.outcomes.map((o: any) => `${o.name} ${fmt(o.price)}`).join(" | ");
    return `  ${b.title}: ${outcomes}`;
  }).filter(Boolean);
  if (mlLines.length) sections.push(`Moneyline:\n${mlLines.join("\n")}`);

  // --- Spread ---
  const spLines = books.map((b: any) => {
    const m = b.markets?.find((m: any) => m.key === "spreads");
    if (!m) return null;
    const outcomes = m.outcomes.map((o: any) => `${o.name} ${o.point > 0 ? "+" : ""}${o.point} (${fmt(o.price)})`).join(" | ");
    return `  ${b.title}: ${outcomes}`;
  }).filter(Boolean);
  if (spLines.length) sections.push(`Point Spread:\n${spLines.join("\n")}`);

  // --- Totals ---
  const totLines = books.map((b: any) => {
    const m = b.markets?.find((m: any) => m.key === "totals");
    if (!m) return null;
    const outcomes = m.outcomes.map((o: any) => `${o.name} ${o.point} (${fmt(o.price)})`).join(" | ");
    return `  ${b.title}: ${outcomes}`;
  }).filter(Boolean);
  if (totLines.length) sections.push(`Totals (Over/Under):\n${totLines.join("\n")}`);

  return sections.join("\n\n");
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

    const oddsLines = buildOddsSection(oddsData);

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

    const prompt = `You are an expert sports analyst and betting handicapper. You have access to live odds (moneyline, spread, totals), odds line movement, weather data, recent news, and your model's historical accuracy — all provided below. Synthesize ALL sources before reaching a conclusion.

MATCHUP: ${awayTeam} @ ${homeTeam}
SPORT: ${sportTitle}
DATE: ${new Date(commenceTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

═══ MARKET DATA ═══
${oddsLines}
${lineMovement ? `\n═══ LINE MOVEMENT (opening → current) ═══\n${lineMovement.summary}\n\nHow to use this:\n• Moneyline shortening = public/sharp money backing that team\n• Spread tightening (fewer points given) = sharps backing the favourite\n• Spread widening (more points given) = sharps backing the underdog\nA spread move of 0.5+ pts is a meaningful sharp-money signal. Weight this heavily.` : ""}
${weatherSection ? `\n═══ WEATHER ═══\n${weatherSection}\n\nHow to use this:\n• Wind 15+ mph hurts passing games (NFL, college football) — favour rush-heavy teams or the under\n• Rain reduces scoring — lean under, lean home teams\n• Extreme cold (below 30°F) reduces scoring totals by ~3–5 pts historically` : ""}
${newsSection ? `\n═══ RECENT NEWS (fact-filtered, highest signal first) ═══\n${newsSection}\n\n═══ NEWS ANALYSIS STEP (complete before selecting winner) ═══\nFor each headline:\n  1. Which team is directly affected?\n  2. Is the impact positive (return from injury, key signing) or negative (injury, suspension, lineup scratch)?\n  3. Does it change the probable outcome enough to override the odds market?\nCapture each meaningful finding concisely in "newsInsights".` : ""}

═══ HISTORICAL MODEL PERFORMANCE ═══
${historicalSection}

═══ HOW TO COMBINE ALL SOURCES ═══
Work through this hierarchy — do NOT skip steps:

1. NEWS first — a confirmed key-player injury or suspension is the single strongest signal and can override everything else.
2. LINE MOVEMENT second — spread movement of 0.5+ pts indicates sharp action; follow it unless step 1 directly contradicts.
3. MARKET CONSENSUS third — if 3+ books agree on a spread, that consensus encodes a lot of information; only fade it with strong step 1 or step 2 evidence.
4. WEATHER fourth — only meaningful for outdoor sports; primarily affects totals and running-game teams.
5. HISTORICAL accuracy last — use this to calibrate confidence UP or DOWN but not to override the pick itself.

When sources agree → high confidence. When they conflict → lower confidence and explain the conflict.
Your recommendedBet must reference the spread or total, not just the moneyline, where spread/totals data is available.

Respond ONLY with valid JSON (no markdown):
{
  "predictedWinner": "Team Name (must be exactly '${homeTeam}' or '${awayTeam}')",
  "confidenceScore": 0.72,
  "reasoning": "4–6 sentences: open with the most decisive source (news/line movement/market), then work through how each additional source confirmed or conflicted, and close with confidence calibration from historical data",
  "keyFactors": ["Source-labelled factor, e.g. NEWS: Starter ruled out", "LINE: Spread moved 1pt toward home", "WEATHER: 25mph winds hurt passing"],
  "recommendedBet": "Specific bet recommendation including spread or total line where applicable (e.g. 'KC -3.5 (-110)' or 'Under 47.5 (-105)')",
  "valueSide": "${homeTeam} or ${awayTeam}",
  "newsInsights": ["Specific impact from news item 1", "Specific impact from news item 2"]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 4096,
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
        spreadMovements: lineMovement?.spreadMovements ?? [],
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
    spreadMovements: analysis.spreadMovements ?? [],
    oddsAtPrediction: analysis.oddsAtPrediction ?? null,
    wasCorrect: p.wasCorrect ?? null,
    actualWinner: p.actualWinner ?? null,
    createdAt: p.createdAt,
  };
}

export default router;
