import app from "./app";
import { syncLotteryData, autoComparePredictions } from "./lib/lotterySync";
import { db, lotteryGames } from "@workspace/db";
import { eq } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);

  setTimeout(async () => {
    try {
      const defaultGames = [
        { name: "Powerball", gameKey: "powerball", numberOfPicks: 5, maxNumber: 69, bonusNumberMax: 26, drawDayOfWeek: "Monday,Wednesday,Saturday" },
        { name: "Mega Millions", gameKey: "mega_millions", numberOfPicks: 5, maxNumber: 70, bonusNumberMax: 25, drawDayOfWeek: "Tuesday,Friday" },
        { name: "Cash4Life", gameKey: "cash4life", numberOfPicks: 5, maxNumber: 60, bonusNumberMax: 4, drawDayOfWeek: "Daily" },
        { name: "NY Lotto", gameKey: "ny_lotto", numberOfPicks: 6, maxNumber: 59, bonusNumberMax: 59, drawDayOfWeek: "Wednesday,Saturday" },
        { name: "Take 5", gameKey: "take5", numberOfPicks: 5, maxNumber: 39, bonusNumberMax: 0, drawDayOfWeek: "Daily" },
        { name: "Pick 10", gameKey: "pick10", numberOfPicks: 10, maxNumber: 80, bonusNumberMax: 0, drawDayOfWeek: "Daily" },
      ];
      for (const g of defaultGames) {
        const existing = await db.select().from(lotteryGames).where(eq(lotteryGames.gameKey, g.gameKey)).limit(1);
        if (existing.length === 0) {
          await db.insert(lotteryGames).values(g);
          console.log(`[Seed] Added lottery game: ${g.name}`);
        }
      }

      console.log("[LotterySync] Auto-syncing lottery data on startup...");
      const results = await syncLotteryData();
      results.forEach((r) => {
        if (r.error) {
          console.error(`[LotterySync] ${r.gameName}: ERROR - ${r.error}`);
        } else {
          console.log(`[LotterySync] ${r.gameName}: ${r.inserted} new draws added (${r.totalInDb} total)`);
        }
      });
      const compareResult = await autoComparePredictions();
      if (compareResult.compared > 0) {
        console.log(`[AutoCompare] Compared ${compareResult.compared} predictions, ${compareResult.matched} correct`);
      }
    } catch (err) {
      console.error("[LotterySync] Auto-sync failed:", err);
    }
  }, 3000);

  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      console.log("[ScheduledSync] Running 6-hour lottery sync...");
      const results = await syncLotteryData();
      results.forEach((r) => {
        if (r.error) {
          console.error(`[ScheduledSync] ${r.gameName}: ERROR - ${r.error}`);
        } else if (r.inserted > 0) {
          console.log(`[ScheduledSync] ${r.gameName}: ${r.inserted} new draws`);
        }
      });
      const compareResult = await autoComparePredictions();
      if (compareResult.compared > 0) {
        console.log(`[ScheduledSync] Auto-compared ${compareResult.compared} predictions`);
      }
    } catch (err) {
      console.error("[ScheduledSync] Failed:", err);
    }
  }, SIX_HOURS);
});
