interface TeamRecord {
  wins: number;
  losses: number;
  ties?: number;
  pointsFor: number;
  pointsAgainst: number;
  powerRating: number;
  elo: number;
  recentForm: number[]; // 1 = win, 0 = loss, 0.5 = draw (last 10 games)
  daysSinceLastGame: number;
}

interface MLSportsPrediction {
  homeWinProb: number;
  awayWinProb: number;
  drawProb: number;
  projectedTotal: number;
  algorithmBreakdown: AlgorithmResult[];
  ensembleWeights: Record<string, number>;
}

interface AlgorithmResult {
  name: string;
  description: string;
  homeWinProb: number;
  awayWinProb: number;
  drawProb: number;
  projectedTotal: number;
  weight: number;
  confidence: number;
  insights: string[];
}

function isSoccer(sport: string): boolean {
  return sport.includes("soccer");
}

function parseRecentForm(last10Str: string): number[] {
  if (!last10Str) return [];
  return last10Str
    .split("-")
    .slice(0, 10)
    .map((r) => {
      if (r === "W") return 1;
      if (r === "L") return 0;
      if (r === "D") return 0.5;
      return 0;
    })
    .reverse();
}

function ensureFinite(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}

function teamStrengthModel(
  home: TeamRecord,
  away: TeamRecord,
  sport: string
): AlgorithmResult {
  const homeStrength = home.powerRating;
  const awayStrength = away.powerRating;
  const diff = homeStrength - awayStrength;

  let homeWinProb = 0;
  let awayWinProb = 0;
  let drawProb = 0;

  if (isSoccer(sport)) {
    homeWinProb = 0.35 + diff * 0.015;
    awayWinProb = 0.25 + diff * -0.015;
    drawProb = 0.4 - Math.abs(diff) * 0.005;
  } else {
    homeWinProb = 0.51 + diff * 0.02;
    awayWinProb = 0.49 - diff * 0.02;
  }

  homeWinProb = Math.max(0.05, Math.min(0.95, homeWinProb));
  awayWinProb = Math.max(0.05, Math.min(0.95, awayWinProb));
  drawProb = Math.max(0, Math.min(0.5, drawProb));

  if (!isSoccer(sport)) {
    const total = homeWinProb + awayWinProb;
    homeWinProb /= total;
    awayWinProb /= total;
    drawProb = 0;
  }

  const projectedTotal =
    home.pointsFor / Math.max(1, Math.max(home.wins + home.losses)) +
    away.pointsAgainst / Math.max(1, Math.max(away.wins + away.losses));

  const insights: string[] = [];
  if (diff > 5) insights.push(`Home team significantly stronger (+${diff.toFixed(1)} power rating)`);
  else if (diff < -5) insights.push(`Away team significantly stronger (${diff.toFixed(1)} power rating)`);
  else insights.push(`Teams evenly matched (${Math.abs(diff).toFixed(1)} power diff)`);

  const confidence = Math.min(0.85, 0.5 + Math.abs(diff) * 0.05);

  return {
    name: "Team Strength Model",
    description: "Compares power ratings and baseline team quality",
    homeWinProb,
    awayWinProb,
    drawProb,
    projectedTotal,
    weight: 0.3,
    confidence,
    insights,
  };
}

function formMomentumAnalysis(
  home: TeamRecord,
  away: TeamRecord,
  sport: string
): AlgorithmResult {
  const homeRecentForm = home.recentForm.slice(0, 5);
  const awayRecentForm = away.recentForm.slice(0, 5);

  const homeForm = homeRecentForm.length > 0 ? homeRecentForm.reduce((a, b) => a + b, 0) / homeRecentForm.length : 0.5;
  const awayForm = awayRecentForm.length > 0 ? awayRecentForm.reduce((a, b) => a + b, 0) / awayRecentForm.length : 0.5;

  const formDiff = homeForm - awayForm;

  let homeWinProb = 0;
  let awayWinProb = 0;
  let drawProb = 0;

  if (isSoccer(sport)) {
    homeWinProb = 0.35 + formDiff * 0.15;
    awayWinProb = 0.25 - formDiff * 0.15;
    drawProb = 0.4 - Math.abs(formDiff) * 0.1;
  } else {
    homeWinProb = 0.51 + formDiff * 0.2;
    awayWinProb = 0.49 - formDiff * 0.2;
  }

  homeWinProb = Math.max(0.05, Math.min(0.95, homeWinProb));
  awayWinProb = Math.max(0.05, Math.min(0.95, awayWinProb));
  drawProb = Math.max(0, Math.min(0.5, drawProb));

  if (!isSoccer(sport)) {
    const total = homeWinProb + awayWinProb;
    homeWinProb /= total;
    awayWinProb /= total;
    drawProb = 0;
  }

  const projectedTotal = home.pointsFor + away.pointsAgainst;

  const insights: string[] = [];
  const homeWinPct = (homeForm * 100).toFixed(0);
  const awayWinPct = (awayForm * 100).toFixed(0);
  insights.push(`Home form: ${homeWinPct}% (last 5)`);
  insights.push(`Away form: ${awayWinPct}% (last 5)`);

  const confidence = 0.5 + Math.abs(formDiff) * 0.3;

  return {
    name: "Form Momentum",
    description: "Analyzes recent win/loss streaks and team momentum",
    homeWinProb,
    awayWinProb,
    drawProb,
    projectedTotal,
    weight: 0.25,
    confidence: Math.min(0.9, confidence),
    insights,
  };
}

function headToHeadAnalysis(
  home: TeamRecord,
  away: TeamRecord,
  sport: string,
  h2hRecord?: { homeWins: number; awayWins: number; draws: number }
): AlgorithmResult {
  const h2h = h2hRecord ?? { homeWins: 0, awayWins: 0, draws: 0 };
  const totalMatches = (h2h.homeWins ?? 0) + (h2h.awayWins ?? 0) + (h2h.draws ?? 0);

  let homeWinProb = 0;
  let awayWinProb = 0;
  let drawProb = 0;

  if (totalMatches > 0) {
    homeWinProb = (h2h.homeWins ?? 0) / totalMatches;
    awayWinProb = (h2h.awayWins ?? 0) / totalMatches;
    drawProb = (h2h.draws ?? 0) / totalMatches;
  } else {
    homeWinProb = isSoccer(sport) ? 0.35 : 0.51;
    awayWinProb = isSoccer(sport) ? 0.25 : 0.49;
    drawProb = isSoccer(sport) ? 0.4 : 0;
  }

  const gamesPlayed = Math.max(1, (home.wins ?? 0) + (home.losses ?? 0));
  const projectedTotal = (home.pointsFor ?? 0) / gamesPlayed + (away.pointsAgainst ?? 0) / Math.max(1, (away.wins ?? 0) + (away.losses ?? 0));

  const insights: string[] = [];
  if (totalMatches > 0) {
    insights.push(`H2H: Home ${h2h.homeWins}W-${h2h.awayWins}L${h2h.draws > 0 ? `-${h2h.draws}D` : ""} (last 3 seasons)`);
    if (homeWinProb > 0.6) insights.push("Home team dominates historically");
    else if (awayWinProb > 0.6) insights.push("Away team performs well in series");
  } else {
    insights.push("Insufficient H2H data — using baseline");
  }

  const confidence = Math.min(0.8, 0.4 + (totalMatches / 10) * 0.3);

  return {
    name: "Head-to-Head Analysis",
    description: "Historical matchup results from past 3 seasons",
    homeWinProb,
    awayWinProb,
    drawProb,
    projectedTotal,
    weight: 0.2,
    confidence,
    insights,
  };
}

function restAndFatigueModel(
  home: TeamRecord,
  away: TeamRecord,
  sport: string
): AlgorithmResult {
  const restAdvantage = (away.daysSinceLastGame ?? 2) - (home.daysSinceLastGame ?? 2);

  let homeWinProb = 0;
  let awayWinProb = 0;
  let drawProb = 0;

  if (isSoccer(sport)) {
    homeWinProb = 0.35 - restAdvantage * 0.02;
    awayWinProb = 0.25 + restAdvantage * 0.02;
    drawProb = 0.4;
  } else {
    homeWinProb = 0.51 - restAdvantage * 0.03;
    awayWinProb = 0.49 + restAdvantage * 0.03;
  }

  homeWinProb = Math.max(0.05, Math.min(0.95, homeWinProb));
  awayWinProb = Math.max(0.05, Math.min(0.95, awayWinProb));

  if (!isSoccer(sport)) {
    const total = homeWinProb + awayWinProb;
    homeWinProb /= total;
    awayWinProb /= total;
    drawProb = 0;
  }

  const projectedTotal = (home.pointsFor ?? 0) + (away.pointsAgainst ?? 0);

  const insights: string[] = [];
  if (Math.abs(restAdvantage) > 1) {
    if (restAdvantage > 0) {
      insights.push(`Away team has rest advantage (${restAdvantage.toFixed(1)} days)`);
    } else {
      insights.push(`Home team has rest advantage (${Math.abs(restAdvantage).toFixed(1)} days)`);
    }
  } else {
    insights.push("Both teams similarly rested");
  }

  const confidence = 0.5 + Math.min(0.3, Math.abs(restAdvantage) * 0.15);

  return {
    name: "Rest & Fatigue",
    description: "Models impact of rest days and travel fatigue",
    homeWinProb,
    awayWinProb,
    drawProb,
    projectedTotal,
    weight: 0.15,
    confidence,
    insights,
  };
}

function eloRatingModel(
  home: TeamRecord,
  away: TeamRecord,
  sport: string
): AlgorithmResult {
  const eloDiff = (home.elo ?? 1500) - (away.elo ?? 1500);

  let homeWinProb = 1 / (1 + Math.pow(10, -eloDiff / 400));
  let awayWinProb = 1 - homeWinProb;
  let drawProb = 0;

  if (isSoccer(sport)) {
    drawProb = 0.25;
    homeWinProb = (homeWinProb * 0.75) + 0.05;
    awayWinProb = (awayWinProb * 0.75) + 0.05;
  }

  const projectedTotal = (home.pointsFor ?? 0) + (away.pointsAgainst ?? 0);

  const insights: string[] = [];
  if (Math.abs(eloDiff) > 50) {
    if (eloDiff > 0) {
      insights.push(`Home team significantly higher rated (+${eloDiff} Elo)`);
    } else {
      insights.push(`Away team significantly higher rated (${eloDiff} Elo)`);
    }
  } else {
    insights.push(`Teams closely matched (${Math.abs(eloDiff)} Elo diff)`);
  }

  const confidence = Math.min(0.85, 0.55 + Math.abs(eloDiff) / 400 * 0.3);

  return {
    name: "Elo Rating",
    description: "Statistical rating system accounting for strength over time",
    homeWinProb,
    awayWinProb,
    drawProb,
    projectedTotal,
    weight: 0.1,
    confidence,
    insights,
  };
}

export async function predictSportsML(
  home: TeamRecord,
  away: TeamRecord,
  sport: string,
  h2hRecord?: { homeWins: number; awayWins: number; draws: number }
): Promise<MLSportsPrediction> {
  const results: AlgorithmResult[] = [];

  results.push(teamStrengthModel(home, away, sport));
  results.push(formMomentumAnalysis(home, away, sport));
  results.push(headToHeadAnalysis(home, away, sport, h2hRecord));
  results.push(restAndFatigueModel(home, away, sport));
  results.push(eloRatingModel(home, away, sport));

  const weights = results.reduce((acc, r) => {
    acc[r.name] = r.weight;
    return acc;
  }, {} as Record<string, number>);

  let homeWinProb = 0;
  let awayWinProb = 0;
  let drawProb = 0;
  let projectedTotal = 0;

  results.forEach((result) => {
    homeWinProb += result.homeWinProb * result.weight;
    awayWinProb += result.awayWinProb * result.weight;
    drawProb += result.drawProb * result.weight;
    projectedTotal += result.projectedTotal * result.weight;
  });

  const total = homeWinProb + awayWinProb + drawProb;
  homeWinProb /= total;
  awayWinProb /= total;
  drawProb /= total;

  if (!isSoccer(sport)) {
    drawProb = 0;
    const total = homeWinProb + awayWinProb;
    homeWinProb /= total;
    awayWinProb /= total;
  }

  return {
    homeWinProb,
    awayWinProb,
    drawProb,
    projectedTotal,
    algorithmBreakdown: results,
    ensembleWeights: weights,
  };
}
