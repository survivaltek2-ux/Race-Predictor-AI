import { Router, type IRouter } from "express";
import { db, lotteryGames, lotteryResults, lotteryPredictions } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

router.get("/lottery/games", async (_req, res) => {
  try {
    const games = await db.select().from(lotteryGames);
    res.json(games);
  } catch (err) {
    console.error("Error fetching lottery games:", err);
    res.status(500).json({ error: "Failed to fetch lottery games" });
  }
});

router.get("/lottery/predictions", async (req, res) => {
  try {
    const gameKey = req.query.gameKey as string | undefined;
    let preds = await db.select().from(lotteryPredictions).orderBy(desc(lotteryPredictions.createdAt));

    if (gameKey) {
      const [game] = await db.select().from(lotteryGames).where(eq(lotteryGames.gameKey, gameKey));
      if (game) {
        preds = preds.filter((p) => p.gameId === game.id);
      }
    }

    res.json({ predictions: preds.map(formatLotteryPrediction) });
  } catch (err) {
    console.error("Error fetching lottery predictions:", err);
    res.status(500).json({ error: "Failed to fetch lottery predictions" });
  }
});

router.post("/lottery/predictions/generate", async (req, res) => {
  try {
    const { gameKey } = req.body;
    if (!gameKey) return res.status(400).json({ error: "gameKey is required" });

    // Get game info
    const [game] = await db.select().from(lotteryGames).where(eq(lotteryGames.gameKey, gameKey));
    if (!game) return res.status(404).json({ error: "Lottery game not found" });

    // Get recent historical results
    const recentResults = await db
      .select()
      .from(lotteryResults)
      .where(eq(lotteryResults.gameId, game.id))
      .orderBy(desc(lotteryResults.drawDate))
      .limit(50);

    // Analyze patterns
    const allNumbers: number[] = [];
    const bonusNumbers: number[] = [];
    
    recentResults.forEach((result) => {
      const nums = result.winningNumbers.split(",").map((n) => parseInt(n.trim()));
      allNumbers.push(...nums);
      bonusNumbers.push(result.bonusNumber);
    });

    // Frequency analysis
    const frequency: Record<number, number> = {};
    allNumbers.forEach((num) => {
      frequency[num] = (frequency[num] || 0) + 1;
    });

    const sortedByFrequency = Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([num]) => parseInt(num));

    const bonusFrequency: Record<number, number> = {};
    bonusNumbers.forEach((num) => {
      bonusFrequency[num] = (bonusFrequency[num] || 0) + 1;
    });

    const topBonuses = Object.entries(bonusFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([num]) => parseInt(num));

    // Use AI to generate predictions based on patterns
    const prompt = `You are a lottery prediction AI. Analyze the lottery game "${game.name}" with the following patterns:

Recent Winning Numbers Analysis:
- Most frequent numbers (last 50 draws): ${sortedByFrequency.join(", ")}
- Most frequent bonus numbers: ${topBonuses.join(", ")}
- Total historical draws analyzed: ${recentResults.length}

Your task:
1. Identify number clusters and patterns
2. Consider hot numbers (recently drawn) vs cold numbers (long time since drawn)
3. Avoid overweighting recent patterns (consider 20-draw window)
4. Generate ${game.numberOfPicks} main numbers between 1 and ${game.maxNumber}
5. Generate 1 bonus number between 1 and ${game.bonusNumberMax}

Respond ONLY with valid JSON in this exact format:
{
  "mainNumbers": [n1, n2, n3, n4, n5],
  "bonusNumber": n,
  "reasoning": "Brief explanation of pattern analysis",
  "keyPatterns": ["pattern1", "pattern2"],
  "confidenceScore": 0.45
}`;

    const response = await openai.messages.create({
      model: "gpt-5.2",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    let analysis;
    try {
      analysis = JSON.parse(content.text);
    } catch {
      // Fallback: Generate random prediction if AI response fails
      const shuffled = Array.from({ length: game.maxNumber }, (_, i) => i + 1)
        .sort(() => Math.random() - 0.5)
        .slice(0, game.numberOfPicks);
      const bonus = Math.floor(Math.random() * game.bonusNumberMax) + 1;
      analysis = {
        mainNumbers: shuffled,
        bonusNumber: bonus,
        reasoning: "Random selection",
        keyPatterns: [],
        confidenceScore: 0.35,
      };
    }

    const predicted = await db
      .insert(lotteryPredictions)
      .values({
        gameId: game.id,
        predictedNumbers: analysis.mainNumbers.join(","),
        bonusNumber: analysis.bonusNumber,
        confidenceScore: analysis.confidenceScore,
        reasoning: analysis.reasoning,
        analysisJson: analysis,
      })
      .returning();

    res.json({
      id: predicted[0].id,
      gameKey,
      gameName: game.name,
      mainNumbers: analysis.mainNumbers,
      bonusNumber: analysis.bonusNumber,
      confidenceScore: analysis.confidenceScore,
      reasoning: analysis.reasoning,
      keyPatterns: analysis.keyPatterns || [],
      createdAt: predicted[0].createdAt,
    });
  } catch (err) {
    console.error("Error generating lottery prediction:", err);
    res.status(500).json({ error: "Failed to generate prediction" });
  }
});

router.patch("/lottery/predictions/:id/result", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { wasCorrect, matchedNumbers } = req.body;

    const [updated] = await db
      .update(lotteryPredictions)
      .set({ wasCorrect, matchedNumbers })
      .where(eq(lotteryPredictions.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Prediction not found" });
    res.json({ success: true, id: updated.id });
  } catch (err) {
    console.error("Error updating prediction result:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/lottery/stats", async (req, res) => {
  try {
    const gameKey = req.query.gameKey as string | undefined;
    let preds = await db.select().from(lotteryPredictions);

    if (gameKey) {
      const [game] = await db.select().from(lotteryGames).where(eq(lotteryGames.gameKey, gameKey));
      if (game) {
        preds = preds.filter((p) => p.gameId === game.id);
      }
    }

    const total = preds.length;
    const withResult = preds.filter((p) => p.wasCorrect !== null && p.wasCorrect !== undefined);
    const correct = withResult.filter((p) => p.wasCorrect).length;
    const accuracy = withResult.length > 0 ? Number(((correct / withResult.length) * 100).toFixed(1)) : 0;
    const avgConf = total > 0 ? Number((preds.reduce((s, p) => s + (Number(p.confidenceScore) || 0), 0) / total).toFixed(3)) : 0;
    
    res.json({ totalPredictions: total, correctPredictions: correct, accuracyPercentage: accuracy, averageConfidence: avgConf });
  } catch (err) {
    console.error("Error fetching lottery stats:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatLotteryPrediction(p: any) {
  let analysis: any = {};
  try {
    analysis = typeof p.analysisJson === "string" ? JSON.parse(p.analysisJson) : p.analysisJson || {};
  } catch {}

  const mainNumbers = p.predictedNumbers.split(",").map((n: string) => parseInt(n.trim()));

  return {
    id: p.id,
    gameId: p.gameId,
    mainNumbers,
    bonusNumber: p.bonusNumber,
    confidenceScore: Number(p.confidenceScore),
    reasoning: p.reasoning,
    keyPatterns: analysis.keyPatterns || [],
    wasCorrect: p.wasCorrect ?? null,
    matchedNumbers: p.matchedNumbers ?? null,
    createdAt: p.createdAt,
  };
}

export default router;
