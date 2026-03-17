const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_CORE = "https://sports.core.api.espn.com/v2/sports";

const SPORT_MAP: Record<string, { sport: string; league: string }> = {
  americanfootball_nfl: { sport: "football", league: "nfl" },
  americanfootball_ncaaf: { sport: "football", league: "college-football" },
  basketball_nba: { sport: "basketball", league: "nba" },
  basketball_ncaab: { sport: "basketball", league: "mens-college-basketball" },
  basketball_wncaab: { sport: "basketball", league: "womens-college-basketball" },
  basketball_euroleague: { sport: "basketball", league: "euroleague" },
  baseball_mlb: { sport: "baseball", league: "mlb" },
  baseball_mlb_preseason: { sport: "baseball", league: "mlb" },
  baseball_ncaa: { sport: "baseball", league: "college-baseball" },
  icehockey_nhl: { sport: "hockey", league: "nhl" },
  icehockey_ahl: { sport: "hockey", league: "ahl" },
  soccer_epl: { sport: "soccer", league: "eng.1" },
  soccer_england_league1: { sport: "soccer", league: "eng.3" },
  soccer_england_league2: { sport: "soccer", league: "eng.4" },
  soccer_efl_champ: { sport: "soccer", league: "eng.2" },
  soccer_fa_cup: { sport: "soccer", league: "eng.fa" },
  soccer_england_efl_cup: { sport: "soccer", league: "eng.league_cup" },
  soccer_spain_la_liga: { sport: "soccer", league: "esp.1" },
  soccer_spain_segunda_division: { sport: "soccer", league: "esp.2" },
  soccer_spain_copa_del_rey: { sport: "soccer", league: "esp.copa_del_rey" },
  soccer_germany_bundesliga: { sport: "soccer", league: "ger.1" },
  soccer_germany_bundesliga2: { sport: "soccer", league: "ger.2" },
  soccer_germany_liga3: { sport: "soccer", league: "ger.3" },
  soccer_germany_dfb_pokal: { sport: "soccer", league: "ger.dfb_pokal" },
  soccer_italy_serie_a: { sport: "soccer", league: "ita.1" },
  soccer_italy_serie_b: { sport: "soccer", league: "ita.2" },
  soccer_france_ligue_one: { sport: "soccer", league: "fra.1" },
  soccer_france_ligue_two: { sport: "soccer", league: "fra.2" },
  soccer_france_coupe_de_france: { sport: "soccer", league: "fra.coupe_de_france" },
  soccer_netherlands_eredivisie: { sport: "soccer", league: "ned.1" },
  soccer_portugal_primeira_liga: { sport: "soccer", league: "por.1" },
  soccer_belgium_first_div: { sport: "soccer", league: "bel.1" },
  soccer_turkey_super_league: { sport: "soccer", league: "tur.1" },
  soccer_greece_super_league: { sport: "soccer", league: "gre.1" },
  soccer_austria_bundesliga: { sport: "soccer", league: "aut.1" },
  soccer_denmark_superliga: { sport: "soccer", league: "den.1" },
  soccer_sweden_allsvenskan: { sport: "soccer", league: "swe.1" },
  soccer_norway_eliteserien: { sport: "soccer", league: "nor.1" },
  soccer_poland_ekstraklasa: { sport: "soccer", league: "pol.1" },
  soccer_switzerland_superleague: { sport: "soccer", league: "sui.1" },
  soccer_russia_premier_league: { sport: "soccer", league: "rus.1" },
  soccer_usa_mls: { sport: "soccer", league: "usa.1" },
  soccer_mexico_ligamx: { sport: "soccer", league: "mex.1" },
  soccer_argentina_primera_division: { sport: "soccer", league: "arg.1" },
  soccer_brazil_campeonato: { sport: "soccer", league: "bra.1" },
  soccer_brazil_serie_b: { sport: "soccer", league: "bra.2" },
  soccer_australia_aleague: { sport: "soccer", league: "aus.1" },
  soccer_japan_j_league: { sport: "soccer", league: "jpn.1" },
  soccer_korea_kleague1: { sport: "soccer", league: "kor.1" },
  soccer_china_superleague: { sport: "soccer", league: "chn.1" },
  soccer_spl: { sport: "soccer", league: "sco.1" },
  soccer_league_of_ireland: { sport: "soccer", league: "irl.1" },
  soccer_uefa_champs_league: { sport: "soccer", league: "uefa.champions" },
  soccer_uefa_europa_league: { sport: "soccer", league: "uefa.europa" },
  soccer_uefa_europa_conference_league: { sport: "soccer", league: "uefa.europa.conf" },
  soccer_fifa_world_cup: { sport: "soccer", league: "fifa.world" },
  soccer_fifa_world_cup_qualifiers_europe: { sport: "soccer", league: "fifa.worldq.uefa" },
  rugbyleague_nrl: { sport: "rugby-league", league: "nrl" },
  aussierules_afl: { sport: "australian-football", league: "afl" },
  lacrosse_ncaa: { sport: "lacrosse", league: "ncaa" },
  mma_mixed_martial_arts: { sport: "mma", league: "ufc" },
  cricket_ipl: { sport: "cricket", league: "ipl" },
  cricket_international_t20: { sport: "cricket", league: "international-t20" },
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
  draws: number;
  gamesPlayed: number;
  winPct: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
  pointDiff: number;
  homeRecord: string;
  awayRecord: string;
  last5: string;
  last5Detail: string[];
  last10: string;
  last10Detail: string[];
  restDays: number | null;
  keyInjuries: { name: string; position: string; status: string }[];
  streak: string;
  standingsSummary: string | null;
  conferenceRank: number | null;
  divisionRecord: string | null;
  conferenceRecord: string | null;
  overallRank: number | null;
  offensiveRank: number | null;
  defensiveRank: number | null;
  teamStats: Record<string, number | string> | null;
  powerRating: number | null;
  elo: number | null;
  leaguePoints: number | null;
}

export interface HeadToHead {
  meetings: number;
  homeWins: number;
  awayWins: number;
  ties: number;
  games: { date: string; homeScore: string; awayScore: string; winner: string; season?: number }[];
  seasonBreakdown?: { season: number; games: number }[];
}

export interface MatchupStats {
  home: TeamStats | null;
  away: TeamStats | null;
  headToHead: HeadToHead | null;
  projectedScore: { home: number; away: number } | null;
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

  const overall = record.find((r: any) => r.type === "total" || r.description === "Overall" || r.description === "Overall Record") ?? record[0];
  const homeRec = record.find((r: any) => r.type === "home" || r.description === "Home");
  const awayRec = record.find((r: any) => r.type === "road" || r.description === "Road" || r.description === "Away");

  const stat = (items: any[], name: string): number => {
    const s = items?.find((s: any) => s.name === name);
    return s ? Number(s.value) : 0;
  };

  const os = overall?.stats ?? [];
  const wins = stat(os, "wins");
  const losses = stat(os, "losses");
  const draws = stat(os, "ties") || stat(os, "draws");
  const gamesPlayed = stat(os, "gamesPlayed") || wins + losses + draws;
  const winPct = gamesPlayed > 0 ? wins / gamesPlayed : 0;
  const ptsFor = stat(os, "pointsFor") || stat(os, "goalsFor");
  const ptsAgainst = stat(os, "pointsAgainst") || stat(os, "goalsAgainst");
  const avgPF = stat(os, "avgPointsFor") || (gamesPlayed > 0 ? ptsFor / gamesPlayed : 0);
  const avgPA = stat(os, "avgPointsAgainst") || (gamesPlayed > 0 ? ptsAgainst / gamesPlayed : 0);
  const pointDiff = stat(os, "differential") || stat(os, "pointDifferential") || (avgPF - avgPA) * gamesPlayed;
  const leaguePoints = stat(os, "points") || null;

  const isSoccer = sport === "soccer";

  const fmtRecord = (r: any) => {
    if (!r?.stats) return "N/A";
    const w = stat(r.stats, "wins");
    const l = stat(r.stats, "losses");
    const d = stat(r.stats, "ties") || stat(r.stats, "draws");
    return isSoccer || d > 0 ? `${w}-${d}-${l}` : `${w}-${l}`;
  };

  return {
    name: teamName,
    wins,
    losses,
    draws,
    gamesPlayed,
    winPct,
    avgPointsFor: avgPF,
    avgPointsAgainst: avgPA,
    pointDiff,
    homeRecord: fmtRecord(homeRec),
    awayRecord: fmtRecord(awayRec),
    standingsSummary: null,
    conferenceRank: null,
    divisionRecord: null,
    conferenceRecord: null,
    overallRank: null,
    offensiveRank: null,
    defensiveRank: null,
    teamStats: null,
    powerRating: null,
    elo: null,
    leaguePoints: leaguePoints || null,
    last10: "",
    last10Detail: [],
  };
}

async function getRecentForm(
  sport: string,
  league: string,
  teamId: string
): Promise<{ last5: string; last5Detail: string[]; last10: string; last10Detail: string[]; restDays: number | null; streak: string }> {
  const data = await espnGet(`${ESPN_BASE}/${sport}/${league}/teams/${teamId}/schedule`);
  const events: any[] = data?.events ?? [];

  const completed = events
    .filter((e: any) => e.competitions?.[0]?.status?.type?.completed)
    .slice(-10);

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
    const lost = them.winner === true;
    const draw = !won && !lost;
    const usScore = typeof us.score === "object" ? us.score?.value ?? us.score?.displayValue ?? "?" : us.score;
    const themScore = typeof them.score === "object" ? them.score?.value ?? them.score?.displayValue ?? "?" : them.score;
    const score = `${usScore}-${themScore}`;
    const oppName = them.team?.abbreviation ?? "OPP";
    const isHome = us.homeAway === "home";
    const loc = isHome ? "vs" : "@";
    const resultChar = won ? "W" : draw ? "D" : "L";
    results.push(resultChar);
    details.push(`${resultChar} ${loc} ${oppName} ${score}`);
  }

  if (results.length > 0) {
    const last = results[results.length - 1];
    streakType = last;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i] === streakType) streakCount++;
      else break;
    }
  }

  const streakLabel = streakType === "W" ? "-game win" : streakType === "D" ? "-game draw" : "-game losing";
  const streak = streakCount > 0 ? `${streakCount}${streakLabel} streak` : "";

  let restDays: number | null = null;
  const allCompleted = events.filter((e: any) => e.competitions?.[0]?.status?.type?.completed);
  const lastGame = allCompleted.slice(-1)[0];
  if (lastGame) {
    const lastDate = new Date(lastGame.date);
    restDays = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
  }

  const last5Results = results.slice(-5);
  const last5Details = details.slice(-5);

  return {
    last5: last5Results.join("-"),
    last5Detail: last5Details,
    last10: results.join("-"),
    last10Detail: details,
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

async function getStandings(
  sport: string,
  league: string,
  teamId: string
): Promise<{ standingsSummary: string | null; conferenceRank: number | null; divisionRecord: string | null; conferenceRecord: string | null; overallRank: number | null }> {
  try {
    const data = await espnGet(`${ESPN_BASE}/${sport}/${league}/standings`);
    const groups: any[] = data?.children ?? [];

    for (const group of groups) {
      const entries: any[] = group?.standings?.entries ?? [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (String(entry.team?.id) !== String(teamId)) continue;

        const stats = entry.stats ?? [];
        const getStat = (name: string): string | number => {
          const s = stats.find((st: any) => st.name === name || st.abbreviation === name);
          return s?.displayValue ?? s?.value ?? "";
        };

        const divRec = getStat("vs. Div.") || getStat("divisionWinPercentage") || getStat("divisionRecord");
        const confRec = getStat("vs. Conf.") || getStat("conferenceWinPercentage") || getStat("conferenceRecord");
        const groupName = group.name || group.abbreviation || "";
        const rank = i + 1;

        return {
          standingsSummary: `${groupName} #${rank}`,
          conferenceRank: rank,
          divisionRecord: divRec ? String(divRec) : null,
          conferenceRecord: confRec ? String(confRec) : null,
          overallRank: null,
        };
      }
    }
    return { standingsSummary: null, conferenceRank: null, divisionRecord: null, conferenceRecord: null, overallRank: null };
  } catch {
    return { standingsSummary: null, conferenceRank: null, divisionRecord: null, conferenceRecord: null, overallRank: null };
  }
}

async function getTeamStatistics(
  sport: string,
  league: string,
  teamId: string
): Promise<{ offensiveRank: number | null; defensiveRank: number | null; teamStats: Record<string, number | string> | null }> {
  try {
    const data = await espnGet(`${ESPN_BASE}/${sport}/${league}/teams/${teamId}/statistics`);
    const splits: any[] = data?.results?.stats?.categories ?? data?.statistics?.splits?.categories ?? [];

    const statsMap: Record<string, number | string> = {};
    let offRank: number | null = null;
    let defRank: number | null = null;

    for (const cat of splits) {
      const catName = (cat.name || cat.displayName || "").toLowerCase();
      const statsList: any[] = cat.stats ?? [];
      for (const s of statsList) {
        const key = s.name || s.abbreviation;
        if (!key) continue;
        statsMap[key] = s.displayValue ?? s.value;
        if (s.rankDisplayValue) {
          const rankNum = parseInt(String(s.rankDisplayValue).replace(/\D/g, ""));
          if (!isNaN(rankNum)) {
            if (catName.includes("offense") || catName.includes("scoring") || catName.includes("batting")) {
              if (offRank === null || rankNum < offRank) offRank = rankNum;
            }
            if (catName.includes("defense") || catName.includes("pitching") || catName.includes("fielding")) {
              if (defRank === null || rankNum < defRank) defRank = rankNum;
            }
          }
        }
      }
    }

    if (Object.keys(statsMap).length === 0) {
      const altData = await espnGet(`${ESPN_BASE}/${sport}/${league}/teams/${teamId}`);
      const records = altData?.team?.record?.items ?? [];
      for (const rec of records) {
        for (const s of (rec.stats ?? [])) {
          if (s.name && s.value != null) statsMap[s.name] = s.displayValue ?? s.value;
        }
      }
    }

    return { offensiveRank: offRank, defensiveRank: defRank, teamStats: Object.keys(statsMap).length > 0 ? statsMap : null };
  } catch {
    return { offensiveRank: null, defensiveRank: null, teamStats: null };
  }
}

async function getHeadToHead(
  sport: string,
  league: string,
  homeTeamId: string,
  awayTeamId: string,
  homeTeamName: string,
  awayTeamName: string
): Promise<HeadToHead | null> {
  try {
    const currentYear = new Date().getFullYear();
    const seasons = [currentYear, currentYear - 1, currentYear - 2];

    const allGames: HeadToHead["games"] = [];
    const seenIds = new Set<string>();
    let team1Wins = 0;
    let team2Wins = 0;
    let ties = 0;

    for (const season of seasons) {
      const data = await espnGet(`${ESPN_BASE}/${sport}/${league}/teams/${homeTeamId}/schedule?season=${season}`);
      const events: any[] = data?.events ?? [];

      for (const ev of events) {
        const comp = ev.competitions?.[0];
        if (!comp?.status?.type?.completed) continue;
        const competitors: any[] = comp.competitors ?? [];
        const home = competitors.find((c: any) => c.homeAway === "home");
        const away = competitors.find((c: any) => c.homeAway === "away");
        if (!home || !away) continue;

        const hasOpponent =
          String(home.team?.id) === String(awayTeamId) ||
          String(away.team?.id) === String(awayTeamId);
        if (!hasOpponent) continue;

        const eventKey = ev.id || ev.uid || ev.date;
        if (seenIds.has(String(eventKey))) continue;
        seenIds.add(String(eventKey));

        const homeScore = typeof home.score === "object" ? home.score?.value ?? home.score?.displayValue ?? "?" : home.score;
        const awayScore = typeof away.score === "object" ? away.score?.value ?? away.score?.displayValue ?? "?" : away.score;
        const homeTeamWon = home.winner === true;
        const awayTeamWon = away.winner === true;
        const isTie = !homeTeamWon && !awayTeamWon;
        const winner = isTie ? "Tie" : homeTeamWon ? (home.team?.displayName ?? "Home") : (away.team?.displayName ?? "Away");

        if (isTie) {
          ties++;
        } else {
          const ourTeamIsHome = String(home.team?.id) === String(homeTeamId);
          if ((ourTeamIsHome && homeTeamWon) || (!ourTeamIsHome && awayTeamWon)) {
            team1Wins++;
          } else {
            team2Wins++;
          }
        }

        allGames.push({
          date: ev.date,
          homeScore: String(homeScore),
          awayScore: String(awayScore),
          winner,
          season,
        });
      }
    }

    if (allGames.length === 0) return null;

    allGames.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      meetings: allGames.length,
      homeWins: team1Wins,
      awayWins: team2Wins,
      ties,
      games: allGames.slice(0, 10),
      seasonBreakdown: seasons.map(s => ({
        season: s,
        games: allGames.filter(g => g.season === s).length,
      })).filter(s => s.games > 0),
    };
  } catch {
    return null;
  }
}

function computePowerRating(stats: { winPct: number; pointDiff: number; gamesPlayed: number; avgPointsFor: number; avgPointsAgainst: number }): number {
  const winComponent = stats.winPct * 40;
  const diffComponent = Math.max(-20, Math.min(20, stats.pointDiff / (stats.gamesPlayed || 1) * 3));
  const scoringComponent = Math.max(-10, Math.min(10, (stats.avgPointsFor - stats.avgPointsAgainst) * 0.5));
  return Math.round((winComponent + diffComponent + scoringComponent + 50) * 10) / 10;
}

function computeElo(wins: number, losses: number, avgPF: number, avgPA: number): number {
  const base = 1500;
  const winAdj = (wins - losses) * 15;
  const marginAdj = (avgPF - avgPA) * 5;
  return Math.round(base + winAdj + marginAdj);
}

export async function fetchMatchupStats(
  sportKey: string,
  homeTeam: string,
  awayTeam: string
): Promise<MatchupStats> {
  const mapping = SPORT_MAP[sportKey];
  if (!mapping) return { home: null, away: null, headToHead: null, projectedScore: null, error: `No ESPN mapping for sport: ${sportKey}` };

  const { sport, league } = mapping;

  const [homeId, awayId] = await Promise.all([
    findTeamId(sport, league, homeTeam),
    findTeamId(sport, league, awayTeam),
  ]);

  if (!homeId && !awayId) return { home: null, away: null, headToHead: null, projectedScore: null, error: "Teams not found in ESPN" };

  const [homeData, awayData, homeStandings, awayStandings, homeTeamStats, awayTeamStats, h2h] = await Promise.all([
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
    homeId ? getStandings(sport, league, homeId).catch(() => null) : Promise.resolve(null),
    awayId ? getStandings(sport, league, awayId).catch(() => null) : Promise.resolve(null),
    homeId ? getTeamStatistics(sport, league, homeId).catch(() => null) : Promise.resolve(null),
    awayId ? getTeamStatistics(sport, league, awayId).catch(() => null) : Promise.resolve(null),
    (homeId && awayId) ? getHeadToHead(sport, league, homeId, awayId, homeTeam, awayTeam).catch(() => null) : Promise.resolve(null),
  ]);

  type FormResult = { last5: string; last5Detail: string[]; last10: string; last10Detail: string[]; restDays: number | null; streak: string };
  type InjuryResult = { name: string; position: string; status: string }[];

  const buildStats = (
    base: Awaited<ReturnType<typeof getTeamRecord>> | null,
    form: FormResult | null,
    injuries: InjuryResult | null,
    standings: Awaited<ReturnType<typeof getStandings>> | null,
    stats: Awaited<ReturnType<typeof getTeamStatistics>> | null,
  ): TeamStats | null => {
    if (!base) return null;
    const pr = computePowerRating(base);
    const elo = computeElo(base.wins, base.losses, base.avgPointsFor, base.avgPointsAgainst);
    return {
      ...base,
      last5: form?.last5 ?? base.last10?.split("-").slice(-5).join("-") ?? "",
      last5Detail: form?.last5Detail ?? [],
      last10: form?.last10 ?? base.last10 ?? "",
      last10Detail: form?.last10Detail ?? base.last10Detail ?? [],
      restDays: form?.restDays ?? null,
      streak: form?.streak ?? "",
      keyInjuries: injuries ?? [],
      standingsSummary: standings?.standingsSummary ?? base.standingsSummary,
      conferenceRank: standings?.conferenceRank ?? base.conferenceRank,
      divisionRecord: standings?.divisionRecord ?? base.divisionRecord,
      conferenceRecord: standings?.conferenceRecord ?? base.conferenceRecord,
      overallRank: standings?.overallRank ?? base.overallRank,
      offensiveRank: stats?.offensiveRank ?? base.offensiveRank,
      defensiveRank: stats?.defensiveRank ?? base.defensiveRank,
      teamStats: stats?.teamStats ?? base.teamStats,
      powerRating: pr,
      elo,
      leaguePoints: base.leaguePoints,
    };
  };

  const homeResult = homeData ? buildStats(homeData[0], homeData[1], homeData[2], homeStandings, homeTeamStats) : null;
  const awayResult = awayData ? buildStats(awayData[0], awayData[1], awayData[2], awayStandings, awayTeamStats) : null;

  let projectedScore: { home: number; away: number } | null = null;
  if (homeResult && awayResult) {
    const avgPF = (homeResult.avgPointsFor + awayResult.avgPointsAgainst) / 2;
    const avgPA = (awayResult.avgPointsFor + homeResult.avgPointsAgainst) / 2;
    const homeAdv = 1.5;
    const isSoccer = sportKey.startsWith("soccer");
    const adj = isSoccer ? 0.3 : 1.5;
    projectedScore = {
      home: Math.max(0, Math.round((avgPF + adj) * 10) / 10),
      away: Math.max(0, Math.round((avgPA - adj) * 10) / 10),
    };
  }

  return {
    home: homeResult,
    away: awayResult,
    headToHead: h2h,
    projectedScore,
  };
}

export function buildTeamStatsSection(stats: MatchupStats, homeTeam: string, awayTeam: string): string {
  const lines: string[] = ["═══ TEAM STATISTICS (ESPN) ═══"];

  const fmtTeam = (t: TeamStats | null, label: string, isHome: boolean): string[] => {
    if (!t) return [`${label}: Data unavailable`];
    const out: string[] = [];
    out.push(`${label} (${isHome ? "HOME" : "AWAY"}):`);
    const recStr = t.draws > 0 ? `${t.wins}-${t.draws}-${t.losses} (W-D-L)` : `${t.wins}-${t.losses}`;
    const ptsStr = t.leaguePoints ? ` | ${t.leaguePoints} league pts` : "";
    out.push(`  Record: ${recStr} (${(t.winPct * 100).toFixed(1)}% win rate${ptsStr}) | Home: ${t.homeRecord} | Away: ${t.awayRecord}`);
    if (t.standingsSummary) out.push(`  Standings: ${t.standingsSummary}`);
    if (t.divisionRecord) out.push(`  Division Record: ${t.divisionRecord}`);
    if (t.conferenceRecord) out.push(`  Conference Record: ${t.conferenceRecord}`);
    out.push(`  Scoring: ${t.avgPointsFor.toFixed(1)} pts/gm scored, ${t.avgPointsAgainst.toFixed(1)} pts/gm allowed (diff: ${t.pointDiff >= 0 ? "+" : ""}${t.pointDiff.toFixed(0)})`);
    if (t.powerRating !== null) out.push(`  Power Rating: ${t.powerRating}/100 | Elo: ${t.elo}`);
    if (t.offensiveRank !== null) out.push(`  Offensive Rank: #${t.offensiveRank}`);
    if (t.defensiveRank !== null) out.push(`  Defensive Rank: #${t.defensiveRank}`);
    if (t.last10) {
      const l10 = t.last10.split("-");
      const w10 = l10.filter(r => r === "W").length;
      const d10 = l10.filter(r => r === "D").length;
      const l10c = l10.filter(r => r === "L").length;
      const formStr = d10 > 0 ? `${w10}W-${d10}D-${l10c}L` : `${w10}W-${l10c}L`;
      out.push(`  Last 10 games: ${t.last10} (${formStr}) — ${t.last10Detail.join(", ")}`);
    } else if (t.last5) {
      out.push(`  Last 5 games: ${t.last5} — ${t.last5Detail.join(", ")}`);
    }
    if (t.streak) out.push(`  Streak: ${t.streak}`);
    if (t.restDays !== null) {
      const restNote = t.restDays <= 1 ? " ⚠ back-to-back" : t.restDays >= 7 ? " (well-rested)" : "";
      out.push(`  Rest: ${t.restDays} days since last game${restNote}`);
    }
    if (t.keyInjuries.length > 0) {
      out.push(`  Injury Report (${t.keyInjuries.length} players):`);
      t.keyInjuries.forEach((i) => out.push(`    • ${i.name} (${i.position}) — ${i.status}`));
    } else {
      out.push(`  Injury Report: No significant injuries reported`);
    }
    return out;
  };

  const homeLines = fmtTeam(stats.home, homeTeam, true);
  const awayLines = fmtTeam(stats.away, awayTeam, false);

  const edgeLines: string[] = [];
  if (stats.home && stats.away) {
    edgeLines.push("", "═══ MATCHUP EDGE ANALYSIS ═══");
    const eloDiff = (stats.home.elo ?? 1500) - (stats.away.elo ?? 1500);
    const pwrDiff = (stats.home.powerRating ?? 50) - (stats.away.powerRating ?? 50);
    if (Math.abs(eloDiff) < 10) {
      edgeLines.push(`  Elo Edge: EVEN (${Math.abs(eloDiff)} pt difference — no meaningful edge)`);
    } else {
      const eloFav = eloDiff > 0 ? homeTeam : awayTeam;
      edgeLines.push(`  Elo Edge: ${eloFav} by ${Math.abs(eloDiff)} pts (${Math.abs(eloDiff) >= 100 ? "SIGNIFICANT" : Math.abs(eloDiff) >= 50 ? "moderate" : "slight"})`);
    }
    if (Math.abs(pwrDiff) < 3) {
      edgeLines.push(`  Power Edge: EVEN (${Math.abs(pwrDiff).toFixed(1)} pt difference — no meaningful edge)`);
    } else {
      const pwrFav = pwrDiff > 0 ? homeTeam : awayTeam;
      edgeLines.push(`  Power Edge: ${pwrFav} by ${Math.abs(pwrDiff).toFixed(1)} (${Math.abs(pwrDiff) >= 15 ? "DOMINANT" : Math.abs(pwrDiff) >= 8 ? "clear" : "marginal"})`);
    }

    const homeForm10 = stats.home.last10?.split("-").filter(r => r === "W").length ?? 0;
    const awayForm10 = stats.away.last10?.split("-").filter(r => r === "W").length ?? 0;
    if (homeForm10 !== awayForm10) {
      const formFav = homeForm10 > awayForm10 ? homeTeam : awayTeam;
      edgeLines.push(`  Form Edge: ${formFav} (${Math.max(homeForm10, awayForm10)}W vs ${Math.min(homeForm10, awayForm10)}W in last 10)`);
    }

    const homeOff = stats.home.offensiveRank;
    const awayOff = stats.away.offensiveRank;
    const homeDef = stats.home.defensiveRank;
    const awayDef = stats.away.defensiveRank;
    if (homeOff && awayDef) {
      const mismatch = awayDef - homeOff;
      if (Math.abs(mismatch) >= 10) {
        edgeLines.push(`  ${homeTeam} Offense (#${homeOff}) vs ${awayTeam} Defense (#${awayDef}) — ${mismatch > 0 ? "offensive mismatch favours " + homeTeam : "defensive mismatch favours " + awayTeam}`);
      }
    }
    if (awayOff && homeDef) {
      const mismatch = homeDef - awayOff;
      if (Math.abs(mismatch) >= 10) {
        edgeLines.push(`  ${awayTeam} Offense (#${awayOff}) vs ${homeTeam} Defense (#${homeDef}) — ${mismatch > 0 ? "offensive mismatch favours " + awayTeam : "defensive mismatch favours " + homeTeam}`);
      }
    }
  }

  const h2hLines: string[] = [];
  if (stats.headToHead) {
    const tieText = stats.headToHead.ties > 0 ? `, ${stats.headToHead.ties} draws` : "";
    h2hLines.push("", `═══ HEAD-TO-HEAD RECORD (last 3 seasons) ═══`);
    h2hLines.push(`  Overall: ${stats.headToHead.meetings} meetings — ${homeTeam} ${stats.headToHead.homeWins}W, ${awayTeam} ${stats.headToHead.awayWins}W${tieText}`);
    if (stats.headToHead.meetings >= 3) {
      const domTeam = stats.headToHead.homeWins > stats.headToHead.awayWins ? homeTeam : stats.headToHead.awayWins > stats.headToHead.homeWins ? awayTeam : null;
      const domPct = domTeam === homeTeam
        ? ((stats.headToHead.homeWins / stats.headToHead.meetings) * 100).toFixed(0)
        : domTeam === awayTeam
          ? ((stats.headToHead.awayWins / stats.headToHead.meetings) * 100).toFixed(0)
          : "50";
      if (domTeam) {
        h2hLines.push(`  ⚡ H2H DOMINANCE: ${domTeam} wins ${domPct}% of meetings — ${Number(domPct) >= 70 ? "STRONG" : "moderate"} historical edge`);
      } else {
        h2hLines.push(`  H2H is EVENLY SPLIT — no clear historical edge`);
      }
    }
    if (stats.headToHead.seasonBreakdown?.length) {
      h2hLines.push(`  By season: ${stats.headToHead.seasonBreakdown.map(s => `${s.season}: ${s.games} games`).join(", ")}`);
    }
    h2hLines.push(`  Recent results:`);
    for (const g of stats.headToHead.games) {
      const seasonTag = g.season ? ` [${g.season}]` : "";
      h2hLines.push(`    ${new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${g.homeScore}-${g.awayScore} (${g.winner})${seasonTag}`);
    }
  }

  const projLines: string[] = [];
  if (stats.projectedScore) {
    const total = stats.projectedScore.home + stats.projectedScore.away;
    projLines.push("", `═══ PROJECTED SCORE ═══`);
    projLines.push(`  ${homeTeam} ${stats.projectedScore.home} — ${awayTeam} ${stats.projectedScore.away} (total: ${total.toFixed(1)})`);
    projLines.push(`  Use this projected total to evaluate over/under lines. If the O/U line is significantly different from ${total.toFixed(1)}, that gap is a betting signal.`);
  }

  return [...lines, ...homeLines, "", ...awayLines, ...edgeLines, ...h2hLines, ...projLines].join("\n");
}

export function buildTeamStatsAnalysisGuide(): string {
  return `═══ HOW TO ANALYZE TEAM DATA ═══
POWER METRICS (weight these heavily):
• Power Rating 0-100: >75 = strong, 50-75 = average, <50 = weak. A gap of 15+ is a DOMINANT edge.
• Elo Rating: >1600 = elite, 1450-1600 = average, <1450 = weak. A gap of 100+ Elo is a SIGNIFICANT mismatch.
• Compare both metrics — if both agree on the same favourite, confidence should increase.

FORM & MOMENTUM:
• Last 10 form is more predictive than season record. 7+ wins in last 10 = hot team. 3 or fewer = cold.
• Current streak: 3+ game winning/losing streak amplifies confidence/concern.
• Rest: ≤1 day rest (back-to-back) reduces win probability by 5-8%. ≥3 day rest edge is meaningful.

HEAD-TO-HEAD (very important):
• H2H record across 3 seasons reveals matchup-specific advantages that don't show in overall stats.
• A team winning 70%+ of H2H meetings has a STRONG historical edge — weight this as a top-3 factor.
• Even H2H (50/50) means focus on current form and odds instead.
• Recent H2H results matter more than older ones.

RANKINGS & MATCHUPS:
• Offensive rank vs opposing defensive rank reveals mismatches. Top-10 offense vs bottom-10 defense = scoring potential.
• Division/conference records indicate strength against quality opponents.
• Home/away splits: some teams are drastically different at home vs away.

PROJECTED SCORE:
• Compare projected total against the O/U line. A gap of 3+ points is a clear lean direction.
• If projected total is 48.5 but the O/U line is 44.5, that's a strong OVER signal.
• Projected winner margin helps calibrate spread bets.

SOCCER-SPECIFIC:
• League points and table position are the primary ranking metric — more important than win%.
• Draws are common (~25% of games). Factor draw likelihood when odds are close.
• Goal differential is the key scoring metric.`;
}
