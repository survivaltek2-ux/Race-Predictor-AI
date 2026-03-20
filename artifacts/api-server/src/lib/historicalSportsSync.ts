import { db, sportsGamesTable, sportsTeamStatsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

interface GameData {
  id: string;
  date: string;
  competitions: Array<{
    id: string;
    status: { type: string };
    competitors: Array<{
      id: string;
      team: { displayName: string };
      score?: number;
      homeAway: "home" | "away";
    }>;
  }>;
}

async function espnGet(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SportsPredictor/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const SPORT_PATHS: Record<string, { path: string; league: string }> = {
  nfl: { path: "football/nfl", league: "NFL" },
  nba: { path: "basketball/nba", league: "NBA" },
  mlb: { path: "baseball/mlb", league: "MLB" },
  nhl: { path: "hockey/nhl", league: "NHL" },
  ncaaf: { path: "football/college-football", league: "College Football" },
  ncaab: { path: "basketball/mens-college-basketball", league: "College Basketball" },
};

async function fetchSportGames(sport: string, limit: number = 100): Promise<GameData[]> {
  const config = SPORT_PATHS[sport];
  if (!config) return [];

  try {
    const url = `${ESPN_BASE}/${config.path}/scoreboard`;
    const data = await espnGet(url);
    
    if (!data?.events) return [];

    const completed = data.events
      .filter((e: any) => e.competitions?.[0]?.status?.type === "STATUS_FINAL")
      .slice(0, limit);

    return completed;
  } catch (err) {
    console.error(`Error fetching games for ${sport}:`, err);
    return [];
  }
}

export async function syncHistoricalSports(sport: string): Promise<{ inserted: number; updated: number; error?: string }> {
  try {
    console.log(`[HistoricalSync] Starting sync for ${sport}...`);

    const games = await fetchSportGames(sport, 100);
    if (games.length === 0) {
      return { inserted: 0, updated: 0, error: `No completed games found for ${sport}` };
    }

    const config = SPORT_PATHS[sport];
    if (!config) {
      return { inserted: 0, updated: 0, error: `Unsupported sport: ${sport}` };
    }

    let inserted = 0;
    const teamStatsMap: Record<string, any> = {};

    for (const game of games) {
      if (!game.competitions?.[0]) continue;

      const comp = game.competitions[0];
      const homeComp = comp.competitors?.find((c: any) => c.homeAway === "home");
      const awayComp = comp.competitors?.find((c: any) => c.homeAway === "away");

      if (!homeComp || !awayComp) continue;

      const homeTeam = homeComp.team?.displayName;
      const awayTeam = awayComp.team?.displayName;
      const homeScore = homeComp.score ?? 0;
      const awayScore = awayComp.score ?? 0;

      if (!homeTeam || !awayTeam) continue;

      let winner: "home" | "away" | "draw" | null = null;
      if (homeScore > awayScore) winner = "home";
      else if (awayScore > homeScore) winner = "away";
      else winner = "draw";

      const externalId = comp.id;
      const gameDate = new Date(game.date);

      const existing = await db
        .select()
        .from(sportsGamesTable)
        .where(eq(sportsGamesTable.externalId, externalId))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(sportsGamesTable).values({
          externalId,
          sportKey: sport,
          sportTitle: config.league,
          homeTeam,
          awayTeam,
          homeScore,
          awayScore,
          winner,
          gameDate,
          completed: new Date(),
        });
        inserted++;
      }

      // Aggregate team stats
      if (!teamStatsMap[homeTeam]) {
        teamStatsMap[homeTeam] = { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, pointsFor: 0, pointsAgainst: 0 };
      }
      if (!teamStatsMap[awayTeam]) {
        teamStatsMap[awayTeam] = { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, pointsFor: 0, pointsAgainst: 0 };
      }

      teamStatsMap[homeTeam].gamesPlayed++;
      teamStatsMap[homeTeam].pointsFor += homeScore;
      teamStatsMap[homeTeam].pointsAgainst += awayScore;
      if (winner === "home") teamStatsMap[homeTeam].wins++;
      else if (winner === "away") teamStatsMap[homeTeam].losses++;
      else teamStatsMap[homeTeam].draws++;

      teamStatsMap[awayTeam].gamesPlayed++;
      teamStatsMap[awayTeam].pointsFor += awayScore;
      teamStatsMap[awayTeam].pointsAgainst += homeScore;
      if (winner === "away") teamStatsMap[awayTeam].wins++;
      else if (winner === "home") teamStatsMap[awayTeam].losses++;
      else teamStatsMap[awayTeam].draws++;
    }

    // Compute power ratings and Elo, then upsert team stats
    const currentSeason = new Date().getFullYear();
    let updated = 0;

    for (const [teamName, stats] of Object.entries(teamStatsMap)) {
      const gp = stats.gamesPlayed || 1;
      const winPct = stats.wins / gp;
      const pointDiff = (stats.pointsFor - stats.pointsAgainst) / gp;

      // Power rating formula: winPct*40 + pointDiff/games*3 (capped) + ...
      const powerRating = Math.max(20, Math.min(80, 50 + winPct * 30 + pointDiff * 0.5));

      // Elo formula: 1500 + (wins - losses) * 15 + pointDiff * 5
      const elo = Math.max(800, Math.min(2200, 1500 + (stats.wins - stats.losses) * 15 + pointDiff * 5));

      const existing = await db
        .select()
        .from(sportsTeamStatsTable)
        .where(
          and(
            eq(sportsTeamStatsTable.teamName, teamName as string),
            eq(sportsTeamStatsTable.sportKey, sport),
            eq(sportsTeamStatsTable.season, currentSeason)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(sportsTeamStatsTable).values({
          teamName: teamName as string,
          sportKey: sport,
          season: currentSeason,
          gamesPlayed: stats.gamesPlayed,
          wins: stats.wins,
          losses: stats.losses,
          draws: stats.draws,
          pointsFor: stats.pointsFor,
          pointsAgainst: stats.pointsAgainst,
          powerRating,
          elo,
        });
        updated++;
      } else {
        await db
          .update(sportsTeamStatsTable)
          .set({
            gamesPlayed: stats.gamesPlayed,
            wins: stats.wins,
            losses: stats.losses,
            draws: stats.draws,
            pointsFor: stats.pointsFor,
            pointsAgainst: stats.pointsAgainst,
            powerRating,
            elo,
            lastUpdated: new Date(),
          })
          .where(eq(sportsTeamStatsTable.id, existing[0].id));
        updated++;
      }
    }

    console.log(`[HistoricalSync] ${sport}: inserted=${inserted}, updated=${updated}`);
    return { inserted, updated };
  } catch (err) {
    console.error(`[HistoricalSync] Error syncing ${sport}:`, err);
    return { inserted: 0, updated: 0, error: String(err) };
  }
}

export async function syncAllHistoricalSports(): Promise<Record<string, any>> {
  const results: Record<string, any> = {};
  for (const sport of Object.keys(SPORT_PATHS)) {
    results[sport] = await syncHistoricalSports(sport);
  }
  return results;
}
