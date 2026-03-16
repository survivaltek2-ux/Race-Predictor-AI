import { useListPredictions, useGetPredictionStats } from "@workspace/api-client-react";
import { Card, CardContent, Badge, Button, Progress } from "@/components/ui";
import { format } from "date-fns";
import { Link } from "wouter";
import { BrainCircuit, CheckCircle2, XCircle, ArrowRight } from "lucide-react";

export function Predictions() {
  const { data: predictions, isLoading } = useListPredictions();
  const { data: stats } = useGetPredictionStats();

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
          <BrainCircuit className="w-8 h-8 text-primary" /> Prediction Ledger
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Complete historical log of all AI-generated predictions, outcomes, and model accuracy tracking.
        </p>
      </div>

      {/* Mini Stats Banner */}
      <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-primary uppercase font-bold tracking-wider mb-1">Overall Accuracy</p>
            <p className="text-2xl font-mono font-bold text-white">{stats ? `${stats.accuracyPercentage}%` : '--'}</p>
          </div>
          <div className="w-px h-10 bg-primary/20"></div>
          <div>
            <p className="text-xs text-primary uppercase font-bold tracking-wider mb-1">Predictions</p>
            <p className="text-2xl font-mono font-bold text-white">{stats ? stats.totalPredictions : '--'}</p>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary/30 text-muted-foreground text-xs uppercase border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-semibold">Generated</th>
                <th className="px-6 py-4 font-semibold">Race Event</th>
                <th className="px-6 py-4 font-semibold">AI Top Pick</th>
                <th className="px-6 py-4 font-semibold text-center">Confidence</th>
                <th className="px-6 py-4 font-semibold">Outcome</th>
                <th className="px-6 py-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                 Array.from({ length: 8 }).map((_, i) => (
                   <tr key={i} className="animate-pulse">
                     <td colSpan={6} className="px-6 py-6 bg-secondary/10"></td>
                   </tr>
                 ))
              ) : predictions?.map((pred) => (
                <tr key={pred.id} className="hover:bg-secondary/10 transition-colors group">
                  <td className="px-6 py-4 text-muted-foreground">
                    {format(new Date(pred.createdAt), 'MM/dd/yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-white block">{pred.trackName}</span>
                    <span className="text-xs text-muted-foreground">Race {pred.raceId}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-primary text-base">{pred.predictedWinnerName}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center gap-1 w-24 mx-auto">
                      <span className="font-mono font-medium text-white">{Math.round(pred.confidenceScore * 100)}%</span>
                      <Progress value={pred.confidenceScore * 100} className="h-1.5 w-full" />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {pred.wasCorrect === null || pred.wasCorrect === undefined ? (
                      <Badge variant="outline" className="text-muted-foreground border-dashed">Pending</Badge>
                    ) : pred.wasCorrect ? (
                      <div className="flex items-center gap-2 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-5 h-5" />
                        Hit
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-destructive font-medium">
                        <XCircle className="w-5 h-5" />
                        Miss
                        <span className="text-xs text-muted-foreground font-normal ml-2 truncate max-w-[100px]">
                          (Won: {pred.actualWinnerName})
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/races/${pred.raceId}`}>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        View Analysis <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {predictions?.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              <BrainCircuit className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg">No predictions have been generated yet.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
