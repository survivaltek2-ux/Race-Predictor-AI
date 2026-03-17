import { db, lotteryGames, lotteryResults } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

type ParsedRow = { drawDate: Date; numbers: number[]; bonus: number; multiplier?: number } | null;

function parseSpaceSeparated(str: string): number[] {
  return (str || "").trim().split(/\s+/).map(Number).filter((n) => !isNaN(n));
}

const LOTTERY_APIS: Record<string, { url: string; parseRow: (row: any) => ParsedRow }> = {
  powerball: {
    url: "https://data.ny.gov/resource/d6yy-54nr.json",
    parseRow(row: any) {
      try {
        const drawDate = new Date(row.draw_date);
        if (isNaN(drawDate.getTime())) return null;
        const parts = parseSpaceSeparated(row.winning_numbers);
        if (parts.length < 6) return null;
        const numbers = parts.slice(0, 5).sort((a, b) => a - b);
        const bonus = parts[5];
        return { drawDate, numbers, bonus, multiplier: row.multiplier ? Number(row.multiplier) : undefined };
      } catch { return null; }
    },
  },
  mega_millions: {
    url: "https://data.ny.gov/resource/5xaw-6ayf.json",
    parseRow(row: any) {
      try {
        const drawDate = new Date(row.draw_date);
        if (isNaN(drawDate.getTime())) return null;
        const parts = parseSpaceSeparated(row.winning_numbers);
        if (parts.length < 5) return null;
        const numbers = parts.slice(0, 5).sort((a, b) => a - b);
        const bonus = row.mega_ball ? Number(row.mega_ball) : 0;
        if (isNaN(bonus)) return null;
        return { drawDate, numbers, bonus, multiplier: row.megaplier ? Number(row.megaplier) : undefined };
      } catch { return null; }
    },
  },
  cash4life: {
    url: "https://data.ny.gov/resource/kwxv-fwze.json",
    parseRow(row: any) {
      try {
        const drawDate = new Date(row.draw_date);
        if (isNaN(drawDate.getTime())) return null;
        const parts = parseSpaceSeparated(row.winning_numbers);
        if (parts.length < 5) return null;
        const numbers = parts.slice(0, 5).sort((a, b) => a - b);
        const bonus = row.cash_ball ? Number(row.cash_ball) : 0;
        if (isNaN(bonus)) return null;
        return { drawDate, numbers, bonus };
      } catch { return null; }
    },
  },
  ny_lotto: {
    url: "https://data.ny.gov/resource/6nbc-h7bj.json",
    parseRow(row: any) {
      try {
        const drawDate = new Date(row.draw_date);
        if (isNaN(drawDate.getTime())) return null;
        const parts = parseSpaceSeparated(row.winning_numbers);
        if (parts.length < 6) return null;
        const numbers = parts.slice(0, 6).sort((a, b) => a - b);
        const bonus = row.bonus ? Number(row.bonus) : 0;
        if (isNaN(bonus)) return null;
        return { drawDate, numbers, bonus };
      } catch { return null; }
    },
  },
  take5: {
    url: "https://data.ny.gov/resource/dg63-4siq.json",
    parseRow(row: any) {
      try {
        const drawDate = new Date(row.draw_date);
        if (isNaN(drawDate.getTime())) return null;
        const nums = parseSpaceSeparated(row.evening_winning_numbers || row.winning_numbers || "");
        if (nums.length < 5) return null;
        const numbers = nums.slice(0, 5).sort((a, b) => a - b);
        return { drawDate, numbers, bonus: 0 };
      } catch { return null; }
    },
  },
  pick10: {
    url: "https://data.ny.gov/resource/bycu-cw7c.json",
    parseRow(row: any) {
      try {
        const drawDate = new Date(row.draw_date);
        if (isNaN(drawDate.getTime())) return null;
        const parts = parseSpaceSeparated(row.winning_numbers);
        if (parts.length < 20) return null;
        const numbers = parts.slice(0, 20).sort((a, b) => a - b);
        return { drawDate, numbers, bonus: 0 };
      } catch { return null; }
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
