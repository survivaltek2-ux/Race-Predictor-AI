import { Router, type IRouter } from "express";
import { db, lotteryGames, lotteryResults, lotteryPredictions } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { runMLEnsemble, parseDrawResults } from "../lib/lotteryML";

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
    const { gameKey, method } = req.body;
    if (!gameKey) return res.status(400).json({ error: "gameKey is required" });

    const [game] = await db.select().from(lotteryGames).where(eq(lotteryGames.gameKey, gameKey));
    if (!game) return res.status(404).json({ error: "Lottery game not found" });

    const recentResults = await db
      .select()
      .from(lotteryResults)
      .where(eq(lotteryResults.gameId, game.id))
      .orderBy(desc(lotteryResults.drawDate))
      .limit(100);

    const historicalDraws = parseDrawResults(recentResults);

    const mlResult = runMLEnsemble(historicalDraws, game.maxNumber, game.numberOfPicks, game.bonusNumberMax);

    let aiAnalysis: any = null;
    let actualMethod = method || "hybrid";

    if (actualMethod === "hybrid" || actualMethod === "ai") {
      try {
        const allNumbers: number[] = [];
        const bonusNumbers: number[] = [];
        recentResults.forEach((result) => {
          const nums = result.winningNumbers.split(",").map((n) => parseInt(n.trim()));
          allNumbers.push(...nums);
          bonusNumbers.push(result.bonusNumber);
        });

        const frequency: Record<number, number> = {};
        allNumbers.forEach((num) => { frequency[num] = (frequency[num] || 0) + 1; });
        const sortedByFrequency = Object.entries(frequency)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 20)
          .map(([num]) => parseInt(num));

        const bonusFrequency: Record<number, number> = {};
        bonusNumbers.forEach((num) => { bonusFrequency[num] = (bonusFrequency[num] || 0) + 1; });
        const topBonuses = Object.entries(bonusFrequency)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([num]) => parseInt(num));

        const mlInsights = mlResult.algorithmBreakdown.map((a) => `${a.name}: ${a.insights.join("; ")}`).join("\n");

        const prompt = `You are a lottery prediction AI using machine learning insights. Analyze "${game.name}":

Historical Pattern Analysis:
- Most frequent numbers (last ${recentResults.length} draws): ${sortedByFrequency.join(", ")}
- Most frequent bonus numbers: ${topBonuses.join(", ")}
- Total draws analyzed: ${recentResults.length}

Machine Learning Ensemble Results:
- ML predicted numbers: ${mlResult.mainNumbers.join(", ")}
- ML predicted bonus: ${mlResult.bonusNumber}
- ML ensemble confidence: ${(mlResult.confidence * 100).toFixed(1)}%

Individual Algorithm Insights:
${mlInsights}

Consider the ML results alongside your own analysis. Generate ${game.numberOfPicks} main numbers (1-${game.maxNumber}) and 1 bonus number (1-${game.bonusNumberMax}).

Respond ONLY with valid JSON:
{
  "mainNumbers": [n1, n2, n3, n4, n5],
  "bonusNumber": n,
  "reasoning": "Brief explanation combining ML and AI analysis",
  "keyPatterns": ["pattern1", "pattern2", "pattern3"],
  "confidenceScore": 0.45
}`;

        const response = await openai.chat.completions.create({
          model: "gpt-5.2",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });

        const content = response.choices?.[0]?.message?.content;
        if (content) {
          const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const parsed = JSON.parse(cleaned);

          const validNumbers = Array.isArray(parsed.mainNumbers)
            ? [...new Set(parsed.mainNumbers.map(Number).filter((n: number) => !isNaN(n) && n >= 1 && n <= game.maxNumber))]
            : [];
          const validBonus = typeof parsed.bonusNumber === "number" && parsed.bonusNumber >= 1 && parsed.bonusNumber <= game.bonusNumberMax
            ? parsed.bonusNumber
            : null;
          const validConfidence = typeof parsed.confidenceScore === "number"
            ? Math.max(0, Math.min(1, parsed.confidenceScore))
            : 0.35;

          if (validNumbers.length >= game.numberOfPicks && validBonus !== null) {
            aiAnalysis = {
              mainNumbers: (validNumbers as number[]).slice(0, game.numberOfPicks).sort((a: number, b: number) => a - b),
              bonusNumber: validBonus,
              confidenceScore: validConfidence,
              reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "AI pattern analysis",
              keyPatterns: Array.isArray(parsed.keyPatterns) ? parsed.keyPatterns.filter((p: any) => typeof p === "string") : [],
            };
          }
        }
      } catch (aiErr) {
        console.error("AI analysis failed, falling back to ML:", aiErr);
      }

      if (!aiAnalysis && actualMethod === "ai") {
        actualMethod = "ml-fallback";
      }
    }

    let finalNumbers: number[];
    let finalBonus: number;
    let finalConfidence: number;
    let finalReasoning: string;
    let finalPatterns: string[];

    if (actualMethod === "ml" || actualMethod === "ml-fallback" || !aiAnalysis) {
      finalNumbers = mlResult.mainNumbers;
      finalBonus = mlResult.bonusNumber;
      finalConfidence = mlResult.confidence;
      const fallbackNote = actualMethod === "ml-fallback" ? " (AI unavailable, ML fallback)" : "";
      finalReasoning = `ML Ensemble prediction using ${mlResult.algorithmBreakdown.length} algorithms: ${mlResult.algorithmBreakdown.map((a) => a.name).join(", ")}${fallbackNote}`;
      finalPatterns = mlResult.algorithmBreakdown.flatMap((a) => a.insights).slice(0, 6);
    } else if (actualMethod === "ai") {
      finalNumbers = aiAnalysis.mainNumbers;
      finalBonus = aiAnalysis.bonusNumber;
      finalConfidence = aiAnalysis.confidenceScore;
      finalReasoning = aiAnalysis.reasoning;
      finalPatterns = aiAnalysis.keyPatterns || [];
    } else {
      const hybridVotes: Record<number, number> = {};
      mlResult.mainNumbers.forEach((n) => { hybridVotes[n] = (hybridVotes[n] || 0) + mlResult.confidence; });
      aiAnalysis.mainNumbers.forEach((n: number) => { hybridVotes[n] = (hybridVotes[n] || 0) + aiAnalysis.confidenceScore; });

      const sorted = Object.entries(hybridVotes)
        .map(([n, v]) => ({ number: parseInt(n), votes: v }))
        .sort((a, b) => b.votes - a.votes);

      let hybridNumbers = sorted.slice(0, game.numberOfPicks).map((s) => s.number);
      if (hybridNumbers.length < game.numberOfPicks) {
        const existing = new Set(hybridNumbers);
        for (let i = 1; i <= game.maxNumber && hybridNumbers.length < game.numberOfPicks; i++) {
          if (!existing.has(i)) hybridNumbers.push(i);
        }
      }
      finalNumbers = hybridNumbers.sort((a, b) => a - b);
      finalBonus = mlResult.confidence > aiAnalysis.confidenceScore ? mlResult.bonusNumber : aiAnalysis.bonusNumber;
      finalConfidence = Math.max(0, Math.min(1, mlResult.confidence * 0.5 + aiAnalysis.confidenceScore * 0.5));
      finalReasoning = `Hybrid prediction combining ML ensemble (${(mlResult.confidence * 100).toFixed(0)}% conf) with AI analysis (${(aiAnalysis.confidenceScore * 100).toFixed(0)}% conf). ${aiAnalysis.reasoning}`;
      finalPatterns = [...(aiAnalysis.keyPatterns || []), ...mlResult.algorithmBreakdown.flatMap((a) => a.insights).slice(0, 3)];
    }

    const fullAnalysis = {
      method: actualMethod,
      mlEnsemble: {
        mainNumbers: mlResult.mainNumbers,
        bonusNumber: mlResult.bonusNumber,
        confidence: mlResult.confidence,
        ensembleWeights: mlResult.ensembleWeights,
        algorithmBreakdown: mlResult.algorithmBreakdown.map((a) => ({
          name: a.name,
          description: a.description,
          predictedNumbers: a.predictedNumbers,
          predictedBonus: a.predictedBonus,
          weight: a.weight,
          confidence: a.confidence,
          insights: a.insights,
        })),
      },
      aiAnalysis: aiAnalysis ? {
        mainNumbers: aiAnalysis.mainNumbers,
        bonusNumber: aiAnalysis.bonusNumber,
        confidence: aiAnalysis.confidenceScore,
        reasoning: aiAnalysis.reasoning,
        keyPatterns: aiAnalysis.keyPatterns,
      } : null,
      keyPatterns: finalPatterns,
      historicalDrawsAnalyzed: recentResults.length,
    };

    const predicted = await db
      .insert(lotteryPredictions)
      .values({
        gameId: game.id,
        predictedNumbers: finalNumbers.join(","),
        bonusNumber: finalBonus,
        confidenceScore: finalConfidence.toFixed(2),
        reasoning: finalReasoning,
        analysisJson: fullAnalysis,
      })
      .returning();

    res.json({
      id: predicted[0].id,
      gameKey,
      gameName: game.name,
      method: actualMethod,
      mainNumbers: finalNumbers,
      bonusNumber: finalBonus,
      confidenceScore: finalConfidence,
      reasoning: finalReasoning,
      keyPatterns: finalPatterns,
      mlEnsemble: fullAnalysis.mlEnsemble,
      aiAnalysis: fullAnalysis.aiAnalysis,
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
    method: analysis.method || "ai",
    keyPatterns: analysis.keyPatterns || [],
    mlEnsemble: analysis.mlEnsemble || null,
    aiAnalysis: analysis.aiAnalysis || null,
    wasCorrect: p.wasCorrect ?? null,
    matchedNumbers: p.matchedNumbers ?? null,
    createdAt: p.createdAt,
  };
}

export default router;
