import { db, mlMetricsTable, sportsPredictionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

interface AlgorithmStats {
  name: string;
  predictions: number;
  correct: number;
  accuracy: number;
  avgConfidence: number;
  calibration: number; // How well confidence matches actual accuracy
  insights: string[];
}

interface SportsMLMetrics {
  sportKey: string;
  totalPredictions: number;
  resolvedPredictions: number;
  overallAccuracy: number;
  avgConfidence: number;
  calibrationError: number;
  algorithmStats: AlgorithmStats[];
  confidenceDistribution: Record<string, number>;
  accuracyTrend: Array<{ date: string; accuracy: number; count: number }>;
}

export async function recordMLPrediction(
  predictionId: number,
  sportKey: string,
  mlPrediction: any
): Promise<void> {
  if (!mlPrediction?.algorithmBreakdown) return;

  for (const algo of mlPrediction.algorithmBreakdown) {
    await db.insert(mlMetricsTable).values({
      sportKey,
      predictionId,
      algorithmName: algo.name,
      homeWinProb: algo.homeWinProb,
      awayWinProb: algo.awayWinProb,
      drawProb: algo.drawProb ?? 0,
      confidence: algo.confidence,
      projectedTotal: algo.projectedTotal,
      insights: JSON.stringify(algo.insights ?? []),
    });
  }
}

export async function updateMLMetricsWithResult(
  predictionId: number,
  wasCorrect: boolean,
  actualWinner: string
): Promise<void> {
  const metrics = await db
    .select()
    .from(mlMetricsTable)
    .where(eq(mlMetricsTable.predictionId, predictionId));

  for (const metric of metrics) {
    await db
      .update(mlMetricsTable)
      .set({
        wasCorrect: wasCorrect ? 1 : 0,
        actualWinner,
        resolvedAt: new Date(),
      })
      .where(eq(mlMetricsTable.id, metric.id));
  }
}

export async function getMLMetricsForSport(sportKey: string): Promise<SportsMLMetrics> {
  const allMetrics = await db
    .select()
    .from(mlMetricsTable)
    .where(eq(mlMetricsTable.sportKey, sportKey))
    .orderBy(desc(mlMetricsTable.createdAt));

  if (allMetrics.length === 0) {
    return {
      sportKey,
      totalPredictions: 0,
      resolvedPredictions: 0,
      overallAccuracy: 0,
      avgConfidence: 0,
      calibrationError: 0,
      algorithmStats: [],
      confidenceDistribution: {},
      accuracyTrend: [],
    };
  }

  const resolved = allMetrics.filter((m) => m.wasCorrect !== null);
  const correct = resolved.filter((m) => m.wasCorrect === 1);

  const algorithmMap = new Map<string, AlgorithmStats>();

  for (const metric of allMetrics) {
    if (!algorithmMap.has(metric.algorithmName)) {
      algorithmMap.set(metric.algorithmName, {
        name: metric.algorithmName,
        predictions: 0,
        correct: 0,
        accuracy: 0,
        avgConfidence: 0,
        calibration: 0,
        insights: [],
      });
    }

    const stats = algorithmMap.get(metric.algorithmName)!;
    stats.predictions++;
    if (metric.wasCorrect === 1) stats.correct++;
  }

  for (const stats of algorithmMap.values()) {
    stats.accuracy = stats.predictions > 0 ? (stats.correct / stats.predictions) * 100 : 0;

    const metricsForAlgo = allMetrics.filter((m) => m.algorithmName === stats.name);
    stats.avgConfidence =
      metricsForAlgo.length > 0
        ? (metricsForAlgo.reduce((s, m) => s + m.confidence, 0) / metricsForAlgo.length) * 100
        : 0;

    stats.calibration = Math.abs(stats.accuracy - stats.avgConfidence);

    try {
      const allInsights = metricsForAlgo
        .flatMap((m) => (m.insights ? JSON.parse(m.insights) : []))
        .slice(0, 3);
      stats.insights = Array.from(new Set(allInsights));
    } catch {
      stats.insights = [];
    }
  }

  // Confidence distribution
  const confidenceBins: Record<string, number> = {
    "0-20%": 0,
    "20-40%": 0,
    "40-60%": 0,
    "60-80%": 0,
    "80-100%": 0,
  };

  for (const metric of allMetrics) {
    const confPct = metric.confidence * 100;
    if (confPct < 20) confidenceBins["0-20%"]++;
    else if (confPct < 40) confidenceBins["20-40%"]++;
    else if (confPct < 60) confidenceBins["40-60%"]++;
    else if (confPct < 80) confidenceBins["60-80%"]++;
    else confidenceBins["80-100%"]++;
  }

  // Accuracy trend over time (last 7 days)
  const accuracyTrend: Array<{ date: string; accuracy: number; count: number }> = [];
  const trendMap = new Map<string, { correct: number; total: number }>();

  for (const metric of resolved.slice(-100)) {
    const date = metric.createdAt ? new Date(metric.createdAt).toISOString().split("T")[0] : "unknown";
    if (!trendMap.has(date)) {
      trendMap.set(date, { correct: 0, total: 0 });
    }
    const day = trendMap.get(date)!;
    day.total++;
    if (metric.wasCorrect === 1) day.correct++;
  }

  for (const [date, { correct, total }] of Array.from(trendMap.entries()).sort()) {
    accuracyTrend.push({
      date,
      accuracy: total > 0 ? (correct / total) * 100 : 0,
      count: total,
    });
  }

  const overallAccuracy = resolved.length > 0 ? (correct.length / resolved.length) * 100 : 0;
  const avgConfidence = allMetrics.length > 0 ? (allMetrics.reduce((s, m) => s + m.confidence, 0) / allMetrics.length) * 100 : 0;
  const calibrationError = Math.abs(overallAccuracy - avgConfidence);

  return {
    sportKey,
    totalPredictions: allMetrics.length,
    resolvedPredictions: resolved.length,
    overallAccuracy: Number(overallAccuracy.toFixed(1)),
    avgConfidence: Number(avgConfidence.toFixed(1)),
    calibrationError: Number(calibrationError.toFixed(1)),
    algorithmStats: Array.from(algorithmMap.values()).sort((a, b) => b.accuracy - a.accuracy),
    confidenceDistribution: confidenceBins,
    accuracyTrend,
  };
}

export async function getAllSportsMLMetrics(): Promise<Record<string, SportsMLMetrics>> {
  const sports = await db
    .selectDistinct({ sportKey: mlMetricsTable.sportKey })
    .from(mlMetricsTable);

  const results: Record<string, SportsMLMetrics> = {};

  for (const { sportKey } of sports) {
    results[sportKey] = await getMLMetricsForSport(sportKey);
  }

  return results;
}

export async function getMLDriftDetection(sportKey: string, windowSize: number = 20): Promise<{
  hasDrift: boolean;
  recentAccuracy: number;
  historicalAccuracy: number;
  driftThreshold: number;
  details: string;
}> {
  const resolved = await db
    .select()
    .from(mlMetricsTable)
    .where(and(eq(mlMetricsTable.sportKey, sportKey), sql`${mlMetricsTable.wasCorrect} IS NOT NULL`))
    .orderBy(desc(mlMetricsTable.resolvedAt));

  if (resolved.length < windowSize * 2) {
    return {
      hasDrift: false,
      recentAccuracy: 0,
      historicalAccuracy: 0,
      driftThreshold: 10,
      details: "Not enough data for drift detection",
    };
  }

  const recent = resolved.slice(0, windowSize);
  const historical = resolved.slice(windowSize, windowSize * 2);

  const recentAccuracy = (recent.filter((m) => m.wasCorrect === 1).length / recent.length) * 100;
  const historicalAccuracy = (historical.filter((m) => m.wasCorrect === 1).length / historical.length) * 100;

  const drift = Math.abs(recentAccuracy - historicalAccuracy);
  const driftThreshold = 10;
  const hasDrift = drift > driftThreshold;

  return {
    hasDrift,
    recentAccuracy: Number(recentAccuracy.toFixed(1)),
    historicalAccuracy: Number(historicalAccuracy.toFixed(1)),
    driftThreshold,
    details: hasDrift
      ? `Model drift detected: recent accuracy ${recentAccuracy.toFixed(1)}% vs historical ${historicalAccuracy.toFixed(1)}%`
      : "No significant model drift",
  };
}
