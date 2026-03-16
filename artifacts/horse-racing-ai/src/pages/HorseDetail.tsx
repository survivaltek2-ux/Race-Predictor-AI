import { useRoute, Link } from "wouter";
import { useGetHorse } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Progress } from "@/components/ui";
import { ArrowLeft, Trophy, DollarSign, Medal, TrendingUp, History } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { format } from "date-fns";

export function HorseDetail() {
  const [, params] = useRoute("/horses/:id");
  const id = parseInt(params?.id || "0", 10);
  const { data: horse, isLoading } = useGetHorse(id);

  if (isLoading) return <div className="p-10 text-center animate-pulse">Loading profile...</div>;
  if (!horse) return <div className="p-10 text-center">Horse not found.</div>;

  const winPercent = horse.totalRaces > 0 ? (horse.totalWins / horse.totalRaces) * 100 : 0;
  const inTheMoneyPercent = horse.totalRaces > 0 ? ((horse.totalWins + horse.totalPlaces + horse.totalShows) / horse.totalRaces) * 100 : 0;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <Link href="/horses" className="text-muted-foreground hover:text-white flex items-center gap-2 w-fit transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Database
      </Link>

      {/* Header Profile */}
      <div className="flex flex-col md:flex-row gap-8 items-start">
        <div className="w-full md:w-1/3 space-y-6">
          <Card className="bg-gradient-to-br from-card to-secondary/30 border-border/50">
            <CardContent className="p-8 text-center flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center mb-4">
                <Trophy className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-3xl font-display font-bold text-white mb-2">{horse.name}</h1>
              <div className="flex items-center justify-center gap-2 flex-wrap mb-6">
                <Badge variant="outline" className="capitalize">{horse.age}yo {horse.sex}</Badge>
                {horse.color && <Badge variant="secondary" className="capitalize">{horse.color}</Badge>}
              </div>
              
              <div className="w-full space-y-4 text-left border-t border-border/50 pt-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Pedigree</p>
                  <p className="font-medium text-white">{horse.sire || 'Unknown'} × {horse.dam || 'Unknown'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Trainer</p>
                    <p className="font-medium text-white truncate" title={horse.trainer}>{horse.trainer || '--'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Owner</p>
                    <p className="font-medium text-white truncate" title={horse.owner}>{horse.owner || '--'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-full md:w-2/3 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1.5"><History className="w-3.5 h-3.5"/> Career Starts</p>
                <p className="text-3xl font-display font-bold text-white">{horse.totalRaces}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1.5"><Medal className="w-3.5 h-3.5 text-amber-400"/> W-P-S</p>
                <p className="text-2xl font-mono font-bold text-white tracking-tight">
                  <span className="text-amber-400">{horse.totalWins}</span>-
                  <span className="text-slate-300">{horse.totalPlaces}</span>-
                  <span className="text-amber-700">{horse.totalShows}</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-400"/> Win %</p>
                <p className="text-3xl font-display font-bold text-emerald-400">{winPercent.toFixed(1)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-primary"/> Earnings</p>
                <p className="text-2xl font-mono font-bold text-white">{formatCurrency(horse.earnings)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Expanded Performance metrics */}
          <Card>
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-lg">Performance Analytics</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-medium text-white">Win Rate</span>
                  <span className="text-sm font-bold text-primary">{winPercent.toFixed(1)}%</span>
                </div>
                <Progress value={winPercent} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-medium text-white">In The Money (W-P-S) Rate</span>
                  <span className="text-sm font-bold text-emerald-400">{inTheMoneyPercent.toFixed(1)}%</span>
                </div>
                <Progress value={inTheMoneyPercent} className="h-2" indicatorClassName="bg-emerald-400" />
              </div>
            </CardContent>
          </Card>

          {/* Past Performances */}
          <Card>
            <CardHeader className="border-b border-border/50 bg-secondary/10">
              <CardTitle className="text-lg">Recent Race History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-secondary/20 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Track / Race</th>
                      <th className="px-6 py-4 font-semibold text-center">Finish</th>
                      <th className="px-6 py-4 font-semibold">Dist/Surf</th>
                      <th className="px-6 py-4 font-semibold">Odds</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {horse.recentRaces.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">No recent race history available.</td>
                      </tr>
                    ) : horse.recentRaces.map((race) => (
                      <tr key={race.raceId} className="hover:bg-secondary/10 transition-colors">
                        <td className="px-6 py-4 text-white font-medium">
                          {format(new Date(race.raceDate), 'MM/dd/yyyy')}
                        </td>
                        <td className="px-6 py-4">
                          <Link href={`/races/${race.raceId}`} className="font-bold text-white hover:text-primary transition-colors block">
                            {race.trackName}
                          </Link>
                          <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">{race.raceName}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center font-bold mx-auto",
                            race.finishPosition === 1 ? "bg-amber-400 text-amber-950 shadow-[0_0_10px_rgba(251,191,36,0.3)]" : 
                            race.finishPosition === 2 ? "bg-slate-300 text-slate-900" : 
                            race.finishPosition === 3 ? "bg-amber-700/60 text-white" : "bg-secondary text-muted-foreground"
                          )}>
                            {race.finishPosition}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {race.distance} • <span className="capitalize">{race.surface}</span>
                        </td>
                        <td className="px-6 py-4 font-mono font-medium text-white">
                          {race.odds || '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
