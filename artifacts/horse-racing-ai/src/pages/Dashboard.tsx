import { useListRaces, useGetPredictionStats, useListPredictions } from "@workspace/api-client-react";
import { Card, CardContent, Badge, Button, Progress } from "@/components/ui";
import { format } from "date-fns";
import { Link } from "wouter";
import { Activity, Target, Brain, ArrowRight, Trophy, Zap, ClockArrowUp } from "lucide-react";

export function Dashboard() {
  const { data: stats, isLoading: isStatsLoading } = useGetPredictionStats();
  const { data: upcomingRaces, isLoading: isRacesLoading } = useListRaces({ status: "upcoming" });
  const { data: recentPredictions, isLoading: isPredictionsLoading } = useListPredictions();

  return (
    <div className="relative min-h-full">
      <div className="absolute inset-0 h-80 w-full overflow-hidden z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/dashboard-bg.png`} 
          alt="Abstract Racing Track" 
          className="w-full h-full object-cover opacity-40 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="relative z-10 p-6 md:p-10 max-w-7xl mx-auto space-y-10">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-display font-bold text-white tracking-tight">
            AI Racing <span className="text-primary text-glow">Intelligence</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Predictive modeling for US horse racing utilizing historical data, track conditions, and deep performance analytics.
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <Card className="bg-card/60 backdrop-blur-md border-primary/20 glow-primary">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" /> Prediction Accuracy
                    </p>
                    <p className="text-4xl font-display font-bold text-white">
                      {isStatsLoading ? "--" : `${stats?.accuracyPercentage}%`}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Brain className="w-6 h-6 text-primary" />
                  </div>
                </div>
                <Progress value={stats?.accuracyPercentage || 0} className="mt-4 h-1.5" />
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="bg-card/60 backdrop-blur-md">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" /> Avg Confidence
                    </p>
                    <p className="text-4xl font-display font-bold text-white">
                      {isStatsLoading ? "--" : `${Math.round((stats?.averageConfidence || 0) * 100)}%`}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Activity className="w-6 h-6 text-amber-500" />
                  </div>
                </div>
                <Progress value={(stats?.averageConfidence || 0) * 100} className="mt-4 h-1.5" indicatorClassName="bg-amber-500" />
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="bg-card/60 backdrop-blur-md">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-blue-500" /> Total Predictions
                    </p>
                    <p className="text-4xl font-display font-bold text-white">
                      {isStatsLoading ? "--" : stats?.totalPredictions}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <ClockArrowUp className="w-6 h-6 text-blue-500" />
                  </div>
                </div>
                <div className="mt-4 text-sm text-muted-foreground">
                  Across all tracked races
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upcoming Races */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold flex items-center gap-2">
                Featured Upcoming <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              </h2>
              <Link href="/races" className="text-sm text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="space-y-4">
              {isRacesLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="p-5 flex gap-4 animate-pulse bg-secondary/50 border-transparent">
                    <div className="w-12 h-12 bg-secondary rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 bg-secondary rounded w-1/3" />
                      <div className="h-4 bg-secondary rounded w-1/4" />
                    </div>
                  </Card>
                ))
              ) : upcomingRaces?.slice(0, 4).map((race) => (
                <Link key={race.id} href={`/races/${race.id}`} className="block group">
                  <Card className="transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 bg-card/40">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-secondary flex flex-col items-center justify-center border border-border group-hover:border-primary/30 transition-colors">
                        <span className="text-xs text-muted-foreground uppercase">Race</span>
                        <span className="font-bold text-lg">{race.raceNumber}</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-lg text-white group-hover:text-primary transition-colors">{race.trackName}</h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          <span>{format(new Date(race.raceDate), 'MMM d, h:mm a')}</span>
                          <span>•</span>
                          <span>{race.distance}</span>
                          <span>•</span>
                          <span className="capitalize">{race.surface}</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="group-hover:bg-primary group-hover:text-primary-foreground text-muted-foreground">
                        <ArrowRight className="w-5 h-5" />
                      </Button>
                    </CardContent>
                  </Card>
                </Link>
              ))}
              
              {upcomingRaces?.length === 0 && (
                <div className="p-8 text-center border border-dashed rounded-xl border-border text-muted-foreground">
                  No upcoming races scheduled.
                </div>
              )}
            </div>
          </div>

          {/* Recent AI Predictions */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold">Recent Predictions</h2>
              <Link href="/predictions" className="text-sm text-primary hover:underline flex items-center gap-1">
                View history <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="space-y-4">
              {isPredictionsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="h-24 bg-secondary/50 animate-pulse border-transparent" />
                ))
              ) : recentPredictions?.slice(0, 4).map((pred) => (
                <Card key={pred.id} className="bg-card/40">
                  <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{pred.trackName} - Race {pred.raceId}</p>
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-white text-lg">{pred.predictedWinnerName}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                        <div className="flex items-center gap-2">
                          <Progress value={pred.confidenceScore * 100} className="w-20 h-1.5" />
                          <span className="font-mono font-bold text-primary">{Math.round(pred.confidenceScore * 100)}%</span>
                        </div>
                      </div>
                      
                      {pred.wasCorrect !== null && pred.wasCorrect !== undefined && (
                        <Badge variant={pred.wasCorrect ? "success" : "destructive"}>
                          {pred.wasCorrect ? "Hit" : "Miss"}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
