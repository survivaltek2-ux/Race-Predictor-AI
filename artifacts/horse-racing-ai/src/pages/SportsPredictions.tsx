import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Progress } from "@/components/ui";
import { format } from "date-fns";
import { Link } from "wouter";
import { BrainCircuit, CheckCircle2, XCircle, ArrowRight, ClipboardCheck, MessageSquare, ThumbsUp, ThumbsDown, BarChart3, TrendingUp, Target, RefreshCw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function SportResultRecorder({ predId, onDone }: { predId: number; onDone: () => void }) {
  const [winnerTeam, setWinnerTeam] = useState("");
  const [mode, setMode] = useState<"hit" | "miss" | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ wasCorrect, winner }: { wasCorrect: boolean; winner?: string }) => {
      const res = await fetch(`${BASE}/api/sports/predictions/${predId}/result`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wasCorrect, actualWinner: winner }),
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
          placeholder="Winning team..."
          value={winnerTeam}
          onChange={(e) => setWinnerTeam(e.target.value)}
          className="h-8 px-2 text-xs rounded-lg border border-border bg-background text-white w-32 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button
          size="sm"
          variant="danger"
          className="h-8 text-xs"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ wasCorrect: false, winner: winnerTeam })}
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
        onClick={() => { setMode("hit"); mutation.mutate({ wasCorrect: true }); }}
      >
        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Hit
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10"
        disabled={mutation.isPending}
        onClick={() => setMode("miss")}
      >
        <XCircle className="w-3.5 h-3.5 mr-1" /> Miss
      </Button>
    </div>
  );
}

function AITrainingFeedback({ predId, onTrain }: { predId: number; onTrain: () => void }) {
  const [feedback, setFeedback] = useState("");
  const [showForm, setShowForm] = useState(false);

  const trainMutation = useMutation({
    mutationFn: async (comment: string) => {
      const res = await fetch(`${BASE}/api/sports/predictions/${predId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: comment, type: "training" }),
      });
      if (!res.ok) throw new Error("Failed to send feedback");
      return res.json();
    },
    onSuccess: () => {
      setFeedback("");
      setShowForm(false);
      onTrain();
    },
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/sports/predictions/${predId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "Prediction was helpful", type: "positive" }),
      });
      if (!res.ok) throw new Error("Failed to send feedback");
      return res.json();
    },
    onSuccess: onTrain,
  });

  if (showForm) {
    return (
      <div className="flex items-start gap-2">
        <textarea
          placeholder="How can we improve? What did we miss?"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="h-20 px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-white w-full focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
        <div className="flex flex-col gap-1 shrink-0">
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={trainMutation.isPending || !feedback.trim()}
            onClick={() => trainMutation.mutate(feedback)}
          >
            Send
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setShowForm(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Train AI:</span>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs border-green-500/40 text-green-400"
        disabled={likeMutation.isPending}
        onClick={() => likeMutation.mutate()}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs"
        disabled={trainMutation.isPending}
        onClick={() => setShowForm(true)}
      >
        <MessageSquare className="w-3.5 h-3.5 mr-1" /> Feedback
      </Button>
    </div>
  );
}

export default function SportsPredictions() {
  const queryClient = useQueryClient();
  const [sport, setSport] = useState<string>("nfl");

  const { data, isLoading } = useQuery({
    queryKey: ["sports-predictions", sport],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sports/predictions?sport=${sport}`);
      if (!res.ok) throw new Error("Failed to fetch predictions");
      return res.json();
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ["sports-stats", sport],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sports/predictions/stats?sport=${sport}`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: accuracyData } = useQuery({
    queryKey: ["sports-accuracy-by-sport"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sports/predictions/accuracy-by-sport`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const predictions = data?.predictions ?? [];
  const stats = statsData ?? {};

  const autoResolveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/sports/predictions/auto-resolve`, { method: "POST" });
      if (!res.ok) throw new Error("Auto-resolve failed");
      return res.json();
    },
    onSuccess: (result) => {
      refresh();
      if (result.resolved > 0) {
        console.log(`Auto-resolved ${result.resolved} predictions`);
      }
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["sports-predictions", sport] });
    queryClient.invalidateQueries({ queryKey: ["sports-stats", sport] });
    queryClient.invalidateQueries({ queryKey: ["sports-accuracy-by-sport"] });
  };

  const sports = [
    { key: "nfl", label: "NFL" },
    { key: "nba", label: "NBA" },
    { key: "mlb", label: "MLB" },
    { key: "nhl", label: "NHL" },
    { key: "ncaaf", label: "NCAAF" },
    { key: "ncaab", label: "NCAAB" },
    { key: "soccer_epl", label: "EPL" },
    { key: "soccer_spain_la_liga", label: "La Liga" },
    { key: "soccer_germany_bundesliga", label: "Bundesliga" },
    { key: "soccer_italy_serie_a", label: "Serie A" },
    { key: "soccer_france_ligue_one", label: "Ligue 1" },
    { key: "soccer_usa_mls", label: "MLS" },
    { key: "soccer_mexico_ligamx", label: "Liga MX" },
    { key: "soccer_uefa_champs_league", label: "UCL" },
    { key: "mma_mixed_martial_arts", label: "MMA" },
    { key: "boxing_boxing", label: "Boxing" },
  ];

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-white mb-2">Sports AI Predictions</h1>
          <p className="text-muted-foreground">Review all AI picks and track accuracy. Results sync automatically every 30 minutes.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 border-primary/40 text-primary hover:bg-primary/10"
          disabled={autoResolveMutation.isPending}
          onClick={() => autoResolveMutation.mutate()}
        >
          <Zap className={cn("w-4 h-4 mr-1.5", autoResolveMutation.isPending && "animate-spin")} />
          {autoResolveMutation.isPending ? "Syncing..." : "Sync Results"}
        </Button>
      </div>
      {autoResolveMutation.isSuccess && autoResolveMutation.data && (
        <div className={cn(
          "rounded-xl p-3 border text-sm flex items-center gap-2",
          autoResolveMutation.data.resolved > 0
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            : "bg-slate-500/10 border-slate-500/20 text-muted-foreground"
        )}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {autoResolveMutation.data.resolved > 0
            ? `Resolved ${autoResolveMutation.data.resolved} predictions: ${autoResolveMutation.data.correct} correct, ${autoResolveMutation.data.incorrect} incorrect${autoResolveMutation.data.draws > 0 ? `, ${autoResolveMutation.data.draws} draws` : ""}`
            : autoResolveMutation.data.checked > 0
              ? `${autoResolveMutation.data.checked} pending predictions — games may still be in progress`
              : "No pending predictions to resolve"
          }
        </div>
      )}

      {/* Stats Summary */}
      {Object.keys(stats).length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{stats.totalPredictions || 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Picks</div>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{stats.correctPredictions || 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Hits</div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-amber-400">{stats.accuracyPercentage?.toFixed(1) || 0}%</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Hit Rate</div>
            </CardContent>
          </Card>
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{stats.averageConfidence?.toFixed(0) || 0}%</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Avg Confidence</div>
            </CardContent>
          </Card>
        </div>
      )}

      {accuracyData?.breakdown?.length > 0 && (
        <Card className="border-violet-500/30 bg-violet-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-violet-400">
              <BarChart3 className="w-4 h-4" /> Accuracy by Sport
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {accuracyData.breakdown.map((s: any) => (
                <button
                  key={s.sportKey}
                  onClick={() => setSport(s.sportKey)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    sport === s.sportKey
                      ? "border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30"
                      : "border-border/30 bg-card/30 hover:border-border/60"
                  )}
                >
                  <div className="text-xs font-bold text-white mb-1">{s.sportTitle}</div>
                  <div className="text-2xl font-bold text-violet-400">{s.accuracy}%</div>
                  <div className="text-[10px] text-muted-foreground">
                    {s.correct}/{s.resultsRecorded} correct
                  </div>
                  <div className="mt-1.5">
                    <div className="w-full bg-secondary/30 rounded-full h-1.5">
                      <div
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          s.accuracy >= 60 ? "bg-emerald-500" : s.accuracy >= 40 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${Math.min(s.accuracy, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">{s.totalPredictions} picks | {s.avgConfidence}% conf</div>
                </button>
              ))}
            </div>
            {accuracyData.overall && (
              <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-6 text-xs">
                <div className="flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-muted-foreground">Overall:</span>
                  <span className="font-bold text-white">{accuracyData.overall.accuracy}%</span>
                </div>
                <div className="text-muted-foreground">
                  {accuracyData.overall.correct}/{accuracyData.overall.resultsRecorded} correct from {accuracyData.overall.totalPredictions} total picks
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {sports.map((s) => (
          <Button
            key={s.key}
            variant={sport === s.key ? "default" : "outline"}
            size="sm"
            onClick={() => setSport(s.key)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {/* Predictions Table */}
      <Card className="bg-card border-border/50">
        <CardHeader className="bg-secondary/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" /> {sports.find(s => s.key === sport)?.label} Predictions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-secondary/20 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-5 py-4 font-semibold">Date</th>
                  <th className="px-5 py-4 font-semibold">Matchup</th>
                  <th className="px-5 py-4 font-semibold">Pick</th>
                  <th className="px-5 py-4 font-semibold text-center">Confidence</th>
                  <th className="px-5 py-4 font-semibold">Result</th>
                  <th className="px-5 py-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground animate-pulse">Loading predictions...</td></tr>
                ) : predictions?.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No predictions yet for {sport.toUpperCase()}</td></tr>
                ) : predictions?.map((pred: any) => {
                  const isPending = pred.wasCorrect === null || pred.wasCorrect === undefined;
                  return (
                    <tr key={pred.id} className={cn("transition-colors group", isPending ? "hover:bg-amber-500/5" : "hover:bg-secondary/10")}>
                      <td className="px-5 py-4 text-muted-foreground text-xs">
                        {format(new Date(pred.createdAt), 'MM/dd/yy HH:mm')}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-bold text-white block">{pred.awayTeam} @ {pred.homeTeam}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-bold text-primary text-base">{pred.predictedWinner}</span>
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
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right space-y-2">
                        {isPending ? (
                          <SportResultRecorder predId={pred.id} onDone={refresh} />
                        ) : (
                          <AITrainingFeedback predId={pred.id} onTrain={refresh} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isLoading && predictions?.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              <BrainCircuit className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg">No {sport.toUpperCase()} predictions yet — generate one from the Sports Center.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
