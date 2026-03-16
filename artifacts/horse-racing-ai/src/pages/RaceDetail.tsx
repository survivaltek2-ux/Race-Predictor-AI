import { useRoute, Link } from "wouter";
import { useGetRace, useGetRaceEntries, useListPredictions, useGeneratePrediction, getListPredictionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Progress } from "@/components/ui";
import { format } from "date-fns";
import { ArrowLeft, BrainCircuit, AlertCircle, Info, TrendingUp, DollarSign, Medal } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { NewsPanel } from "@/components/NewsPanel";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function RaceDetail() {
  const [, params] = useRoute("/races/:id");
  const id = parseInt(params?.id || "0", 10);
  const queryClient = useQueryClient();

  const { data: race, isLoading: isLoadingRace } = useGetRace(id);
  const { data: entries, isLoading: isLoadingEntries } = useGetRaceEntries(id);
  const { data: predictions } = useListPredictions({ raceId: id });
  
  const generateMutation = useGeneratePrediction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPredictionsQueryKey({ raceId: id }) });
      }
    }
  });

  const prediction = predictions?.[0]; // Get latest prediction for this race
  const isGenerating = generateMutation.isPending;

  if (isLoadingRace) return <div className="p-10 text-center animate-pulse">Loading race data...</div>;
  if (!race) return <div className="p-10 text-center">Race not found.</div>;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link href="/races" className="text-muted-foreground hover:text-white flex items-center gap-2 w-fit mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Races
        </Link>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant={race.status === "upcoming" ? "default" : "secondary"}>
                {race.status.toUpperCase()}
              </Badge>
              <span className="text-primary font-bold tracking-widest uppercase text-sm">Race {race.raceNumber}</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-display font-bold text-white mb-2">{race.trackName}</h1>
            <p className="text-lg text-muted-foreground">{race.raceName}</p>
          </div>
          
          <div className="flex gap-4 p-4 rounded-2xl bg-secondary/30 border border-border/50 shrink-0">
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Date</p>
              <p className="font-medium text-white">{format(new Date(race.raceDate), 'MMM d, yyyy')}</p>
            </div>
            <div className="w-px bg-border"></div>
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Distance/Surface</p>
              <p className="font-medium text-white capitalize">{race.distance} • {race.surface}</p>
            </div>
            <div className="w-px bg-border"></div>
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Purse</p>
              <p className="font-medium text-emerald-400">{race.purse ? formatCurrency(race.purse) : 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Main Content Column (Entries) */}
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader className="border-b border-border/50 bg-secondary/10">
              <CardTitle>Field Entries ({entries?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-secondary/20 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-6 py-4 font-semibold">PP</th>
                      <th className="px-6 py-4 font-semibold">Horse</th>
                      <th className="px-6 py-4 font-semibold">Jockey / Trainer</th>
                      <th className="px-6 py-4 font-semibold text-right">M/L Odds</th>
                      <th className="px-6 py-4 font-semibold text-right">Win %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {isLoadingEntries ? (
                       <tr><td colSpan={5} className="p-6 text-center text-muted-foreground animate-pulse">Loading entries...</td></tr>
                    ) : entries?.map((entry) => (
                      <tr key={entry.id} className="hover:bg-secondary/10 transition-colors">
                        <td className="px-6 py-4">
                          <span className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center font-bold text-white">
                            {entry.postPosition}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Link href={`/horses/${entry.horseId}`} className="font-bold text-base text-white hover:text-primary transition-colors">
                            {entry.horseName}
                          </Link>
                          <div className="text-xs text-muted-foreground mt-0.5">{entry.totalRaces} Starts / {entry.totalWins} Wins</div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-white font-medium">{entry.jockey}</p>
                          <p className="text-muted-foreground text-xs">T: {entry.trainer}</p>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-amber-400 font-semibold">
                          {entry.morningLineOdds || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-semibold text-emerald-400">{entry.winPercentage ? `${entry.winPercentage}%` : 'N/A'}</span>
                            {entry.winPercentage !== undefined && entry.winPercentage !== null && (
                               <Progress value={entry.winPercentage ?? 0} className="w-16 h-1" />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Column (AI Prediction) */}
        <div className="xl:col-span-1">
          {race.trackName && (
            <NewsPanel
              url={`/api/predictions/news?track=${encodeURIComponent(race.trackName)}&horses=${encodeURIComponent((entries ?? []).slice(0, 4).map((e: any) => e.horseName).join(","))}`}
              queryKey={["race-news", id, (entries ?? []).map((e: any) => e.horseName).join(",")]}
              label="Race Day News"
              className="mb-5"
            />
          )}
          <div className="sticky top-6">
            {!prediction ? (
              <Card className="border-primary/20 bg-gradient-to-b from-card to-secondary/20 shadow-xl overflow-hidden relative">
                {isGenerating && (
                   <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                     <BrainCircuit className="w-12 h-12 text-primary animate-pulse mb-4" />
                     <h3 className="text-lg font-bold text-white mb-2">Analyzing Race Data...</h3>
                     <p className="text-sm text-muted-foreground max-w-[250px]">Processing historical forms, track conditions, and deep jockey analytics.</p>
                   </div>
                )}
                
                <CardContent className="p-8 text-center flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6 border border-primary/20">
                    <BrainCircuit className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="text-2xl font-display font-bold text-white mb-2">AI Race Predictor</h3>
                  <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
                    Unlock our proprietary machine learning model to get the highest probability winner and top exotic picks for this race.
                  </p>
                  
                  <Button 
                    size="lg" 
                    className="w-full shadow-primary/30 glow-primary text-white font-bold tracking-wide"
                    onClick={() => generateMutation.mutate({ data: { raceId: id }})}
                    disabled={isGenerating || race.status === "completed"}
                  >
                    {race.status === "completed" ? "Race Completed" : "Generate Prediction"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div>
                <Card className="border-primary/40 bg-card glow-primary overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-emerald-400 to-primary"></div>
                  
                  <CardHeader className="bg-primary/5 pb-4">
                    <div className="flex justify-between items-center mb-4">
                      <Badge variant="default" className="bg-primary text-primary-foreground border-transparent">
                        <BrainCircuit className="w-3 h-3 mr-1" /> AI Generated
                      </Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(prediction.createdAt), 'MMM d, h:mm a')}</span>
                    </div>
                    <CardTitle className="text-muted-foreground text-sm uppercase tracking-widest font-sans font-bold">Predicted Winner</CardTitle>
                    <div className="mt-2">
                      <h2 className="text-4xl font-display font-bold text-white text-glow">{prediction.predictedWinnerName}</h2>
                      <div className="flex items-center gap-3 mt-3">
                        <span className="text-sm text-muted-foreground">Model Confidence</span>
                        <div className="flex-1 flex items-center gap-2">
                          <Progress value={prediction.confidenceScore * 100} className="h-2 flex-1" />
                          <span className="font-mono font-bold text-primary">{Math.round(prediction.confidenceScore * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-6 space-y-6">
                    {/* Top Picks List */}
                    <div>
                      <h4 className="text-xs font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4"/> Exotic Top Picks
                      </h4>
                      <div className="space-y-3">
                        {prediction.topPicks.map((pick, idx) => (
                          <div key={idx} className="flex bg-secondary/40 rounded-xl p-3 border border-border/50 items-center gap-4">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                              idx === 0 ? "bg-amber-400 text-amber-950" : 
                              idx === 1 ? "bg-slate-300 text-slate-900" : "bg-amber-700/50 text-white"
                            )}>
                              {pick.rank}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-white truncate">{pick.horseName}</p>
                              <p className="text-xs text-muted-foreground truncate">{pick.keyFactors[0]}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono text-sm font-bold text-primary">{Math.round(pick.confidenceScore * 100)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reasoning */}
                    <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                      <h4 className="text-xs font-bold text-primary uppercase mb-2 flex items-center gap-2">
                        <Info className="w-4 h-4" /> AI Reasoning
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {prediction.reasoning}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
