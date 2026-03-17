import { db, sportsPredictionsTable } from "@workspace/db";
import { eq, isNull, and } from "drizzle-orm";

const ODDS_API_KEY = process.env["ODDS_API_KEY"];
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

interface ScoreEntry {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  completed: boolean;
  scores: { name: string; score: string }[] | null;
}

async function fetchScores(sportKey: string, daysFrom = 3): Promise<{ scores: ScoreEntry[]; error?: string }> {
  const url = `${ODDS_API_BASE}/sports/${sportKey}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=${daysFrom}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 422) return { scores: [] };
    const msg = `Scores API ${res.status} for ${sportKey}`;
    console.warn(`[AutoResolve] ${msg}`);
    return { scores: [], error: msg };
  }
  return { scores: await res.json() };
}

function determineWinner(scores: { name: string; score: string }[]): { winner: string | null; isDraw: boolean; homeScore: number; awayScore: number } {
  if (!scores || scores.length < 2) return { winner: null, isDraw: false, homeScore: 0, awayScore: 0 };
  const a = { name: scores[0].name, score: parseInt(scores[0].score, 10) };
  const b = { name: scores[1].name, score: parseInt(scores[1].score, 10) };
  if (isNaN(a.score) || isNaN(b.score)) return { winner: null, isDraw: false, homeScore: 0, awayScore: 0 };
  if (a.score === b.score) return { winner: null, isDraw: true, homeScore: a.score, awayScore: b.score };
  return {
    winner: a.score > b.score ? a.name : b.name,
    isDraw: false,
    homeScore: a.score,
    awayScore: b.score,
  };
}

export async function autoResolveSportsPredictions(): Promise<{
  checked: number;
  resolved: number;
  correct: number;
  incorrect: number;
  draws: number;
  errors: number;
  details: string[];
}> {
  const result = { checked: 0, resolved: 0, correct: 0, incorrect: 0, draws: 0, errors: 0, details: [] as string[] };

  const pending = await db
    .select()
    .from(sportsPredictionsTable)
    .where(isNull(sportsPredictionsTable.wasCorrect));

  const now = new Date();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const pastDue = pending.filter((p) => new Date(p.commenceTime) < threeHoursAgo);
  if (pastDue.length === 0) return result;

  result.checked = pastDue.length;

  const bySport = new Map<string, typeof pastDue>();
  for (const p of pastDue) {
    if (!bySport.has(p.sportKey)) bySport.set(p.sportKey, []);
    bySport.get(p.sportKey)!.push(p);
  }

  for (const [sportKey, preds] of bySport) {
    try {
      const { scores, error: fetchError } = await fetchScores(sportKey, 3);
      if (fetchError) {
        result.errors++;
        result.details.push(`API Error: ${fetchError}`);
      }
      const completedMap = new Map<string, ScoreEntry>();
      for (const s of scores) {
        if (s.completed && s.scores) {
          completedMap.set(s.id, s);
        }
      }

      if (completedMap.size === 0) continue;

      for (const pred of preds) {
        const scoreData = completedMap.get(pred.externalEventId);
        if (!scoreData || !scoreData.scores) continue;

        const { winner, isDraw, homeScore, awayScore } = determineWinner(scoreData.scores);
        const scoreStr = `${homeScore}-${awayScore}`;

        if (isDraw) {
          await db
            .update(sportsPredictionsTable)
            .set({
              wasCorrect: false,
              actualWinner: `Draw (${scoreStr})`,
            })
            .where(and(
              eq(sportsPredictionsTable.id, pred.id),
              isNull(sportsPredictionsTable.wasCorrect)
            ));
          result.resolved++;
          result.draws++;
          result.details.push(`Draw: ${pred.homeTeam} vs ${pred.awayTeam} ${scoreStr} (${sportKey}) — picked ${pred.predictedWinner}`);
          continue;
        }

        if (!winner) continue;

        const wasCorrect = pred.predictedWinner === winner;
        await db
          .update(sportsPredictionsTable)
          .set({
            wasCorrect,
            actualWinner: winner,
          })
          .where(and(
            eq(sportsPredictionsTable.id, pred.id),
            isNull(sportsPredictionsTable.wasCorrect)
          ));

        result.resolved++;
        if (wasCorrect) {
          result.correct++;
          result.details.push(`✓ ${pred.homeTeam} vs ${pred.awayTeam} ${scoreStr} (${sportKey}): Picked ${pred.predictedWinner} — CORRECT`);
        } else {
          result.incorrect++;
          result.details.push(`✗ ${pred.homeTeam} vs ${pred.awayTeam} ${scoreStr} (${sportKey}): Picked ${pred.predictedWinner}, actual: ${winner}`);
        }
      }
    } catch (err) {
      result.errors++;
      console.error(`[AutoResolve] Error resolving ${sportKey}:`, err);
    }
  }

  return result;
}
