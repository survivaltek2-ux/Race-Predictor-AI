import { db, lotteryGames, lotteryResults } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const LOTTERY_APIS: Record<string, { url: string; parseRow: (row: any) => { drawDate: Date; numbers: number[]; bonus: number; multiplier?: number } | null }> = {
  powerball: {
    url: "https://data.ny.gov/resource/d6yy-54nr.json",
    parseRow(row: any) {
      try {
        const drawDate = new Date(row.draw_date);
        if (isNaN(drawDate.getTime())) return null;
        const parts = (row.winning_numbers || "").trim().split(/\s+/).map(Number);
        if (parts.length < 6 || parts.some(isNaN)) return null;
        const numbers = parts.slice(0, 5).sort((a: number, b: number) => a - b);
        const bonus = parts[5];
        const multiplier = row.multiplier ? Number(row.multiplier) : undefined;
        return { drawDate, numbers, bonus, multiplier };
      } catch {
        return null;
      }
    },
  },
  mega_millions: {
    url: "https://data.ny.gov/resource/5xaw-6ayf.json",
    parseRow(row: any) {
      try {
        const drawDate = new Date(row.draw_date);
        if (isNaN(drawDate.getTime())) return null;
        const parts = (row.winning_numbers || "").trim().split(/\s+/).map(Number);
        if (parts.length < 5 || parts.some(isNaN)) return null;
        const numbers = parts.slice(0, 5).sort((a: number, b: number) => a - b);
        const bonus = row.mega_ball ? Number(row.mega_ball) : (parts[5] || 0);
        if (isNaN(bonus)) return null;
        const multiplier = row.megaplier ? Number(row.megaplier) : undefined;
        return { drawDate, numbers, bonus, multiplier };
      } catch {
        return null;
      }
    },
  },
};

export interface SyncResult {
  gameKey: string;
  gameName: string;
  fetched: number;
  inserted: number;
  skipped: number;
  totalInDb: number;
  latestDraw: string | null;
  error?: string;
}

export async function syncLotteryData(gameKey?: string): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  const games = await db.select().from(lotteryGames);
  const toSync = gameKey ? games.filter((g) => g.gameKey === gameKey) : games;

  for (const game of toSync) {
    const apiConfig = LOTTERY_APIS[game.gameKey];
    if (!apiConfig) {
      results.push({
        gameKey: game.gameKey,
        gameName: game.name,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        totalInDb: 0,
        latestDraw: null,
        error: `No API configuration for game: ${game.gameKey}`,
      });
      continue;
    }

    try {
      const latestResult = await db
        .select()
        .from(lotteryResults)
        .where(eq(lotteryResults.gameId, game.id))
        .orderBy(desc(lotteryResults.drawDate))
        .limit(1);

      const latestDate = latestResult.length > 0 ? latestResult[0].drawDate : null;

      let allRawData: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      const maxPages = 5;

      for (let page = 0; page < maxPages; page++) {
        let url = `${apiConfig.url}?$order=draw_date+DESC&$limit=${pageSize}&$offset=${offset}`;
        if (latestDate) {
          const isoDate = latestDate.toISOString().split("T")[0];
          url += `&$where=draw_date>'${isoDate}'`;
        }

        console.log(`[LotterySync] Fetching ${game.name} page ${page + 1} from: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const pageData = await response.json();
        if (!Array.isArray(pageData)) {
          throw new Error("Unexpected API response format");
        }

        allRawData.push(...pageData);
        if (pageData.length < pageSize) break;
        offset += pageSize;
      }

      let inserted = 0;
      let skipped = 0;

      for (const row of allRawData) {
        const parsed = apiConfig.parseRow(row);
        if (!parsed) {
          skipped++;
          continue;
        }

        const existing = await db
          .select({ id: lotteryResults.id })
          .from(lotteryResults)
          .where(
            and(
              eq(lotteryResults.gameId, game.id),
              eq(lotteryResults.drawDate, parsed.drawDate)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        await db.insert(lotteryResults).values({
          gameId: game.id,
          drawDate: parsed.drawDate,
          winningNumbers: parsed.numbers.join(","),
          bonusNumber: parsed.bonus,
          jackpot: null,
          winners: 0,
        });
        inserted++;
      }

      const totalInDb = await db
        .select({ id: lotteryResults.id })
        .from(lotteryResults)
        .where(eq(lotteryResults.gameId, game.id));

      const newestResult = await db
        .select()
        .from(lotteryResults)
        .where(eq(lotteryResults.gameId, game.id))
        .orderBy(desc(lotteryResults.drawDate))
        .limit(1);

      results.push({
        gameKey: game.gameKey,
        gameName: game.name,
        fetched: allRawData.length,
        inserted,
        skipped,
        totalInDb: totalInDb.length,
        latestDraw: newestResult.length > 0 ? newestResult[0].drawDate.toISOString() : null,
      });

      console.log(`[LotterySync] ${game.name}: fetched=${allRawData.length}, inserted=${inserted}, skipped=${skipped}, total=${totalInDb.length}`);
    } catch (err: any) {
      console.error(`[LotterySync] Error syncing ${game.name}:`, err);
      results.push({
        gameKey: game.gameKey,
        gameName: game.name,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        totalInDb: 0,
        latestDraw: null,
        error: err.message || "Unknown error",
      });
    }
  }

  return results;
}

export async function getLotteryDataStatus(): Promise<{ gameKey: string; gameName: string; totalResults: number; latestDraw: string | null; oldestDraw: string | null }[]> {
  const games = await db.select().from(lotteryGames);
  const status = [];

  for (const game of games) {
    const allResults = await db
      .select({ id: lotteryResults.id })
      .from(lotteryResults)
      .where(eq(lotteryResults.gameId, game.id));

    const newest = await db
      .select()
      .from(lotteryResults)
      .where(eq(lotteryResults.gameId, game.id))
      .orderBy(desc(lotteryResults.drawDate))
      .limit(1);

    const oldest = await db
      .select()
      .from(lotteryResults)
      .where(eq(lotteryResults.gameId, game.id))
      .orderBy(lotteryResults.drawDate)
      .limit(1);

    status.push({
      gameKey: game.gameKey,
      gameName: game.name,
      totalResults: allResults.length,
      latestDraw: newest.length > 0 ? newest[0].drawDate.toISOString() : null,
      oldestDraw: oldest.length > 0 ? oldest[0].drawDate.toISOString() : null,
    });
  }

  return status;
}
