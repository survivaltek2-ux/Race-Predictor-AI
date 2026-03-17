import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Progress } from "@/components/ui";
import { format } from "date-fns";
import { BrainCircuit, Dices, ClipboardCheck, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Cpu, Sparkles, Zap, RefreshCw, Database, Calendar, TrendingUp, Flame, Snowflake, BarChart3, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type PredictionMethod = "hybrid" | "ml" | "ai";

const METHOD_INFO: Record<string, { label: string; icon: any; description: string; color: string }> = {
  hybrid: { label: "Hybrid ML + AI", icon: Zap, description: "Combines 6 ML algorithms with GPT-5.2 analysis", color: "text-violet-400" },
  ml: { label: "ML Only", icon: Cpu, description: "Pure machine learning ensemble (6 algorithms)", color: "text-blue-400" },
  ai: { label: "AI Only", icon: Sparkles, description: "GPT-5.2 pattern analysis with ML insights", color: "text-amber-400" },
  "ml-fallback": { label: "ML Fallback", icon: Cpu, description: "ML used when AI was unavailable", color: "text-orange-400" },
};

export function Lottery() {
  const queryClient = useQueryClient();
  const [selectedGame, setSelectedGame] = useState<string>("powerball");
  const [method, setMethod] = useState<PredictionMethod>("hybrid");
  const [expandedPred, setExpandedPred] = useState<number | null>(null);

  const { data: gamesData } = useQuery({
    queryKey: ["lottery-games"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/games`);
      if (!res.ok) throw new Error("Failed to fetch games");
      return res.json();
    },
  });

  const games = gamesData ?? [];

  const { data: predictionsData, isLoading } = useQuery({
    queryKey: ["lottery-predictions", selectedGame],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/predictions?gameKey=${selectedGame}`);
      if (!res.ok) throw new Error("Failed to fetch predictions");
      return res.json();
    },
    enabled: !!selectedGame,
  });

  const { data: statsData } = useQuery({
    queryKey: ["lottery-stats", selectedGame],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/stats?gameKey=${selectedGame}`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!selectedGame,
  });

  const { data: dataStatusRes } = useQuery({
    queryKey: ["lottery-data-status"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/data-status`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: recentResultsData } = useQuery({
    queryKey: ["lottery-results", selectedGame],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/results?gameKey=${selectedGame}&limit=10`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedGame,
  });

  const { data: hotColdData } = useQuery({
    queryKey: ["lottery-hot-cold", selectedGame],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/hot-cold?gameKey=${selectedGame}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedGame,
  });

  const { data: trendsData } = useQuery({
    queryKey: ["lottery-trends", selectedGame],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/trends?gameKey=${selectedGame}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedGame,
  });

  const [showHeatmap, setShowHeatmap] = useState(false);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lottery-data-status"] });
      queryClient.invalidateQueries({ queryKey: ["lottery-results"] });
      queryClient.invalidateQueries({ queryKey: ["lottery-stats"] });
      queryClient.invalidateQueries({ queryKey: ["lottery-hot-cold"] });
      queryClient.invalidateQueries({ queryKey: ["lottery-trends"] });
      queryClient.invalidateQueries({ queryKey: ["lottery-predictions"] });
    },
  });

  const predictions = predictionsData?.predictions ?? [];
  const stats = statsData ?? {};
  const gameInfo = games.find((g: any) => g.gameKey === selectedGame);
  const dataStatus: any[] = dataStatusRes?.status ?? [];
  const currentGameStatus = dataStatus.find((s: any) => s.gameKey === selectedGame);
  const recentResults: any[] = recentResultsData?.results ?? [];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/predictions/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameKey: selectedGame, method }),
      });
      if (!res.ok) throw new Error("Failed to generate prediction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lottery-predictions", selectedGame] });
      queryClient.invalidateQueries({ queryKey: ["lottery-stats", selectedGame] });
    },
  });

  const recordResultMutation = useMutation({
    mutationFn: async ({ predId, wasCorrect, matchedNumbers }: { predId: number; wasCorrect: boolean; matchedNumbers?: number }) => {
      const res = await fetch(`${BASE}/api/lottery/predictions/${predId}/result`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wasCorrect, matchedNumbers: matchedNumbers || 0 }),
      });
      if (!res.ok) throw new Error("Failed to record result");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lottery-predictions", selectedGame] });
      queryClient.invalidateQueries({ queryKey: ["lottery-stats", selectedGame] });
    },
  });

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-display font-bold text-white mb-2 flex items-center gap-3">
          <Dices className="w-10 h-10 text-primary" /> Lottery Predictor
        </h1>
        <p className="text-muted-foreground">AI + Machine Learning powered lottery number predictions.</p>
      </div>

      {Object.keys(stats).length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{stats.totalPredictions || 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Predictions</div>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{stats.correctPredictions || 0}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Matches</div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-amber-400">{stats.accuracyPercentage?.toFixed(1) || 0}%</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Accuracy</div>
            </CardContent>
          </Card>
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{Math.round((stats.averageConfidence || 0) * 100)}%</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Avg Confidence</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {games.map((game: any) => (
          <Button
            key={game.gameKey}
            variant={selectedGame === game.gameKey ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedGame(game.gameKey)}
          >
            {game.name}
          </Button>
        ))}
      </div>

      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Live Data Feed</h3>
              <Badge variant="secondary" className="text-[10px]">NY Open Data API</Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              <RefreshCw className={cn("w-3 h-3 mr-1", syncMutation.isPending && "animate-spin")} />
              {syncMutation.isPending ? "Syncing..." : "Sync Now"}
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {dataStatus.map((s: any) => (
              <div key={s.gameKey} className={cn(
                "p-3 rounded-lg border transition-all",
                s.gameKey === selectedGame ? "border-blue-500/40 bg-blue-500/10" : "border-border/30 bg-card/30"
              )}>
                <div className="text-xs font-semibold text-white mb-1">{s.gameName}</div>
                <div className="text-xl font-bold text-blue-400">{s.totalResults.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">historical draws</div>
                {s.latestDraw && (
                  <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5" />
                    Latest: {format(new Date(s.latestDraw), "MMM d, yyyy")}
                  </div>
                )}
              </div>
            ))}
            {dataStatus.length === 0 && (
              <div className="col-span-4 text-center text-sm text-muted-foreground py-2">
                Loading data status...
              </div>
            )}
          </div>
          {syncMutation.isSuccess && (
            <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Data synced successfully
            </div>
          )}
        </CardContent>
      </Card>

      {recentResults.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="w-4 h-4" /> Recent {gameInfo?.name} Winning Numbers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-2">
              {recentResults.slice(0, 5).map((r: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">
                    {format(new Date(r.drawDate), "MMM d, yyyy")}
                  </span>
                  <div className="flex gap-1.5 flex-wrap">
                    {r.winningNumbers.map((num: number, i: number) => (
                      <span key={i} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/10 text-white font-bold text-xs">
                        {num}
                      </span>
                    ))}
                    {r.bonusNumber > 0 && (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs ml-1">
                        {r.bonusNumber}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {hotColdData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-red-500/30 bg-red-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                <Flame className="w-4 h-4" /> Hot Numbers
                <Badge variant="secondary" className="text-[10px]">Last {hotColdData.recentWindow} draws</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex flex-wrap gap-2">
                {hotColdData.hot?.map((n: any) => (
                  <div key={n.number} className="flex flex-col items-center gap-1">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-500/20 text-red-400 font-bold text-sm border border-red-500/30">
                      {n.number}
                    </span>
                    <span className="text-[10px] text-red-400/70">{n.recentFreq}x</span>
                  </div>
                ))}
              </div>
              {hotColdData.hot?.length === 0 && <p className="text-xs text-muted-foreground">No data yet</p>}
            </CardContent>
          </Card>

          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-blue-400">
                <Snowflake className="w-4 h-4" /> Cold Numbers
                <Badge variant="secondary" className="text-[10px]">Most overdue</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex flex-wrap gap-2">
                {hotColdData.cold?.map((n: any) => (
                  <div key={n.number} className="flex flex-col items-center gap-1">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 font-bold text-sm border border-blue-500/30">
                      {n.number}
                    </span>
                    <span className="text-[10px] text-blue-400/70">{n.drawsSinceLastSeen}d ago</span>
                  </div>
                ))}
              </div>
              {hotColdData.cold?.length === 0 && <p className="text-xs text-muted-foreground">No data yet</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {hotColdData?.heatmap && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                <BarChart3 className="w-4 h-4" /> Number Frequency Heatmap
                <Badge variant="secondary" className="text-[10px]">{hotColdData.totalDrawsAnalyzed} draws</Badge>
              </CardTitle>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowHeatmap(!showHeatmap)}>
                {showHeatmap ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                {showHeatmap ? "Hide" : "Show"}
              </Button>
            </div>
          </CardHeader>
          {showHeatmap && (
            <CardContent className="p-4 pt-0">
              <div className="flex flex-wrap gap-1">
                {hotColdData.heatmap.map((n: any) => {
                  const maxFreq = Math.max(...hotColdData.heatmap.map((h: any) => h.totalFreq), 1);
                  const intensity = n.totalFreq / maxFreq;
                  const bg = intensity > 0.7
                    ? "bg-red-500/40 text-red-300 border-red-500/40"
                    : intensity > 0.5
                    ? "bg-orange-500/30 text-orange-300 border-orange-500/30"
                    : intensity > 0.3
                    ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/20"
                    : intensity > 0.1
                    ? "bg-white/10 text-white/60 border-white/10"
                    : "bg-white/5 text-white/30 border-white/5";
                  return (
                    <div
                      key={n.number}
                      className={cn("w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold border", bg)}
                      title={`#${n.number}: ${n.totalFreq} times (${n.pct}%)`}
                    >
                      {n.number}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
                <span>Low freq</span>
                <div className="flex gap-0.5">
                  <div className="w-4 h-3 rounded bg-white/5" />
                  <div className="w-4 h-3 rounded bg-white/10" />
                  <div className="w-4 h-3 rounded bg-yellow-500/20" />
                  <div className="w-4 h-3 rounded bg-orange-500/30" />
                  <div className="w-4 h-3 rounded bg-red-500/40" />
                </div>
                <span>High freq</span>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {trendsData && trendsData.trends?.length > 0 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
              <Target className="w-4 h-4" /> Prediction Performance Trends
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            <div className="space-y-2">
              {trendsData.trends.slice(-10).map((t: any) => (
                <div key={t.index} className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground w-16 shrink-0">#{t.index}</span>
                  <span className="text-muted-foreground w-24 shrink-0">{format(new Date(t.date), "MM/dd HH:mm")}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white/70 w-12">Conf:</span>
                      <div className="flex-1 bg-secondary/30 rounded-full h-2 max-w-[120px]">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.round(t.confidence * 100)}%` }} />
                      </div>
                      <span className="font-mono text-emerald-400 w-10 text-right">{Math.round(t.confidence * 100)}%</span>
                    </div>
                  </div>
                  <div className="w-12 text-center">
                    <span className="font-mono text-amber-400">{t.matchedNumbers}</span>
                    <span className="text-muted-foreground"> hit</span>
                  </div>
                  <div className="w-8">
                    {t.wasCorrect === true && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {t.wasCorrect === false && <XCircle className="w-4 h-4 text-red-400" />}
                    {t.wasCorrect === null && <span className="text-muted-foreground text-[10px]">-</span>}
                  </div>
                </div>
              ))}
            </div>

            {trendsData.methodStats?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Performance by Method</h4>
                <div className="grid grid-cols-3 gap-3">
                  {trendsData.methodStats.map((ms: any) => {
                    const info = METHOD_INFO[ms.method as PredictionMethod] || METHOD_INFO.hybrid;
                    const Icon = info.icon;
                    return (
                      <div key={ms.method} className="p-3 rounded-lg bg-card/50 border border-border/30">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className={cn("w-3.5 h-3.5", info.color)} />
                          <span className="text-xs font-semibold text-white">{info.label}</span>
                        </div>
                        <div className="text-lg font-bold text-white">{ms.count}</div>
                        <div className="text-[10px] text-muted-foreground">predictions</div>
                        <div className="text-xs text-emerald-400 mt-1">{Math.round(ms.avgConfidence * 100)}% avg conf</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Generate AI + ML Prediction</h3>
              <p className="text-sm text-muted-foreground">Choose your prediction method below.</p>
            </div>
            <Button
              size="lg"
              className="glow-primary"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || !selectedGame}
            >
              <BrainCircuit className="w-4 h-4 mr-2" />
              {generateMutation.isPending ? "Analyzing..." : "Generate"}
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(["hybrid", "ml", "ai"] as PredictionMethod[]).map((key) => {
              const info = METHOD_INFO[key];
              const Icon = info.icon;
              return (
                <button
                  key={key}
                  onClick={() => setMethod(key)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    method === key
                      ? "border-primary bg-primary/10 ring-1 ring-primary/50"
                      : "border-border/50 bg-card/50 hover:border-border"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("w-4 h-4", info.color)} />
                    <span className="font-semibold text-sm text-white">{info.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{info.description}</p>
                </button>
              );
            })}
          </div>

          {generateMutation.isError && (
            <p className="text-destructive text-sm mt-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {(generateMutation.error as Error)?.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-violet-500/30 bg-violet-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-violet-400">
            <Cpu className="w-5 h-5" /> ML Algorithm Suite
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { name: "Weighted Frequency", desc: "Exponential recency-weighted number frequency", weight: "25%" },
              { name: "Monte Carlo", desc: "10,000 weighted random simulations", weight: "25%" },
              { name: "Gap Analysis", desc: "Identifies overdue numbers by interval", weight: "20%" },
              { name: "Pair Clustering", desc: "Finds frequently co-occurring number pairs", weight: "15%" },
              { name: "Moving Average", desc: "Short vs long term trend detection", weight: "10%" },
              { name: "Sum Distribution", desc: "Statistical sum range optimization", weight: "5%" },
            ].map((algo) => (
              <div key={algo.name} className="p-3 rounded-lg bg-card/50 border border-border/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-white">{algo.name}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{algo.weight}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">{algo.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border/50">
        <CardHeader className="bg-secondary/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" /> {gameInfo?.name} Predictions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-secondary/20 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-5 py-4 font-semibold">Date</th>
                  <th className="px-5 py-4 font-semibold">Method</th>
                  <th className="px-5 py-4 font-semibold">Numbers</th>
                  <th className="px-5 py-4 font-semibold">Bonus</th>
                  <th className="px-5 py-4 font-semibold text-center">Confidence</th>
                  <th className="px-5 py-4 font-semibold">Result</th>
                  <th className="px-5 py-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground animate-pulse">
                      Loading predictions...
                    </td>
                  </tr>
                ) : predictions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      No predictions yet — generate one using the controls above.
                    </td>
                  </tr>
                ) : (
                  predictions.map((pred: any) => {
                    const isPending = pred.wasCorrect === null || pred.wasCorrect === undefined;
                    const isExpanded = expandedPred === pred.id;
                    const methodInfo = METHOD_INFO[pred.method as PredictionMethod] || METHOD_INFO.hybrid;
                    const MethodIcon = methodInfo.icon;

                    return (
                      <tr key={pred.id} className="group">
                        <td colSpan={7} className="p-0">
                          <div
                            className={cn(
                              "grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto] items-center transition-colors cursor-pointer",
                              isPending ? "hover:bg-amber-500/5" : "hover:bg-secondary/10"
                            )}
                            onClick={() => setExpandedPred(isExpanded ? null : pred.id)}
                          >
                            <div className="px-5 py-4 text-muted-foreground text-xs">
                              {format(new Date(pred.createdAt), "MM/dd/yy HH:mm")}
                            </div>
                            <div className="px-3 py-4">
                              <div className={cn("flex items-center gap-1.5 text-xs font-medium", methodInfo.color)}>
                                <MethodIcon className="w-3.5 h-3.5" />
                                {methodInfo.label}
                              </div>
                            </div>
                            <div className="px-3 py-4">
                              <div className="flex gap-1.5 flex-wrap">
                                {pred.mainNumbers.map((num: number, i: number) => (
                                  <span key={i} className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary font-bold text-sm">
                                    {num}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="px-3 py-4">
                              {pred.bonusNumber > 0 ? (
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 font-bold text-sm">
                                  {pred.bonusNumber}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">N/A</span>
                              )}
                            </div>
                            <div className="px-3 py-4 text-center">
                              <div className="flex flex-col items-center gap-1 w-20 mx-auto">
                                <span className="font-mono font-medium text-white text-xs">{Math.round(pred.confidenceScore * 100)}%</span>
                                <Progress value={pred.confidenceScore * 100} className="h-1.5 w-full" />
                              </div>
                            </div>
                            <div className="px-3 py-4">
                              {isPending ? (
                                <Badge variant="warning" className="border-dashed">Pending</Badge>
                              ) : pred.wasCorrect ? (
                                <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-xs">
                                  <CheckCircle2 className="w-4 h-4" /> {pred.matchedNumbers}/{gameInfo?.numberOfPicks || pred.mainNumbers.length} Match
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-red-400 font-medium text-xs">
                                  <XCircle className="w-4 h-4" /> Miss
                                </div>
                              )}
                            </div>
                            <div className="px-3 py-4 flex items-center gap-2">
                              {isPending && (
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-emerald-500/40 text-emerald-400"
                                    onClick={() => recordResultMutation.mutate({ predId: pred.id, wasCorrect: true, matchedNumbers: 6 })}
                                    disabled={recordResultMutation.isPending}
                                  >
                                    Hit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-red-500/40 text-red-400"
                                    onClick={() => recordResultMutation.mutate({ predId: pred.id, wasCorrect: false, matchedNumbers: 0 })}
                                    disabled={recordResultMutation.isPending}
                                  >
                                    Miss
                                  </Button>
                                </div>
                              )}
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-5 pb-5 space-y-4 bg-secondary/5 border-t border-border/30">
                              {pred.reasoning && (
                                <div className="pt-4">
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">AI Reasoning</h4>
                                  <p className="text-sm text-white/80 leading-relaxed">{pred.reasoning}</p>
                                </div>
                              )}

                              {pred.keyPatterns && pred.keyPatterns.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Key Patterns Detected</h4>
                                  <div className="flex flex-wrap gap-2">
                                    {pred.keyPatterns.map((p: string, i: number) => (
                                      <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {pred.mlEnsemble && (
                                <div>
                                  <h4 className="text-xs font-semibold text-violet-400 uppercase mb-3 flex items-center gap-1.5">
                                    <Cpu className="w-3.5 h-3.5" /> ML Algorithm Breakdown
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {pred.mlEnsemble.algorithmBreakdown?.map((algo: any, i: number) => (
                                      <div key={i} className="p-3 rounded-lg bg-card border border-border/30">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs font-bold text-white">{algo.name}</span>
                                          <span className="text-[10px] text-muted-foreground font-mono">{Math.round(algo.confidence * 100)}%</span>
                                        </div>
                                        <div className="flex gap-1 mb-2 flex-wrap">
                                          {algo.predictedNumbers?.map((n: number, j: number) => (
                                            <span
                                              key={j}
                                              className={cn(
                                                "inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold",
                                                pred.mainNumbers.includes(n)
                                                  ? "bg-primary/30 text-primary ring-1 ring-primary/50"
                                                  : "bg-secondary/50 text-muted-foreground"
                                              )}
                                            >
                                              {n}
                                            </span>
                                          ))}
                                          <span className={cn(
                                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ml-1",
                                            pred.bonusNumber === algo.predictedBonus
                                              ? "bg-amber-500/30 text-amber-400 ring-1 ring-amber-500/50"
                                              : "bg-secondary/50 text-muted-foreground"
                                          )}>
                                            +{algo.predictedBonus}
                                          </span>
                                        </div>
                                        <div className="space-y-0.5">
                                          {algo.insights?.map((insight: string, k: number) => (
                                            <p key={k} className="text-[10px] text-muted-foreground leading-tight">• {insight}</p>
                                          ))}
                                        </div>
                                        <Progress value={algo.confidence * 100} className="h-1 mt-2" />
                                      </div>
                                    ))}
                                  </div>

                                  {pred.mlEnsemble.ensembleWeights && (
                                    <div className="mt-3 p-3 rounded-lg bg-card border border-border/30">
                                      <h5 className="text-xs font-semibold text-muted-foreground mb-2">Ensemble Weights</h5>
                                      <div className="flex flex-wrap gap-3">
                                        {Object.entries(pred.mlEnsemble.ensembleWeights).map(([name, weight]: [string, any]) => (
                                          <div key={name} className="flex items-center gap-2">
                                            <span className="text-[10px] text-white/70">{name}:</span>
                                            <div className="w-16 bg-secondary/30 rounded-full h-1.5">
                                              <div
                                                className="bg-violet-500 h-1.5 rounded-full transition-all"
                                                style={{ width: `${Math.min(weight * 400, 100)}%` }}
                                              />
                                            </div>
                                            <span className="text-[10px] font-mono text-violet-400">{(weight * 100).toFixed(1)}%</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && predictions.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              <Dices className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg">No predictions yet — generate one using the AI + ML engine.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Lottery;
