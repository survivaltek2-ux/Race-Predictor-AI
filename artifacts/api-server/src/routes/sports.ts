import { Router, type IRouter } from "express";
import { db, sportsPredictionsTable, sportsEventsTable } from "@workspace/db";
import { eq, desc, and, or } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { fetchTeamNews } from "../utils/news";
import { fetchWeather, getVenueCoords, buildWeatherPromptSection, OUTDOOR_SPORT_KEYS } from "../utils/weather";
import { fetchMatchupStats, buildTeamStatsSection, buildTeamStatsAnalysisGuide } from "../utils/teamStats";

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

function americanToImplied(price: number): number {
  if (price > 0) return 100 / (price + 100);
  return Math.abs(price) / (Math.abs(price) + 100);
}

function computeLineMovement(openingOdds: any, currentOdds: any): { summary: string; movements: any[]; spreadMovements: any[] } | null {
  try {
    const currBookmakers: any[] = currentOdds?.bookmakers ?? [];
    const openBookmakers: any[] = openingOdds?.bookmakers ?? [];
    if (!currBookmakers.length || !openBookmakers.length) return null;

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

    const sharpedMoneyline = movements.sort((a: any, b: any) => a.change - b.change)[0];
    const sharpedSpread    = spreadMovements.sort((a: any, b: any) => a.pointChange - b.pointChange)[0];
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

function buildOddsSection(oddsData: any, homeTeam: string, awayTeam: string): string {
  if (!oddsData?.bookmakers?.length) return "No odds available";

  const books: any[] = oddsData.bookmakers;
  const sections: string[] = [];

  // --- Moneyline with implied probability + consensus ---
  const mlLines: string[] = [];
  const homeImpliedArr: number[] = [];
  const awayImpliedArr: number[] = [];

  for (const b of books.slice(0, 5)) {
    const m = b.markets?.find((m: any) => m.key === "h2h");
    if (!m) continue;
    const homeOut = m.outcomes.find((o: any) => o.name === homeTeam);
    const awayOut = m.outcomes.find((o: any) => o.name === awayTeam);
    if (homeOut && awayOut) {
      homeImpliedArr.push(americanToImplied(homeOut.price));
      awayImpliedArr.push(americanToImplied(awayOut.price));
    }
    const outcomes = m.outcomes.map((o: any) => `${o.name} ${fmt(o.price)}`).join(" | ");
    mlLines.push(`  ${b.title}: ${outcomes}`);
  }

  if (mlLines.length) {
    const avgHomeImplied = homeImpliedArr.length
      ? (homeImpliedArr.reduce((a, b) => a + b, 0) / homeImpliedArr.length * 100).toFixed(1)
      : null;
    const avgAwayImplied = awayImpliedArr.length
      ? (awayImpliedArr.reduce((a, b) => a + b, 0) / awayImpliedArr.length * 100).toFixed(1)
      : null;
    const consensusStr = avgHomeImplied && avgAwayImplied
      ? `  Market consensus implied probability: ${homeTeam} ${avgHomeImplied}% | ${awayTeam} ${avgAwayImplied}%`
      : "";
    sections.push(`Moneyline (${books.length} bookmakers):\n${mlLines.join("\n")}${consensusStr ? "\n" + consensusStr : ""}`);
  }

  // --- Spread with consensus ---
  const spLines: string[] = [];
  const homeSpreadArr: number[] = [];
  for (const b of books.slice(0, 5)) {
    const m = b.markets?.find((m: any) => m.key === "spreads");
    if (!m) continue;
    const homeSpread = m.outcomes.find((o: any) => o.name === homeTeam);
    if (homeSpread?.point != null) homeSpreadArr.push(homeSpread.point);
    const outcomes = m.outcomes.map((o: any) => `${o.name} ${o.point > 0 ? "+" : ""}${o.point} (${fmt(o.price)})`).join(" | ");
    spLines.push(`  ${b.title}: ${outcomes}`);
  }
  if (spLines.length) {
    const consensusSpread = homeSpreadArr.length
      ? (homeSpreadArr.reduce((a, b) => a + b, 0) / homeSpreadArr.length).toFixed(1)
      : null;
    const spreadStr = consensusSpread
      ? `  Consensus spread: ${homeTeam} ${Number(consensusSpread) > 0 ? "+" : ""}${consensusSpread}`
      : "";
    sections.push(`Point Spread:\n${spLines.join("\n")}${spreadStr ? "\n" + spreadStr : ""}`);
  }

  // --- Totals with consensus ---
  const totLines: string[] = [];
  const totalArr: number[] = [];
  for (const b of books.slice(0, 5)) {
    const m = b.markets?.find((m: any) => m.key === "totals");
    if (!m) continue;
    const over = m.outcomes.find((o: any) => o.name === "Over");
    if (over?.point != null) totalArr.push(over.point);
    const outcomes = m.outcomes.map((o: any) => `${o.name} ${o.point} (${fmt(o.price)})`).join(" | ");
    totLines.push(`  ${b.title}: ${outcomes}`);
  }
  if (totLines.length) {
    const consensusTotal = totalArr.length
      ? (totalArr.reduce((a, b) => a + b, 0) / totalArr.length).toFixed(1)
      : null;
    const totalStr = consensusTotal ? `  Consensus total: ${consensusTotal}` : "";
    sections.push(`Totals (Over/Under):\n${totLines.join("\n")}${totalStr ? "\n" + totalStr : ""}`);
  }

  // --- Market efficiency: vig / juice indicator ---
  const firstBook = books[0];
  const h2hMkt = firstBook?.markets?.find((m: any) => m.key === "h2h");
  if (h2hMkt) {
    const totalImplied = h2hMkt.outcomes.reduce((sum: number, o: any) => sum + americanToImplied(o.price), 0);
    const vig = ((totalImplied - 1) * 100).toFixed(2);
    sections.push(`Market vig (overround): ${vig}% — ${Number(vig) < 4 ? "tight market (efficient)" : "wider market (less efficient)"}`);
  }

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

    // Fetch all data in parallel for speed
    const [
      teamStatsResult,
      weatherResult,
      newsSection,
      allSportPreds,
      teamPreds,
    ] = await Promise.all([
      fetchMatchupStats(sportKey, homeTeam, awayTeam).catch(() => ({ home: null, away: null })),
      getVenueCoords(homeTeam, sportKey)
        ? fetchWeather(getVenueCoords(homeTeam, sportKey)![0], getVenueCoords(homeTeam, sportKey)![1]).catch(() => null)
        : Promise.resolve(null),
      fetchTeamNews(homeTeam, awayTeam, sportTitle).catch(() => null),
      db
        .select({ wasCorrect: sportsPredictionsTable.wasCorrect, confidenceScore: sportsPredictionsTable.confidenceScore, predictedWinner: sportsPredictionsTable.predictedWinner })
        .from(sportsPredictionsTable)
        .where(eq(sportsPredictionsTable.sportKey, sportKey)),
      db
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
        .limit(10),
    ]);

    const weatherSection = weatherResult ? buildWeatherPromptSection(weatherResult, "sports") : null;
    const oddsLines = buildOddsSection(oddsData, homeTeam, awayTeam);

    // Historical model performance
    const resolvedSport = allSportPreds.filter((p) => p.wasCorrect !== null);
    const sportCorrect = resolvedSport.filter((p) => p.wasCorrect).length;
    const sportAccuracy = resolvedSport.length > 0
      ? ((sportCorrect / resolvedSport.length) * 100).toFixed(1)
      : null;
    const sportAvgConf = resolvedSport.length > 0
      ? (resolvedSport.reduce((s, p) => s + p.confidenceScore, 0) / resolvedSport.length * 100).toFixed(1)
      : null;

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

    const teamStatsSection = buildTeamStatsSection(teamStatsResult, homeTeam, awayTeam);
    const teamStatsGuide = buildTeamStatsAnalysisGuide();

    // Rest days advantage analysis
    const homeRest = teamStatsResult.home?.restDays;
    const awayRest = teamStatsResult.away?.restDays;
    let restAdvantageNote = "";
    if (homeRest !== null && homeRest !== undefined && awayRest !== null && awayRest !== undefined) {
      const diff = homeRest - awayRest;
      if (Math.abs(diff) >= 2) {
        const rested = diff > 0 ? homeTeam : awayTeam;
        const fatigued = diff > 0 ? awayTeam : homeTeam;
        restAdvantageNote = `\n⚡ REST ADVANTAGE: ${rested} has ${Math.abs(diff)} more rest days than ${fatigued} — historical data shows teams with significant rest advantage win ~55-60% of matchups`;
      }
    }

    const prompt = `You are an expert sports analyst and professional handicapper. You have access to live odds (with implied probabilities and bookmaker consensus), line movement (sharp money signals), detailed team statistics from ESPN, injury reports, weather data, recent news, and your model's historical accuracy. Synthesize ALL sources before reaching a conclusion.

MATCHUP: ${awayTeam} @ ${homeTeam}
SPORT: ${sportTitle}
DATE: ${new Date(commenceTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

${teamStatsSection}${restAdvantageNote}

${teamStatsGuide}

═══ MARKET DATA (${oddsData?.bookmakers?.length ?? 0} bookmakers) ═══
${oddsLines}
${lineMovement ? `\n═══ LINE MOVEMENT (opening → current) ═══\n${lineMovement.summary}\n\nHow to use this:\n• Moneyline shortening = public/sharp money backing that team\n• Spread tightening (fewer points given) = sharps backing the favourite\n• Spread widening (more points given) = sharps backing the underdog\nA spread move of 0.5+ pts is a meaningful sharp-money signal. Weight this heavily.` : ""}
${weatherSection ? `\n═══ WEATHER ═══\n${weatherSection}\n\nHow to use this:\n• Wind 15+ mph hurts passing games (NFL, college football) — favour rush-heavy teams or the under\n• Rain reduces scoring — lean under, lean home teams\n• Extreme cold (below 30°F) reduces scoring totals by ~3–5 pts historically` : ""}
${newsSection ? `\n═══ RECENT NEWS (fact-filtered, highest signal first) ═══\n${newsSection}\n\n═══ NEWS ANALYSIS STEP (complete before selecting winner) ═══\nFor each headline:\n  1. Which team is directly affected?\n  2. Is the impact positive (return from injury, key signing) or negative (injury, suspension, lineup scratch)?\n  3. Does it change the probable outcome enough to override the odds market?\nCapture each meaningful finding concisely in "newsInsights".` : ""}

═══ HISTORICAL MODEL PERFORMANCE ═══
${historicalSection}

═══ HOW TO COMBINE ALL SOURCES ═══
Work through this hierarchy — do NOT skip steps:

1. INJURY REPORT first — a key starter listed "Out" is the single strongest signal and can override everything else. Cross-reference injury report with news.
2. LINE MOVEMENT second — spread movement of 0.5+ pts indicates sharp action; follow it unless step 1 directly contradicts.
3. TEAM STATS third — point differential, home/away splits, recent form (last 5 games), and rest advantage are strong indicators. A team on a 3+ game losing streak has underlying issues.
4. MARKET CONSENSUS fourth — if 3+ books agree on a spread, that consensus encodes significant information; only fade it with strong evidence from steps 1-3.
5. WEATHER fifth — only meaningful for outdoor sports; primarily affects totals and running-game teams.
6. NEWS sixth — corroborates or conflicts with what the market already knows.
7. HISTORICAL accuracy last — use this to calibrate confidence UP or DOWN but not to override the pick itself.

When ALL sources agree → high confidence (0.75+). When 2+ sources conflict → lower confidence (0.55-0.65) and explain the conflict clearly.
Your recommendedBet must reference the spread or total, not just the moneyline, where spread/totals data is available.

Respond ONLY with valid JSON (no markdown):
{
  "predictedWinner": "Team Name (must be exactly '${homeTeam}' or '${awayTeam}')",
  "confidenceScore": 0.72,
  "reasoning": "5–7 sentences: open with the most decisive source (injury/line movement/stats), work through how each source confirmed or conflicted, note any rest or home/away advantage, close with confidence calibration",
  "keyFactors": [
    "STATS: Team A averages 12 more pts/gm than allowed — elite scoring differential",
    "INJURY: Starting QB listed Out — massive impact on passing game",
    "LINE: Spread moved 1.5pts toward home — sharp money signal",
    "FORM: Away team on 4-game losing streak with back-to-back fatigue",
    "WEATHER: 25mph winds expected — hurt passing, favour under"
  ],
  "recommendedBet": "Specific bet including spread or total (e.g. 'KC -3.5 (-110)' or 'Under 47.5 (-105)')",
  "valueSide": "${homeTeam} or ${awayTeam}",
  "newsInsights": ["Specific news impact 1", "Specific news impact 2"],
  "confidenceFactors": {
    "boosts": ["Factor that increased confidence", "Another boost"],
    "reducers": ["Factor that introduced uncertainty", "Another reducer"]
  }
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
        confidenceFactors: parsed.confidenceFactors || null,
        oddsAtPrediction: oddsData,
        weatherData: weatherResult ?? null,
        lineMovement: lineMovement ?? null,
        spreadMovements: lineMovement?.spreadMovements ?? [],
        teamStats: {
          home: teamStatsResult.home,
          away: teamStatsResult.away,
        },
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

    res.json({ predictions: rows.map(formatSportsPrediction) });
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

router.post("/sports/predictions/:id/feedback", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { feedback, type } = req.body;

    if (!feedback || !type) {
      return res.status(400).json({ error: "feedback and type are required" });
    }

    // Log feedback for training purposes (in a real app, this would train the model)
    console.log(`[AI TRAINING] Prediction ${id}: ${type} - ${feedback}`);

    res.json({ success: true, message: "Feedback received and logged for AI training" });
  } catch (err) {
    console.error("Error recording feedback:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sports/predictions/stats", async (req, res) => {
  try {
    const sportKey = req.query.sport as string | undefined;
    let all = await db.select().from(sportsPredictionsTable);
    
    if (sportKey) all = all.filter((p) => p.sportKey === sportKey);
    
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
    confidenceFactors: analysis.confidenceFactors ?? null,
    weatherData: analysis.weatherData ?? null,
    lineMovement: analysis.lineMovement ?? null,
    spreadMovements: analysis.spreadMovements ?? [],
    oddsAtPrediction: analysis.oddsAtPrediction ?? null,
    teamStats: analysis.teamStats ?? null,
    wasCorrect: p.wasCorrect ?? null,
    actualWinner: p.actualWinner ?? null,
    createdAt: p.createdAt,
  };
}

export default router;
