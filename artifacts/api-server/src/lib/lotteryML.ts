interface DrawResult {
  numbers: number[];
  bonusNumber: number;
  drawDate: Date;
}

interface MLPrediction {
  mainNumbers: number[];
  bonusNumber: number;
  confidence: number;
  algorithmBreakdown: AlgorithmResult[];
  ensembleWeights: Record<string, number>;
}

interface AlgorithmResult {
  name: string;
  description: string;
  predictedNumbers: number[];
  predictedBonus: number;
  weight: number;
  confidence: number;
  insights: string[];
}

interface NumberScore {
  number: number;
  score: number;
}

function generateRandom(picks: number, maxNumber: number): number[] {
  const nums = new Set<number>();
  while (nums.size < picks) {
    nums.add(Math.floor(Math.random() * maxNumber) + 1);
  }
  return Array.from(nums).sort((a, b) => a - b);
}

function fillRandom(existing: number[], picks: number, maxNumber: number): number[] {
  const nums = new Set(existing);
  while (nums.size < picks) {
    nums.add(Math.floor(Math.random() * maxNumber) + 1);
  }
  return Array.from(nums).sort((a, b) => a - b);
}

function makeDefaultResult(name: string, desc: string, weight: number, picks: number, maxNumber: number, bonusMax: number): AlgorithmResult {
  return {
    name,
    description: desc,
    predictedNumbers: generateRandom(picks, maxNumber),
    predictedBonus: Math.floor(Math.random() * bonusMax) + 1,
    weight,
    confidence: 0.15,
    insights: ["No historical data — using randomized baseline"],
  };
}

function weightedFrequencyAnalysis(
  draws: DrawResult[],
  maxNumber: number,
  picks: number,
  bonusMax: number
): AlgorithmResult {
  if (draws.length === 0) {
    return makeDefaultResult("Weighted Frequency", "Exponentially weights recent draws to identify trending numbers", 0.25, picks, maxNumber, bonusMax);
  }

  const scores: Record<number, number> = {};
  const bonusScores: Record<number, number> = {};

  for (let i = 1; i <= maxNumber; i++) scores[i] = 0;
  for (let i = 1; i <= bonusMax; i++) bonusScores[i] = 0;

  const totalDraws = draws.length;
  draws.forEach((draw, idx) => {
    const recencyWeight = Math.exp(-0.05 * idx);
    draw.numbers.forEach((n) => {
      if (n >= 1 && n <= maxNumber) scores[n] = (scores[n] || 0) + recencyWeight;
    });
    if (draw.bonusNumber >= 1 && draw.bonusNumber <= bonusMax) {
      bonusScores[draw.bonusNumber] = (bonusScores[draw.bonusNumber] || 0) + recencyWeight;
    }
  });

  const sorted = Object.entries(scores)
    .map(([n, s]) => ({ number: parseInt(n), score: s }))
    .sort((a, b) => b.score - a.score);

  const insights: string[] = [];
  const hotNumbers = sorted.slice(0, 5).map((s) => s.number);
  const coldNumbers = sorted.slice(-5).map((s) => s.number);
  insights.push(`Hot numbers (weighted): ${hotNumbers.join(", ")}`);
  insights.push(`Cold numbers: ${coldNumbers.join(", ")}`);

  const predicted = sorted.slice(0, picks).map((s) => s.number).sort((a, b) => a - b);
  const bonusSorted = Object.entries(bonusScores)
    .map(([n, s]) => ({ number: parseInt(n), score: s }))
    .sort((a, b) => b.score - a.score);

  const topScore = sorted[0]?.score || 1;
  const avgScore = sorted.reduce((s, v) => s + v.score, 0) / sorted.length || 1;
  const confidence = Math.min(0.95, 0.3 + (topScore - avgScore) / topScore * 0.4 + Math.min(totalDraws / 100, 0.25));

  return {
    name: "Weighted Frequency",
    description: "Exponentially weights recent draws to identify trending numbers",
    predictedNumbers: predicted,
    predictedBonus: bonusSorted[0]?.number || 1,
    weight: 0.25,
    confidence: Math.max(0.15, confidence),
    insights,
  };
}

function gapAnalysis(
  draws: DrawResult[],
  maxNumber: number,
  picks: number,
  bonusMax: number
): AlgorithmResult {
  if (draws.length === 0) {
    return makeDefaultResult("Gap Analysis", "Identifies overdue numbers based on average appearance intervals", 0.2, picks, maxNumber, bonusMax);
  }

  const lastSeen: Record<number, number> = {};
  const insights: string[] = [];

  for (let i = 1; i <= maxNumber; i++) lastSeen[i] = draws.length;

  draws.forEach((draw, idx) => {
    draw.numbers.forEach((n) => {
      if (n >= 1 && n <= maxNumber && lastSeen[n] === draws.length) {
        lastSeen[n] = idx;
      }
    });
  });

  const overdueNumbers: NumberScore[] = [];
  for (let n = 1; n <= maxNumber; n++) {
    overdueNumbers.push({ number: n, score: lastSeen[n] });
  }

  overdueNumbers.sort((a, b) => b.score - a.score);
  const topOverdue = overdueNumbers.slice(0, 5).map((o) => o.number);
  insights.push(`Most overdue numbers: ${topOverdue.join(", ")}`);

  const predicted = overdueNumbers.slice(0, picks).map((o) => o.number).sort((a, b) => a - b);

  const bonusLastSeen: Record<number, number> = {};
  for (let i = 1; i <= bonusMax; i++) bonusLastSeen[i] = draws.length;
  draws.forEach((draw, idx) => {
    if (draw.bonusNumber >= 1 && draw.bonusNumber <= bonusMax && bonusLastSeen[draw.bonusNumber] === draws.length) {
      bonusLastSeen[draw.bonusNumber] = idx;
    }
  });
  const bonusOverdue = Object.entries(bonusLastSeen)
    .map(([n, gap]) => ({ number: parseInt(n), gap }))
    .sort((a, b) => b.gap - a.gap);

  const maxGap = overdueNumbers[0]?.score || 1;
  const confidence = Math.min(0.85, 0.25 + Math.min(maxGap / draws.length, 0.6));

  return {
    name: "Gap Analysis",
    description: "Identifies overdue numbers based on average appearance intervals",
    predictedNumbers: predicted,
    predictedBonus: bonusOverdue[0]?.number || 1,
    weight: 0.2,
    confidence: Math.max(0.15, confidence),
    insights,
  };
}

function pairClusterAnalysis(
  draws: DrawResult[],
  maxNumber: number,
  picks: number,
  bonusMax: number
): AlgorithmResult {
  if (draws.length < 3) {
    return makeDefaultResult("Pair Clustering", "Identifies frequently co-occurring number pairs and clusters", 0.15, picks, maxNumber, bonusMax);
  }

  const pairFreq: Record<string, number> = {};
  const insights: string[] = [];

  draws.forEach((draw) => {
    const nums = [...draw.numbers].sort((a, b) => a - b);
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const key = `${nums[i]}-${nums[j]}`;
        pairFreq[key] = (pairFreq[key] || 0) + 1;
      }
    }
  });

  const topPairs = Object.entries(pairFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  insights.push(`Top pairs: ${topPairs.slice(0, 3).map(([p, c]) => `(${p}): ${c}x`).join(", ")}`);

  const numberFromPairs: Record<number, number> = {};
  topPairs.forEach(([pair, count]) => {
    const [a, b] = pair.split("-").map(Number);
    numberFromPairs[a] = (numberFromPairs[a] || 0) + count;
    numberFromPairs[b] = (numberFromPairs[b] || 0) + count;
  });

  const sorted = Object.entries(numberFromPairs)
    .map(([n, s]) => ({ number: parseInt(n), score: s }))
    .sort((a, b) => b.score - a.score);

  const predicted = sorted.slice(0, picks).map((s) => s.number).sort((a, b) => a - b);

  const bonusFreq: Record<number, number> = {};
  draws.forEach((d) => {
    bonusFreq[d.bonusNumber] = (bonusFreq[d.bonusNumber] || 0) + 1;
  });
  const topBonus = Object.entries(bonusFreq).sort(([, a], [, b]) => b - a);

  const confidence = Math.min(0.8, 0.2 + (topPairs[0]?.[1] || 0) / draws.length * 2);

  return {
    name: "Pair Clustering",
    description: "Identifies frequently co-occurring number pairs and clusters",
    predictedNumbers: predicted.length >= picks ? predicted : fillRandom(predicted, picks, maxNumber),
    predictedBonus: parseInt(topBonus[0]?.[0] || "1"),
    weight: 0.15,
    confidence: Math.max(0.15, confidence),
    insights,
  };
}

function movingAverageTrend(
  draws: DrawResult[],
  maxNumber: number,
  picks: number,
  bonusMax: number
): AlgorithmResult {
  if (draws.length < 6) {
    return makeDefaultResult("Moving Average Trend", "Detects trending numbers using moving average crossover", 0.1, picks, maxNumber, bonusMax);
  }

  const windowSize = Math.min(10, Math.floor(draws.length / 2));
  const insights: string[] = [];

  const shortWindow = draws.slice(0, windowSize);
  const longWindow = draws.slice(0, windowSize * 2);

  const shortFreq: Record<number, number> = {};
  const longFreq: Record<number, number> = {};

  shortWindow.forEach((d) => d.numbers.forEach((n) => { shortFreq[n] = (shortFreq[n] || 0) + 1; }));
  longWindow.forEach((d) => d.numbers.forEach((n) => { longFreq[n] = (longFreq[n] || 0) + 1; }));

  const trendScores: NumberScore[] = [];
  for (let n = 1; n <= maxNumber; n++) {
    const shortRate = (shortFreq[n] || 0) / windowSize;
    const longRate = (longFreq[n] || 0) / (windowSize * 2);
    const trend = shortRate - longRate;
    trendScores.push({ number: n, score: trend });
  }

  trendScores.sort((a, b) => b.score - a.score);
  const trending = trendScores.filter((t) => t.score > 0).slice(0, 5);
  const declining = trendScores.filter((t) => t.score < 0).slice(-3);
  insights.push(`Trending up: ${trending.map((t) => t.number).join(", ") || "none"}`);
  insights.push(`Trending down: ${declining.map((t) => t.number).join(", ") || "none"}`);

  const predicted = trendScores.slice(0, picks).map((t) => t.number).sort((a, b) => a - b);

  const shortBonusFreq: Record<number, number> = {};
  shortWindow.forEach((d) => { shortBonusFreq[d.bonusNumber] = (shortBonusFreq[d.bonusNumber] || 0) + 1; });
  const topBonus = Object.entries(shortBonusFreq).sort(([, a], [, b]) => b - a);

  const avgTrend = trending.length > 0 ? trending.reduce((s, t) => s + t.score, 0) / trending.length : 0;
  const confidence = Math.min(0.75, 0.25 + avgTrend * 2);

  return {
    name: "Moving Average Trend",
    description: "Detects trending numbers using moving average crossover",
    predictedNumbers: predicted,
    predictedBonus: parseInt(topBonus[0]?.[0] || String(Math.floor(Math.random() * bonusMax) + 1)),
    weight: 0.1,
    confidence: Math.max(0.15, confidence),
    insights,
  };
}

function monteCarloSimulation(
  draws: DrawResult[],
  maxNumber: number,
  picks: number,
  bonusMax: number
): AlgorithmResult {
  const SIMULATIONS = 10000;
  const insights: string[] = [];

  if (draws.length === 0) {
    const result = makeDefaultResult("Monte Carlo Simulation", `Ran ${SIMULATIONS.toLocaleString()} uniform random simulations (no historical bias)`, 0.25, picks, maxNumber, bonusMax);
    result.insights = [`${SIMULATIONS.toLocaleString()} simulations run (uniform distribution — no historical data)`];
    return result;
  }

  const freq: Record<number, number> = {};
  const bonusFreq: Record<number, number> = {};

  for (let i = 1; i <= maxNumber; i++) freq[i] = 1;
  for (let i = 1; i <= bonusMax; i++) bonusFreq[i] = 1;

  draws.forEach((draw, idx) => {
    const weight = 1 + (draws.length - idx) / draws.length;
    draw.numbers.forEach((n) => {
      if (n >= 1 && n <= maxNumber) freq[n] = (freq[n] || 1) + weight;
    });
    if (draw.bonusNumber >= 1 && draw.bonusNumber <= bonusMax) {
      bonusFreq[draw.bonusNumber] = (bonusFreq[draw.bonusNumber] || 1) + weight;
    }
  });

  const simResults: Record<number, number> = {};
  const bonusSimResults: Record<number, number> = {};
  for (let i = 1; i <= maxNumber; i++) simResults[i] = 0;
  for (let i = 1; i <= bonusMax; i++) bonusSimResults[i] = 0;

  const totalWeight = Object.values(freq).reduce((a, b) => a + b, 0);
  const cdf: number[] = [];
  let cumulative = 0;
  for (let i = 1; i <= maxNumber; i++) {
    cumulative += freq[i] / totalWeight;
    cdf.push(cumulative);
  }

  const bonusTotalWeight = Object.values(bonusFreq).reduce((a, b) => a + b, 0);
  const bonusCdf: number[] = [];
  let bonusCumulative = 0;
  for (let i = 1; i <= bonusMax; i++) {
    bonusCumulative += bonusFreq[i] / bonusTotalWeight;
    bonusCdf.push(bonusCumulative);
  }

  for (let sim = 0; sim < SIMULATIONS; sim++) {
    const picked = new Set<number>();
    while (picked.size < picks) {
      const r = Math.random();
      for (let i = 0; i < cdf.length; i++) {
        if (r <= cdf[i]) {
          picked.add(i + 1);
          break;
        }
      }
    }
    picked.forEach((n) => { simResults[n]++; });

    const br = Math.random();
    for (let i = 0; i < bonusCdf.length; i++) {
      if (br <= bonusCdf[i]) {
        bonusSimResults[i + 1]++;
        break;
      }
    }
  }

  const sorted = Object.entries(simResults)
    .map(([n, c]) => ({ number: parseInt(n), score: c }))
    .sort((a, b) => b.score - a.score);

  const predicted = sorted.slice(0, picks).map((s) => s.number).sort((a, b) => a - b);

  const bonusSorted = Object.entries(bonusSimResults)
    .map(([n, c]) => ({ number: parseInt(n), score: c }))
    .sort((a, b) => b.score - a.score);

  const topPickRate = (sorted[0]?.score || 0) / SIMULATIONS * 100;
  insights.push(`${SIMULATIONS.toLocaleString()} simulations run`);
  insights.push(`Top pick appeared in ${topPickRate.toFixed(1)}% of simulations`);
  insights.push(`Convergence: ${topPickRate > 15 ? "Strong" : topPickRate > 10 ? "Moderate" : "Weak"}`);

  const confidence = Math.min(0.85, 0.3 + topPickRate / 100 * 2);

  return {
    name: "Monte Carlo Simulation",
    description: `Ran ${SIMULATIONS.toLocaleString()} weighted random simulations to find statistically favored numbers`,
    predictedNumbers: predicted,
    predictedBonus: bonusSorted[0]?.number || 1,
    weight: 0.25,
    confidence: Math.max(0.15, confidence),
    insights,
  };
}

function sumDistributionAnalysis(
  draws: DrawResult[],
  maxNumber: number,
  picks: number,
  bonusMax: number
): AlgorithmResult {
  if (draws.length < 3) {
    const result = makeDefaultResult("Sum Distribution", "Ensures predicted numbers follow statistical sum distribution", 0.05, picks, maxNumber, bonusMax);
    result.insights = ["Insufficient data for sum distribution analysis"];
    return result;
  }

  const insights: string[] = [];
  const sums = draws.map((d) => d.numbers.reduce((a, b) => a + b, 0));
  const avgSum = sums.reduce((a, b) => a + b, 0) / sums.length;
  const stdDev = Math.sqrt(sums.reduce((a, s) => a + (s - avgSum) ** 2, 0) / sums.length) || 20;

  insights.push(`Average sum: ${avgSum.toFixed(0)} (±${stdDev.toFixed(0)})`);

  const targetSum = avgSum + (Math.random() - 0.5) * stdDev * 0.5;

  let bestCombo: number[] = generateRandom(picks, maxNumber);
  let bestDiff = Math.abs(bestCombo.reduce((a, b) => a + b, 0) - targetSum);

  for (let attempt = 0; attempt < 5000; attempt++) {
    const combo = generateRandom(picks, maxNumber);
    const sum = combo.reduce((a, b) => a + b, 0);
    const diff = Math.abs(sum - targetSum);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestCombo = combo;
    }
  }

  insights.push(`Target sum range: ${Math.round(targetSum - stdDev / 2)} - ${Math.round(targetSum + stdDev / 2)}`);
  insights.push(`Selected combo sum: ${bestCombo.reduce((a, b) => a + b, 0)}`);

  const bonusFreq: Record<number, number> = {};
  draws.forEach((d) => { bonusFreq[d.bonusNumber] = (bonusFreq[d.bonusNumber] || 0) + 1; });
  const topBonus = Object.entries(bonusFreq).sort(([, a], [, b]) => b - a);

  const confidence = Math.min(0.7, 0.25 + Math.max(0, 1 - bestDiff / avgSum) * 0.3);

  return {
    name: "Sum Distribution",
    description: "Ensures predicted numbers follow the statistical sum distribution of historical draws",
    predictedNumbers: bestCombo.sort((a, b) => a - b),
    predictedBonus: parseInt(topBonus[0]?.[0] || String(Math.floor(Math.random() * bonusMax) + 1)),
    weight: 0.05,
    confidence: Math.max(0.15, confidence),
    insights,
  };
}

export function runMLEnsemble(
  historicalDraws: DrawResult[],
  maxNumber: number,
  picks: number,
  bonusMax: number
): MLPrediction {
  const algorithms: AlgorithmResult[] = [
    weightedFrequencyAnalysis(historicalDraws, maxNumber, picks, bonusMax),
    gapAnalysis(historicalDraws, maxNumber, picks, bonusMax),
    pairClusterAnalysis(historicalDraws, maxNumber, picks, bonusMax),
    movingAverageTrend(historicalDraws, maxNumber, picks, bonusMax),
    monteCarloSimulation(historicalDraws, maxNumber, picks, bonusMax),
    sumDistributionAnalysis(historicalDraws, maxNumber, picks, bonusMax),
  ];

  const numberVotes: Record<number, number> = {};
  const bonusVotes: Record<number, number> = {};

  algorithms.forEach((algo) => {
    const normalizedWeight = algo.weight * algo.confidence;
    algo.predictedNumbers.forEach((n) => {
      numberVotes[n] = (numberVotes[n] || 0) + normalizedWeight;
    });
    bonusVotes[algo.predictedBonus] = (bonusVotes[algo.predictedBonus] || 0) + normalizedWeight;
  });

  const sortedNumbers = Object.entries(numberVotes)
    .map(([n, v]) => ({ number: parseInt(n), votes: v }))
    .sort((a, b) => b.votes - a.votes);

  let mainNumbers = sortedNumbers.slice(0, picks).map((s) => s.number).sort((a, b) => a - b);
  if (mainNumbers.length < picks) {
    mainNumbers = fillRandom(mainNumbers, picks, maxNumber);
  }

  const sortedBonus = Object.entries(bonusVotes)
    .map(([n, v]) => ({ number: parseInt(n), votes: v }))
    .sort((a, b) => b.votes - a.votes);
  const bonusNumber = sortedBonus[0]?.number || Math.floor(Math.random() * bonusMax) + 1;

  const totalConfidence = algorithms.reduce((s, a) => s + a.confidence * a.weight, 0);
  const totalWeight = algorithms.reduce((s, a) => s + a.weight, 0);
  const ensembleConfidence = totalWeight > 0 ? totalConfidence / totalWeight : 0.15;

  const topVote = sortedNumbers[0]?.votes || 1;
  const consensus = picks > 0 ? sortedNumbers.slice(0, picks).reduce((s, n) => s + n.votes, 0) / (topVote * picks) : 0;
  const finalConfidence = Math.min(0.95, Math.max(0.1, ensembleConfidence * 0.6 + consensus * 0.4));

  const ensembleWeights: Record<string, number> = {};
  algorithms.forEach((a) => {
    ensembleWeights[a.name] = Number((a.weight * a.confidence).toFixed(4));
  });

  return {
    mainNumbers,
    bonusNumber,
    confidence: Number(finalConfidence.toFixed(3)),
    algorithmBreakdown: algorithms,
    ensembleWeights,
  };
}

export function parseDrawResults(results: Array<{ winningNumbers: string; bonusNumber: number; drawDate: Date | string }>): DrawResult[] {
  return results.map((r) => ({
    numbers: r.winningNumbers.split(",").map((n) => parseInt(n.trim())).filter((n) => !isNaN(n)),
    bonusNumber: r.bonusNumber,
    drawDate: new Date(r.drawDate),
  }));
}
