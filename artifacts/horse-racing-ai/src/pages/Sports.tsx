import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, Badge } from "@/components/ui";
import { Link } from "wouter";
import { ArrowRight, Tv2 } from "lucide-react";

const SPORT_ICONS: Record<string, string> = {
  americanfootball: "🏈",
  basketball: "🏀",
  baseball: "⚾",
  icehockey: "🏒",
  soccer: "⚽",
  boxing: "🥊",
  mma: "🥋",
  golf: "⛳",
  tennis: "🎾",
  cricket: "🏏",
  rugby: "🏉",
  aussierules: "🏉",
};

function getSportIcon(key: string): string {
  for (const prefix of Object.keys(SPORT_ICONS)) {
    if (key.startsWith(prefix)) return SPORT_ICONS[prefix]!;
  }
  return "🏆";
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function Sports() {
  const { data: sports, isLoading } = useQuery<any[]>({
    queryKey: ["sports-list"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sports/list`);
      if (!res.ok) throw new Error("Failed to fetch sports");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const grouped = sports?.reduce((acc: Record<string, any[]>, sport: any) => {
    const group = sport.group || "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(sport);
    return acc;
  }, {});

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
          <Tv2 className="w-8 h-8 text-primary" /> Sports Center
        </h1>
        <p className="text-muted-foreground mt-2">
          Live odds and AI predictions across all major sports — powered by The Odds API.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-secondary/50 animate-pulse" />
          ))}
        </div>
      ) : (
        Object.entries(grouped || {}).map(([group, items]) => (
          <div key={group} className="space-y-3">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{group}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(items as any[]).map((sport: any) => (
                <Link key={sport.key} href={`/sports/${sport.key}`} className="block group">
                  <Card className="transition-all duration-200 hover:border-primary/50 bg-card/60 hover:bg-card">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="text-3xl w-12 h-12 flex items-center justify-center rounded-xl bg-secondary">
                        {getSportIcon(sport.key)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white group-hover:text-primary transition-colors truncate">
                          {sport.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{sport.description}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}

      {!isLoading && Object.keys(grouped || {}).length === 0 && (
        <div className="py-20 text-center text-muted-foreground">
          <Tv2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No sports available right now.</p>
        </div>
      )}
    </div>
  );
}
