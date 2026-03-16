import { useState } from "react";
import { useListPredictions, useGetPredictionStats } from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, Badge, Button, Progress } from "@/components/ui";
import { format } from "date-fns";
import { Link } from "wouter";
import { BrainCircuit, CheckCircle2, XCircle, ArrowRight, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function RecordResultButtons({ predId, onDone }: { predId: number; onDone: () => void }) {
  const [actualWinner, setActualWinner] = useState("");
  const [mode, setMode] = useState<"hit" | "miss" | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ wasCorrect, winner }: { wasCorrect: boolean; winner?: string }) => {
      const res = await fetch(`${BASE}/api/predictions/${predId}/result`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wasCorrect, actualWinnerName: winner }),
      });
      if (!res.ok) throw new Error("Failed to record result");
      return res.json();
    },
    onSuccess: onDone,
  });

  if (mode === "miss") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Actual winner..."
          value={actualWinner}
          onChange={(e) => setActualWinner(e.target.value)}
          className="h-8 px-2 text-xs rounded-lg border border-border bg-background text-white w-32 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button
          size="sm"
          variant="danger"
          className="h-8 text-xs"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ wasCorrect: false, winner: actualWinner })}
        >
          Confirm Miss
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setMode(null)}>Cancel</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground mr-1">Record:</span>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ wasCorrect: true })}
      >
        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Hit
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs border-destructive/40 text-red-400 hover:bg-destructive/10"
        onClick={() => setMode("miss")}
      >
        <XCircle className="w-3.5 h-3.5 mr-1" /> Miss
      </Button>
    </div>
  );
}

export function Predictions() {
  const queryClient = useQueryClient();
  const { data: predictions, isLoading } = useListPredictions();
  const { data: stats } = useGetPredictionStats();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["listPredictions"] });
    queryClient.invalidateQueries({ queryKey: ["getPredictionStats"] });
  };

  const resolved = (predictions || []).filter((p) => p.wasCorrect !== null && p.wasCorrect !== undefined);
  const pending = (predictions || []).filter((p) => p.wasCorrect === null || p.wasCorrect === undefined);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
          <BrainCircuit className="w-8 h-8 text-primary" /> Racing Picks Ledger
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Record outcomes to train the AI — every result you log improves future predictions.
        </p>
      </div>

      {/* Stats Banner */}
      <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-6">
        <div>
          <p className="text-xs text-primary uppercase font-bold tracking-wider mb-1">Accuracy</p>
          <p className="text-2xl font-mono font-bold text-white">{stats ? `${stats.accuracyPercentage}%` : '--'}</p>
        </div>
        <div>
          <p className="text-xs text-primary uppercase font-bold tracking-wider mb-1">Total Picks</p>
          <p className="text-2xl font-mono font-bold text-white">{stats?.totalPredictions ?? '--'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Resolved</p>
          <p className="text-2xl font-mono font-bold text-white">{resolved.length}</p>
        </div>
        <div>
          <p className="text-xs text-amber-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1">
            <ClipboardCheck className="w-3 h-3" /> Needs Result
          </p>
          <p className="text-2xl font-mono font-bold text-amber-400">{pending.length}</p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-5 py-3 text-sm text-amber-400 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 shrink-0" />
          <span>
            <strong>{pending.length} prediction{pending.length > 1 ? "s" : ""}</strong> waiting for a result — recording outcomes feeds the AI's learning loop.
          </span>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary/30 text-muted-foreground text-xs uppercase border-b border-border/50">
              <tr>
                <th className="px-5 py-4 font-semibold">Date</th>
                <th className="px-5 py-4 font-semibold">Race</th>
                <th className="px-5 py-4 font-semibold">AI Pick</th>
                <th className="px-5 py-4 font-semibold text-center">Confidence</th>
                <th className="px-5 py-4 font-semibold">Result</th>
                <th className="px-5 py-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-5 py-5 bg-secondary/10" />
                  </tr>
                ))
              ) : predictions?.map((pred) => {
                const isPending = pred.wasCorrect === null || pred.wasCorrect === undefined;
                return (
                  <tr key={pred.id} className={cn("transition-colors group", isPending ? "hover:bg-amber-500/5" : "hover:bg-secondary/10")}>
                    <td className="px-5 py-4 text-muted-foreground text-xs">
                      {format(new Date(pred.createdAt), 'MM/dd/yy HH:mm')}
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-bold text-white block">{pred.trackName}</span>
                      <span className="text-xs text-muted-foreground">Race {pred.raceId}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-bold text-primary text-base">{pred.predictedWinnerName}</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex flex-col items-center gap-1 w-20 mx-auto">
                        <span className="font-mono font-medium text-white text-xs">{Math.round(pred.confidenceScore * 100)}%</span>
                        <Progress value={pred.confidenceScore * 100} className="h-1.5 w-full" />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {isPending ? (
                        <Badge variant="warning" className="border-dashed">Pending</Badge>
                      ) : pred.wasCorrect ? (
                        <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                          <CheckCircle2 className="w-4 h-4" /> Hit
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-red-400 font-medium">
                          <XCircle className="w-4 h-4" /> Miss
                          {pred.actualWinnerName && (
                            <span className="text-xs text-muted-foreground font-normal">(Won: {pred.actualWinnerName})</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {isPending ? (
                        <RecordResultButtons predId={pred.id} onDone={refresh} />
                      ) : (
                        <Link href={`/races/${pred.raceId}`}>
                          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                            View <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!isLoading && predictions?.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              <BrainCircuit className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg">No predictions yet — generate one from a race page.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
