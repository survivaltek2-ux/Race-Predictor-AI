import app from "./app";
import { syncLotteryData } from "./lib/lotterySync";

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
      console.log("[LotterySync] Auto-syncing lottery data on startup...");
      const results = await syncLotteryData();
      results.forEach((r) => {
        if (r.error) {
          console.error(`[LotterySync] ${r.gameName}: ERROR - ${r.error}`);
        } else {
          console.log(`[LotterySync] ${r.gameName}: ${r.inserted} new draws added (${r.totalInDb} total)`);
        }
      });
    } catch (err) {
      console.error("[LotterySync] Auto-sync failed:", err);
    }
  }, 3000);
});
