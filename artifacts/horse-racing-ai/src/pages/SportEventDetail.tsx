import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Progress } from "@/components/ui";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, BrainCircuit, TrendingUp, Info, CheckCircle2, XCircle, AlertCircle, Clock, ClipboardCheck, Newspaper, Cloud, TrendingDown, Users, ShieldCheck, ShieldAlert, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { NewsPanel } from "@/components/NewsPanel";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatOdds(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}

function impliedProb(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100);
  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

function SportResultRecorder({ predId, homeTeam, awayTeam, onDone }: { predId: number; homeTeam: string; awayTeam: string; onDone: () => void }) {
  const [step, setStep] = useState<"idle" | "pick-winner">("idle");
  const mutation = useMutation({
    mutationFn: async ({ wasCorrect, actualWinner }: { wasCorrect: boolean; actualWinner?: string }) => {
      const res = await fetch(`${BASE}/api/sports/predictions/${predId}/result`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wasCorrect, actualWinner }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: onDone,
  });

  if (step === "pick-winner") {
    return (
      <div className="border border-border/50 rounded-xl p-4 space-y-3">
        <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1.5">
          <ClipboardCheck className="w-3.5 h-3.5" /> Who actually won?
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 border-destructive/40 text-red-400 hover:bg-destructive/10" disabled={mutation.isPending}
            onClick={() => mutation.mutate({ wasCorrect: false, actualWinner: homeTeam })}>
            {homeTeam}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 border-destructive/40 text-red-400 hover:bg-destructive/10" disabled={mutation.isPending}
            onClick={() => mutation.mutate({ wasCorrect: false, actualWinner: awayTeam })}>
            {awayTeam}
          </Button>
        </div>
        <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => setStep("idle")}>Cancel</Button>
      </div>
    );
  }

  return (
    <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 space-y-3">
      <p className="text-xs text-amber-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
        <ClipboardCheck className="w-3.5 h-3.5" /> Record result to train the AI
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" disabled={mutation.isPending}
          onClick={() => mutation.mutate({ wasCorrect: true })}>
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Correct
        </Button>
        <Button size="sm" variant="outline" className="flex-1 border-destructive/40 text-red-400 hover:bg-destructive/10"
          onClick={() => setStep("pick-winner")}>
          <XCircle className="w-3.5 h-3.5 mr-1" /> Wrong
        </Button>
      </div>
    </div>
  );
}

export function SportEventDetail() {
  const [, params] = useRoute("/sports/:sport/events/:eventId");
  const sport = params?.sport || "";
  const eventId = params?.eventId || "";
  const queryClient = useQueryClient();

  const { data: events } = useQuery<any[]>({
    queryKey: ["sport-events", sport],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sports/events?sport=${sport}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!sport,
  });

  const { data: predictions } = useQuery<any[]>({
    queryKey: ["sports-predictions", sport],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sports/predictions?sport=${sport}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const event = events?.find((e) => e.id === eventId);
  const prediction = predictions?.find((p) => p.externalEventId === eventId);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!event) throw new Error("Event not found");
      const res = await fetch(`${BASE}/api/sports/predictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          sportKey: event.sport_key,
          sportTitle: event.sport_title,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          commenceTime: event.commence_time,
          oddsData: { bookmakers: event.bookmakers },
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate prediction");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sports-predictions", sport] });
    },
  });

  const bookmakers = event?.bookmakers || [];
  const isUpcoming = event ? new Date(event.commence_time) > new Date() : true;

  if (!event && events) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p>Event not found or no longer available.</p>
        <Link href={`/sports/${sport}`} className="text-primary hover:underline mt-2 inline-block">
          Back to events
        </Link>
      </div>
    );
  }

  if (!event) {
    return <div className="p-10 text-center animate-pulse text-muted-foreground">Loading event...</div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div>
        <Link href={`/sports/${sport}`} className="text-muted-foreground hover:text-white flex items-center gap-2 w-fit mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to {event.sport_title}
        </Link>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <Badge variant={isUpcoming ? "default" : "secondary"}>
                {isUpcoming ? "UPCOMING" : "COMPLETED"}
              </Badge>
              <span className="text-primary font-bold text-sm uppercase tracking-widest">{event.sport_title}</span>
            </div>
            <div className="flex items-center gap-4">
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white">{event.away_team}</h1>
              <span className="text-2xl text-muted-foreground">@</span>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white">{event.home_team}</h1>
            </div>
          </div>
          <div className="flex gap-4 p-4 rounded-2xl bg-secondary/30 border border-border/50 shrink-0 text-center">
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Tipoff</p>
              <p className="font-medium text-white">{format(new Date(event.commence_time), "MMM d, h:mm a")}</p>
              <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(event.commence_time), { addSuffix: true })}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Odds Table */}
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader className="border-b border-border/50 bg-secondary/10">
              <CardTitle>Live Odds ({bookmakers.length} bookmakers)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {bookmakers.length === 0 ? (
                <p className="p-6 text-center text-muted-foreground text-sm">No odds available.</p>
              ) : (
                <div className="space-y-0 divide-y divide-border/30">
                  {/* Moneyline */}
                  <div className="overflow-x-auto">
                    <p className="px-6 pt-4 pb-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">Moneyline</p>
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-secondary/20 text-muted-foreground text-xs uppercase">
                        <tr>
                          <th className="px-6 py-3 font-semibold">Book</th>
                          <th className="px-6 py-3 font-semibold text-right">{event.away_team}</th>
                          <th className="px-6 py-3 font-semibold text-right">{event.home_team}</th>
                          <th className="px-6 py-3 font-semibold text-right">Draw</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {bookmakers.map((b: any) => {
                          const h2h = b.markets?.find((m: any) => m.key === "h2h");
                          const getOdds = (name: string) => h2h?.outcomes?.find((o: any) => o.name === name)?.price ?? null;
                          const awayOdds = getOdds(event.away_team);
                          const homeOdds = getOdds(event.home_team);
                          const drawOdds = h2h?.outcomes?.find((o: any) => o.name === "Draw")?.price ?? null;
                          return (
                            <tr key={b.key} className="hover:bg-secondary/10 transition-colors">
                              <td className="px-6 py-3 font-medium text-white">{b.title}</td>
                              <td className={cn("px-6 py-3 text-right font-mono font-bold", awayOdds !== null && awayOdds > 0 ? "text-emerald-400" : "text-muted-foreground")}>
                                {awayOdds !== null ? formatOdds(awayOdds) : "–"}
                              </td>
                              <td className={cn("px-6 py-3 text-right font-mono font-bold", homeOdds !== null && homeOdds > 0 ? "text-emerald-400" : "text-muted-foreground")}>
                                {homeOdds !== null ? formatOdds(homeOdds) : "–"}
                              </td>
                              <td className="px-6 py-3 text-right font-mono text-muted-foreground">
                                {drawOdds !== null ? formatOdds(drawOdds) : "–"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Point Spread */}
                  {bookmakers.some((b: any) => b.markets?.find((m: any) => m.key === "spreads")) && (
                    <div className="overflow-x-auto">
                      <p className="px-6 pt-4 pb-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">Point Spread</p>
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-secondary/20 text-muted-foreground text-xs uppercase">
                          <tr>
                            <th className="px-6 py-3 font-semibold">Book</th>
                            <th className="px-6 py-3 font-semibold text-right">{event.away_team}</th>
                            <th className="px-6 py-3 font-semibold text-right">{event.home_team}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {bookmakers.filter((b: any) => b.markets?.find((m: any) => m.key === "spreads")).map((b: any) => {
                            const sp = b.markets.find((m: any) => m.key === "spreads");
                            const getSpread = (name: string) => sp?.outcomes?.find((o: any) => o.name === name);
                            const away = getSpread(event.away_team);
                            const home = getSpread(event.home_team);
                            return (
                              <tr key={b.key} className="hover:bg-secondary/10 transition-colors">
                                <td className="px-6 py-3 font-medium text-white">{b.title}</td>
                                <td className="px-6 py-3 text-right font-mono text-muted-foreground">
                                  {away ? <><span className="text-white font-bold">{away.point > 0 ? "+" : ""}{away.point}</span> <span className="text-xs">({formatOdds(away.price)})</span></> : "–"}
                                </td>
                                <td className="px-6 py-3 text-right font-mono text-muted-foreground">
                                  {home ? <><span className="text-white font-bold">{home.point > 0 ? "+" : ""}{home.point}</span> <span className="text-xs">({formatOdds(home.price)})</span></> : "–"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Totals */}
                  {bookmakers.some((b: any) => b.markets?.find((m: any) => m.key === "totals")) && (
                    <div className="overflow-x-auto">
                      <p className="px-6 pt-4 pb-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">Over / Under</p>
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-secondary/20 text-muted-foreground text-xs uppercase">
                          <tr>
                            <th className="px-6 py-3 font-semibold">Book</th>
                            <th className="px-6 py-3 font-semibold text-right">Total</th>
                            <th className="px-6 py-3 font-semibold text-right">Over</th>
                            <th className="px-6 py-3 font-semibold text-right">Under</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {bookmakers.filter((b: any) => b.markets?.find((m: any) => m.key === "totals")).map((b: any) => {
                            const tot = b.markets.find((m: any) => m.key === "totals");
                            const over = tot?.outcomes?.find((o: any) => o.name === "Over");
                            const under = tot?.outcomes?.find((o: any) => o.name === "Under");
                            return (
                              <tr key={b.key} className="hover:bg-secondary/10 transition-colors">
                                <td className="px-6 py-3 font-medium text-white">{b.title}</td>
                                <td className="px-6 py-3 text-right font-mono font-bold text-white">{over?.point ?? under?.point ?? "–"}</td>
                                <td className="px-6 py-3 text-right font-mono text-emerald-400">{over ? formatOdds(over.price) : "–"}</td>
                                <td className="px-6 py-3 text-right font-mono text-red-400">{under ? formatOdds(under.price) : "–"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Implied Probabilities */}
          {bookmakers.length > 0 && (() => {
            const h2h = bookmakers[0]?.markets?.find((m: any) => m.key === "h2h");
            const awayOdds = h2h?.outcomes?.find((o: any) => o.name === event.away_team)?.price;
            const homeOdds = h2h?.outcomes?.find((o: any) => o.name === event.home_team)?.price;
            if (!awayOdds || !homeOdds) return null;
            const awayProb = impliedProb(awayOdds) * 100;
            const homeProb = impliedProb(homeOdds) * 100;

            return (
              <Card className="bg-card/60">
                <CardContent className="p-6 space-y-4">
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Market Implied Probabilities</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-white">{event.away_team}</span>
                        <span className="text-sm font-mono text-primary">{awayProb.toFixed(1)}%</span>
                      </div>
                      <Progress value={awayProb} className="h-2" />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-white">{event.home_team}</span>
                        <span className="text-sm font-mono text-primary">{homeProb.toFixed(1)}%</span>
                      </div>
                      <Progress value={homeProb} className="h-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* AI Prediction Sidebar */}
        <div className="xl:col-span-1">
          <NewsPanel
            url={`/api/sports/news?home=${encodeURIComponent(event.home_team)}&away=${encodeURIComponent(event.away_team)}&sport=${encodeURIComponent(event.sport_title)}`}
            queryKey={["sports-news", event.id]}
            label="Matchup News"
            className="mb-5"
          />
          <div className="sticky top-6">
            {!prediction ? (
              <Card className="border-primary/20 bg-gradient-to-b from-card to-secondary/20 shadow-xl overflow-hidden relative">
                {generateMutation.isPending && (
                  <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                    <BrainCircuit className="w-12 h-12 text-primary animate-pulse mb-4" />
                    <h3 className="text-lg font-bold text-white mb-2">Analyzing Matchup...</h3>
                    <p className="text-sm text-muted-foreground">Evaluating odds, team form, and market signals.</p>
                  </div>
                )}
                <CardContent className="p-8 text-center flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6 border border-primary/20">
                    <BrainCircuit className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="text-2xl font-display font-bold text-white mb-2">AI Game Predictor</h3>
                  <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
                    Our model analyzes live odds from {bookmakers.length} bookmakers, implied probabilities, and market movement to find the best pick.
                  </p>
                  {generateMutation.isError && (
                    <p className="text-destructive text-sm mb-4 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> {(generateMutation.error as Error)?.message}
                    </p>
                  )}
                  <Button
                    size="lg"
                    className="w-full glow-primary text-white font-bold tracking-wide"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending || !isUpcoming || bookmakers.length === 0}
                  >
                    {!isUpcoming ? "Event Completed" : bookmakers.length === 0 ? "No Odds Available" : "Generate AI Prediction"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-primary/40 bg-card glow-primary overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-emerald-400 to-primary" />
                <CardHeader className="bg-primary/5 pb-4">
                  <div className="flex justify-between items-center mb-4">
                    <Badge variant="default" className="bg-primary text-primary-foreground">
                      <BrainCircuit className="w-3 h-3 mr-1" /> AI Pick
                    </Badge>
                    <div className="flex items-center gap-2">
                      {prediction.weatherData && (
                        <span className="inline-flex items-center gap-1 text-xs bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-full px-2 py-0.5">
                          <Cloud className="w-3 h-3" />
                          {prediction.weatherData.tempF}°F · {prediction.weatherData.windMph} mph
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{format(new Date(prediction.createdAt), "MMM d, h:mm a")}</span>
                    </div>
                  </div>
                  <CardTitle className="text-muted-foreground text-xs uppercase tracking-widest">Predicted Winner</CardTitle>
                  <h2 className="text-3xl font-display font-bold text-white text-glow mt-1">{prediction.predictedWinner}</h2>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-sm text-muted-foreground">Confidence</span>
                    <div className="flex-1 flex items-center gap-2">
                      <Progress value={prediction.confidenceScore * 100} className="h-2 flex-1" />
                      <span className="font-mono font-bold text-primary">{Math.round(prediction.confidenceScore * 100)}%</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-5">
                  {/* Team Stats from ESPN */}
                  {(prediction.teamStats?.home || prediction.teamStats?.away) && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-4">
                      <h4 className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" /> Team Statistics
                      </h4>
                      {[
                        { team: prediction.teamStats.away, label: event.away_team, isHome: false },
                        { team: prediction.teamStats.home, label: event.home_team, isHome: true },
                      ].map(({ team, label, isHome }) => team && (
                        <div key={label} className="space-y-2">
                          <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                            {isHome ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> : <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />}
                            {label} <span className="text-muted-foreground font-normal">{isHome ? "(HOME)" : "(AWAY)"}</span>
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>Record: <span className="text-white font-mono">{team.wins}-{team.losses}</span> ({(team.winPct * 100).toFixed(1)}%)</span>
                            <span>Home: <span className="text-white font-mono">{team.homeRecord}</span> | Away: <span className="text-white font-mono">{team.awayRecord}</span></span>
                            <span>Scoring: <span className="text-emerald-400 font-mono">{team.avgPointsFor?.toFixed(1)}</span> / <span className="text-red-400 font-mono">{team.avgPointsAgainst?.toFixed(1)}</span> ppg</span>
                            {team.last5 && <span>Last 5: <span className="font-mono text-white">{team.last5}</span>{team.streak ? ` (${team.streak})` : ""}</span>}
                            {team.restDays != null && <span>Rest: <span className={cn("font-mono", team.restDays <= 1 ? "text-red-400" : "text-white")}>{team.restDays}d</span>{team.restDays <= 1 ? " ⚡ B2B" : ""}</span>}
                          </div>
                          {team.keyInjuries?.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-xs text-amber-400 font-semibold">Injury Report:</p>
                              {team.keyInjuries.slice(0, 5).map((inj: any, i: number) => (
                                <p key={i} className="text-xs text-muted-foreground ml-2">• {inj.name} ({inj.position}) — <span className={cn("font-semibold", inj.status === "Out" ? "text-red-400" : "text-amber-400")}>{inj.status}</span></p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Line Movement */}
                  {prediction.lineMovement && (
                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                      <h4 className="text-xs font-bold text-violet-400 uppercase mb-2 flex items-center gap-2">
                        <TrendingDown className="w-3.5 h-3.5" /> Sharp Money / Line Movement
                      </h4>
                      <p className="text-sm text-muted-foreground">{prediction.lineMovement.summary}</p>
                    </div>
                  )}

                  {/* Weather detail for outdoor sports */}
                  {prediction.weatherData && (
                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                      <h4 className="text-xs font-bold text-sky-400 uppercase mb-2 flex items-center gap-2">
                        <Cloud className="w-3.5 h-3.5" /> Weather at Venue
                      </h4>
                      <p className="text-sm text-muted-foreground">{prediction.weatherData.description}</p>
                    </div>
                  )}

                  {/* Market Snapshot — spread & totals at prediction time */}
                  {prediction.oddsAtPrediction?.bookmakers?.length > 0 && (() => {
                    const book = prediction.oddsAtPrediction.bookmakers[0];
                    const sp = book?.markets?.find((m: any) => m.key === "spreads");
                    const tot = book?.markets?.find((m: any) => m.key === "totals");
                    if (!sp && !tot) return null;
                    const awaySpread = sp?.outcomes?.find((o: any) => o.name === event.away_team);
                    const homeSpread = sp?.outcomes?.find((o: any) => o.name === event.home_team);
                    const over = tot?.outcomes?.find((o: any) => o.name === "Over");
                    const under = tot?.outcomes?.find((o: any) => o.name === "Under");
                    return (
                      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase mb-3 flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5" /> Market Snapshot at Prediction ({book.title})
                        </h4>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          {awaySpread && homeSpread && (
                            <div className="space-y-1">
                              <p className="text-muted-foreground font-semibold uppercase tracking-wide">Spread</p>
                              <p className="font-mono text-white">{event.away_team} <span className="text-primary font-bold">{awaySpread.point > 0 ? "+" : ""}{awaySpread.point}</span> <span className="text-muted-foreground">({formatOdds(awaySpread.price)})</span></p>
                              <p className="font-mono text-white">{event.home_team} <span className="text-primary font-bold">{homeSpread.point > 0 ? "+" : ""}{homeSpread.point}</span> <span className="text-muted-foreground">({formatOdds(homeSpread.price)})</span></p>
                            </div>
                          )}
                          {over && under && (
                            <div className="space-y-1">
                              <p className="text-muted-foreground font-semibold uppercase tracking-wide">Total</p>
                              <p className="font-mono"><span className="text-emerald-400 font-bold">O {over.point}</span> <span className="text-muted-foreground">({formatOdds(over.price)})</span></p>
                              <p className="font-mono"><span className="text-red-400 font-bold">U {under.point}</span> <span className="text-muted-foreground">({formatOdds(under.price)})</span></p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {prediction.recommendedBet && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                      <p className="text-xs font-bold text-amber-400 uppercase mb-1 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" /> Recommended Bet
                      </p>
                      <p className="text-sm text-white">{prediction.recommendedBet}</p>
                    </div>
                  )}

                  {prediction.keyFactors?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Key Factors</h4>
                      <ul className="space-y-1.5">
                        {prediction.keyFactors.map((f: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* News Impact */}
                  {prediction.newsInsights?.length > 0 && (
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
                      <h4 className="text-xs font-bold text-blue-400 uppercase mb-2 flex items-center gap-2">
                        <Newspaper className="w-3.5 h-3.5" /> News Impact on Prediction
                      </h4>
                      <ul className="space-y-1.5">
                        {prediction.newsInsights.map((insight: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                            {insight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Confidence Factors */}
                  {(prediction.confidenceFactors?.boosts?.length > 0 || prediction.confidenceFactors?.reducers?.length > 0) && (
                    <div className="rounded-xl border border-slate-500/20 bg-slate-500/5 p-4 space-y-3">
                      <h4 className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5" /> Confidence Breakdown
                      </h4>
                      {prediction.confidenceFactors.boosts?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-emerald-400 mb-1">Confidence Boosters</p>
                          <ul className="space-y-1">
                            {prediction.confidenceFactors.boosts.map((b: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />{b}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {prediction.confidenceFactors.reducers?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-amber-400 mb-1">Confidence Reducers</p>
                          <ul className="space-y-1">
                            {prediction.confidenceFactors.reducers.map((r: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <AlertCircle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />{r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                    <h4 className="text-xs font-bold text-primary uppercase mb-2 flex items-center gap-2">
                      <Info className="w-4 h-4" /> AI Reasoning
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{prediction.reasoning}</p>
                  </div>

                  {/* Result Recording */}
                  {prediction.wasCorrect === null || prediction.wasCorrect === undefined ? (
                    <SportResultRecorder
                      predId={prediction.id}
                      homeTeam={event.home_team}
                      awayTeam={event.away_team}
                      onDone={() => queryClient.invalidateQueries({ queryKey: ["sports-predictions", sport] })}
                    />
                  ) : (
                    <div className={cn("rounded-xl p-3 border text-sm font-medium flex items-center gap-2",
                      prediction.wasCorrect
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-destructive/10 border-destructive/20 text-red-400"
                    )}>
                      {prediction.wasCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {prediction.wasCorrect ? "Prediction was correct!" : `Miss — ${prediction.actualWinner ? `Won by: ${prediction.actualWinner}` : "result recorded"}`}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
