import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Progress } from "@/components/ui";
import { format } from "date-fns";
import { BrainCircuit, Dices, ClipboardCheck, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function Lottery() {
  const queryClient = useQueryClient();
  const [selectedGame, setSelectedGame] = useState<string>("powerball");

  // Fetch available lottery games
  const { data: gamesData } = useQuery({
    queryKey: ["lottery-games"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/games`);
      if (!res.ok) throw new Error("Failed to fetch games");
      return res.json();
    },
  });

  const games = gamesData ?? [];

  // Fetch predictions for selected game
  const { data: predictionsData, isLoading } = useQuery({
    queryKey: ["lottery-predictions", selectedGame],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/predictions?gameKey=${selectedGame}`);
      if (!res.ok) throw new Error("Failed to fetch predictions");
      return res.json();
    },
    enabled: !!selectedGame,
  });

  // Fetch stats for selected game
  const { data: statsData } = useQuery({
    queryKey: ["lottery-stats", selectedGame],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/stats?gameKey=${selectedGame}`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!selectedGame,
  });

  const predictions = predictionsData?.predictions ?? [];
  const stats = statsData ?? {};
  const gameInfo = games.find((g: any) => g.gameKey === selectedGame);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/lottery/predictions/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameKey: selectedGame }),
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
        <p className="text-muted-foreground">AI-powered lottery number predictions using historical pattern analysis.</p>
      </div>

      {/* Stats Summary */}
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
              <div className="text-2xl font-bold text-blue-400">{stats.averageConfidence?.toFixed(0) || 0}%</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Avg Confidence</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Game Selector */}
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

      {/* Generate Prediction Button */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Generate AI Prediction</h3>
              <p className="text-sm text-muted-foreground">Uses historical pattern analysis to predict the next draw.</p>
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
          {generateMutation.isError && (
            <p className="text-destructive text-sm mt-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {(generateMutation.error as Error)?.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Predictions List */}
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
                    <td colSpan={6} className="p-6 text-center text-muted-foreground animate-pulse">
                      Loading predictions...
                    </td>
                  </tr>
                ) : predictions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      No predictions yet — generate one using the AI.
                    </td>
                  </tr>
                ) : (
                  predictions.map((pred: any) => {
                    const isPending = pred.wasCorrect === null || pred.wasCorrect === undefined;
                    return (
                      <tr key={pred.id} className={cn("transition-colors group", isPending ? "hover:bg-amber-500/5" : "hover:bg-secondary/10")}>
                        <td className="px-5 py-4 text-muted-foreground text-xs">
                          {format(new Date(pred.createdAt), "MM/dd/yy HH:mm")}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex gap-1.5 flex-wrap">
                            {pred.mainNumbers.map((num: number) => (
                              <span key={num} className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary font-bold text-sm">
                                {num}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 font-bold text-sm">
                            {pred.bonusNumber}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex flex-col items-center gap-1 w-20 mx-auto">
                            <span className="font-mono font-medium text-white text-xs">{Math.round(pred.confidenceScore * 100)}%</span>
                            <Progress value={pred.confidenceScore * 100} className="h-1.5 w-full" />
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {isPending ? (
                            <Badge variant="warning" className="border-dashed">
                              Pending
                            </Badge>
                          ) : pred.wasCorrect ? (
                            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                              <CheckCircle2 className="w-4 h-4" /> {pred.matchedNumbers}/6 Match
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-red-400 font-medium">
                              <XCircle className="w-4 h-4" /> Miss
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {isPending && (
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
              <p className="text-lg">No predictions yet — generate one using the AI.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Lottery;
