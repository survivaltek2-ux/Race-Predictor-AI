const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_CORE = "https://sports.core.api.espn.com/v2/sports";

const SPORT_MAP: Record<string, { sport: string; league: string }> = {
  americanfootball_nfl: { sport: "football", league: "nfl" },
  americanfootball_ncaaf: { sport: "football", league: "college-football" },
  basketball_nba: { sport: "basketball", league: "nba" },
  basketball_ncaab: { sport: "basketball", league: "mens-college-basketball" },
  baseball_mlb: { sport: "baseball", league: "mlb" },
  icehockey_nhl: { sport: "hockey", league: "nhl" },
};

async function espnGet(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SportsPredictor/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const teamIdCache = new Map<string, string>();

async function findTeamId(sport: string, league: string, teamName: string): Promise<string | null> {
  const cacheKey = `${sport}/${league}/${teamName}`;
  if (teamIdCache.has(cacheKey)) return teamIdCache.get(cacheKey)!;

  const data = await espnGet(`${ESPN_BASE}/${sport}/${league}/teams?limit=200`);
  const teams: any[] = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];

  const normalized = teamName.toLowerCase();
  const match = teams.find((t: any) => {
    const tn = t.team;
    return (
      tn.displayName?.toLowerCase() === normalized ||
      tn.name?.toLowerCase() === normalized ||
      tn.shortDisplayName?.toLowerCase() === normalized ||
      tn.abbreviation?.toLowerCase() === normalized ||
      tn.displayName?.toLowerCase().includes(normalized) ||
      normalized.includes(tn.name?.toLowerCase() ?? "____")
    );
  });

  if (!match) return null;
  const id: string = match.team.id;
  teamIdCache.set(cacheKey, id);
  return id;
}

export interface TeamStats {
  name: string;
  wins: number;
  losses: number;
  gamesPlayed: number;
  winPct: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
  pointDiff: number;
  homeRecord: string;
  awayRecord: string;
  last5: string;
  last5Detail: string[];
  restDays: number | null;
  keyInjuries: { name: string; position: string; status: string }[];
  streak: string;
}

export interface MatchupStats {
  home: TeamStats | null;
  away: TeamStats | null;
  error?: string;
}

async function getTeamRecord(
  sport: string,
  league: string,
  teamId: string,
  teamName: string
): Promise<Omit<TeamStats, "last5" | "last5Detail" | "restDays" | "keyInjuries" | "streak">> {
  const data = await espnGet(`${ESPN_BASE}/${sport}/${league}/teams/${teamId}`);
  const record = data?.team?.record?.items ?? [];

  const overall = record.find((r: any) => r.type === "total" || r.description === "Overall") ?? record[0];
  const homeRec = record.find((r: any) => r.type === "home" || r.description === "Home");
  const awayRec = record.find((r: any) => r.type === "road" || r.description === "Away");

  const stat = (items: any[], name: string): number => {
    const s = items?.find((s: any) => s.name === name);
    return s ? Number(s.value) : 0;
  };

  const os = overall?.stats ?? [];
  const wins = stat(os, "wins");
  const losses = stat(os, "losses");
  const gamesPlayed = stat(os, "gamesPlayed") || wins + losses;
  const winPct = gamesPlayed > 0 ? wins / gamesPlayed : 0;
  const avgPF = stat(os, "avgPointsFor") || stat(os, "pointsFor") / (gamesPlayed || 1);
  const avgPA = stat(os, "avgPointsAgainst") || stat(os, "pointsAgainst") / (gamesPlayed || 1);
  const pointDiff = stat(os, "differential") || (avgPF - avgPA) * gamesPlayed;

  const fmtRecord = (r: any) => {
    if (!r?.stats) return "N/A";
    const w = stat(r.stats, "wins");
    const l = stat(r.stats, "losses");
    return `${w}-${l}`;
  };

  return {
    name: teamName,
    wins,
    losses,
    gamesPlayed,
    winPct,
    avgPointsFor: avgPF,
    avgPointsAgainst: avgPA,
    pointDiff,
    homeRecord: fmtRecord(homeRec),
    awayRecord: fmtRecord(awayRec),
  };
}

async function getRecentForm(
  sport: string,
  league: string,
  teamId: string,
  count = 5
): Promise<{ last5: string; last5Detail: string[]; restDays: number | null; streak: string }> {
  const data = await espnGet(`${ESPN_BASE}/${sport}/${league}/teams/${teamId}/schedule`);
  const events: any[] = data?.events ?? [];

  const completed = events
    .filter((e: any) => e.competitions?.[0]?.status?.type?.completed)
    .slice(-count);

  const results: string[] = [];
  const details: string[] = [];
  let streakCount = 0;
  let streakType = "";

  for (const ev of completed) {
    const comp = ev.competitions?.[0];
    const competitors: any[] = comp?.competitors ?? [];
    const us = competitors.find((c: any) => c.team?.id === teamId);
    const them = competitors.find((c: any) => c.team?.id !== teamId);
    if (!us || !them) continue;

    const won = us.winner === true;
    const score = `${us.score}-${them.score}`;
    const oppName = them.team?.abbreviation ?? "OPP";
    const isHome = us.homeAway === "home";
    const loc = isHome ? "vs" : "@";
    results.push(won ? "W" : "L");
    details.push(`${won ? "W" : "L"} ${loc} ${oppName} ${score}`);
  }

  if (results.length > 0) {
    const last = results[results.length - 1];
    streakType = last;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i] === streakType) streakCount++;
      else break;
    }
  }

  const streak = streakCount > 0 ? `${streakCount}${streakType === "W" ? "-game win" : "-game losing"} streak` : "";

  let restDays: number | null = null;
  const lastGame = events.filter((e: any) => e.competitions?.[0]?.status?.type?.completed).slice(-1)[0];
  if (lastGame) {
    const lastDate = new Date(lastGame.date);
    restDays = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
  }

  return {
    last5: results.join("-"),
    last5Detail: details,
    restDays,
    streak,
  };
}

async function getInjuries(
  sport: string,
  league: string,
  teamId: string
): Promise<{ name: string; position: string; status: string }[]> {
  const data = await espnGet(
    `${ESPN_BASE}/${sport}/${league}/teams/${teamId}?enable=injuries`
  );
  const injuries: any[] = data?.team?.injuries ?? [];

  return injuries
    .filter((i: any) => {
      const status = i.status?.toLowerCase?.() ?? "";
      return status === "out" || status === "questionable" || status === "doubtful";
    })
    .slice(0, 8)
    .map((i: any) => ({
      name: i.athlete?.displayName ?? "Unknown",
      position: i.athlete?.position?.abbreviation ?? "?",
      status: i.status ?? "Unknown",
    }));
}

export async function fetchMatchupStats(
  sportKey: string,
  homeTeam: string,
  awayTeam: string
): Promise<MatchupStats> {
  const mapping = SPORT_MAP[sportKey];
  if (!mapping) return { home: null, away: null, error: `No ESPN mapping for sport: ${sportKey}` };

  const { sport, league } = mapping;

  const [homeId, awayId] = await Promise.all([
    findTeamId(sport, league, homeTeam),
    findTeamId(sport, league, awayTeam),
  ]);

  if (!homeId && !awayId) return { home: null, away: null, error: "Teams not found in ESPN" };

  const [homeData, awayData] = await Promise.all([
    homeId
      ? Promise.all([
          getTeamRecord(sport, league, homeId, homeTeam),
          getRecentForm(sport, league, homeId),
          getInjuries(sport, league, homeId),
        ])
      : Promise.resolve(null),
    awayId
      ? Promise.all([
          getTeamRecord(sport, league, awayId, awayTeam),
          getRecentForm(sport, league, awayId),
          getInjuries(sport, league, awayId),
        ])
      : Promise.resolve(null),
  ]);

  const buildStats = (
    base: Omit<TeamStats, "last5" | "last5Detail" | "restDays" | "keyInjuries" | "streak"> | null,
    form: { last5: string; last5Detail: string[]; restDays: number | null; streak: string } | null,
    injuries: { name: string; position: string; status: string }[] | null
  ): TeamStats | null => {
    if (!base) return null;
    return {
      ...base,
      last5: form?.last5 ?? "",
      last5Detail: form?.last5Detail ?? [],
      restDays: form?.restDays ?? null,
      streak: form?.streak ?? "",
      keyInjuries: injuries ?? [],
    };
  };

  return {
    home: homeData ? buildStats(homeData[0], homeData[1], homeData[2]) : null,
    away: awayData ? buildStats(awayData[0], awayData[1], awayData[2]) : null,
  };
}

export function buildTeamStatsSection(stats: MatchupStats, homeTeam: string, awayTeam: string): string {
  const lines: string[] = ["═══ TEAM STATISTICS (ESPN) ═══"];

  const fmtTeam = (t: TeamStats | null, label: string, isHome: boolean): string[] => {
    if (!t) return [`${label}: Data unavailable`];
    const out: string[] = [];
    out.push(`${label} (${isHome ? "HOME" : "AWAY"}):`);
    out.push(`  Record: ${t.wins}-${t.losses} (${(t.winPct * 100).toFixed(1)}% win rate) | Home: ${t.homeRecord} | Away: ${t.awayRecord}`);
    out.push(`  Scoring: ${t.avgPointsFor.toFixed(1)} pts/gm scored, ${t.avgPointsAgainst.toFixed(1)} pts/gm allowed (diff: ${t.pointDiff >= 0 ? "+" : ""}${t.pointDiff.toFixed(0)})`);
    if (t.last5) {
      out.push(`  Last 5 games: ${t.last5} — ${t.last5Detail.join(", ")}`);
    }
    if (t.streak) out.push(`  Streak: ${t.streak}`);
    if (t.restDays !== null) {
      const restNote = t.restDays <= 1 ? " ⚠ back-to-back" : t.restDays >= 7 ? " (well-rested)" : "";
      out.push(`  Rest: ${t.restDays} days since last game${restNote}`);
    }
    if (t.keyInjuries.length > 0) {
      out.push(`  Injury Report:`);
      t.keyInjuries.forEach((i) => out.push(`    • ${i.name} (${i.position}) — ${i.status}`));
    } else {
      out.push(`  Injury Report: No significant injuries reported`);
    }
    return out;
  };

  const homeLines = fmtTeam(stats.home, homeTeam, true);
  const awayLines = fmtTeam(stats.away, awayTeam, false);

  return [...lines, ...homeLines, "", ...awayLines].join("\n");
}

export function buildTeamStatsAnalysisGuide(): string {
  return `How to use Team Statistics:
• Home/away record is especially important — some teams perform drastically differently
• Back-to-back games (rest ≤ 1 day) historically reduce win probability by 5-8%
• Teams on 3+ game losing streaks often have underlying issues not visible in odds
• Injury report: "Out" players reduce team ability significantly; "Questionable" adds uncertainty
• Point differential (scored vs allowed) is a stronger predictor than win-loss record alone
• A team averaging 10+ more pts/gm than they allow is a strong favourite signal`;
}
