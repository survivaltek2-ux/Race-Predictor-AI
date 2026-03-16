import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, BrainCircuit, Clock, ArrowRight } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatOdds(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}

function getBestOdds(bookmakers: any[], team: string) {
  for (const b of bookmakers || []) {
    const h2h = b.markets?.find((m: any) => m.key === "h2h");
    if (!h2h) continue;
    const outcome = h2h.outcomes?.find((o: any) => o.name === team);
    if (outcome) return outcome.price;
  }
  return null;
}

export function SportEvents() {
  const [, params] = useRoute("/sports/:sport");
  const sport = params?.sport || "";

  const { data: events, isLoading } = useQuery<any[]>({
    queryKey: ["sport-events", sport],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sports/events?sport=${sport}`);
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!sport,
  });

  const { data: predictions } = useQuery<any[]>({
    queryKey: ["sports-predictions", sport],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sports/predictions?sport=${sport}`);
      if (!res.ok) throw new Error("Failed to fetch predictions");
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const predByEvent = (predictions || []).reduce((acc: Record<string, any>, p: any) => {
    acc[p.externalEventId] = p;
    return acc;
  }, {});

  const sportTitle = events?.[0]?.sport_title || sport;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div>
        <Link href="/sports" className="text-muted-foreground hover:text-white flex items-center gap-2 w-fit mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> All Sports
        </Link>
        <h1 className="text-3xl font-display font-bold text-white">{sportTitle}</h1>
        <p className="text-muted-foreground mt-1">
          {isLoading ? "Loading..." : `${events?.length || 0} upcoming events with live odds`}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-secondary/50 animate-pulse" />
          ))}
        </div>
      ) : events?.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground border border-dashed border-border rounded-2xl">
          <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg">No upcoming events right now.</p>
          <p className="text-sm mt-1">Check back when games are scheduled.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {events?.map((event: any) => {
            const pred = predByEvent[event.id];
            const homeOdds = getBestOdds(event.bookmakers, event.home_team);
            const awayOdds = getBestOdds(event.bookmakers, event.away_team);
            const bookmakerCount = event.bookmakers?.length || 0;

            return (
              <Link key={event.id} href={`/sports/${sport}/events/${event.id}`} className="block group">
                <Card className="transition-all duration-200 hover:border-primary/50 bg-card/60 hover:bg-card">
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(event.commence_time), { addSuffix: true })} · {format(new Date(event.commence_time), "MMM d, h:mm a")}
                          </span>
                          {bookmakerCount > 0 && (
                            <Badge variant="outline" className="text-xs">{bookmakerCount} books</Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-center min-w-[120px]">
                            <p className="font-bold text-white text-lg leading-tight group-hover:text-primary transition-colors">{event.away_team}</p>
                            {awayOdds !== null && (
                              <span className={`text-sm font-mono font-bold ${awayOdds > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                                {formatOdds(awayOdds)}
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground font-bold text-sm px-2">@</div>
                          <div className="text-center min-w-[120px]">
                            <p className="font-bold text-white text-lg leading-tight group-hover:text-primary transition-colors">{event.home_team}</p>
                            {homeOdds !== null && (
                              <span className={`text-sm font-mono font-bold ${homeOdds > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                                {formatOdds(homeOdds)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {pred ? (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground mb-1">AI Pick</p>
                            <p className="font-bold text-primary">{pred.predictedWinner}</p>
                            <p className="text-xs text-muted-foreground">{Math.round(pred.confidenceScore * 100)}% confidence</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-primary">
                            <BrainCircuit className="w-4 h-4" />
                            <span>Get AI pick</span>
                          </div>
                        )}
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
