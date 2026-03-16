import { useQuery } from "@tanstack/react-query";
import { Newspaper, ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface NewsItem {
  title: string;
  description: string;
  pubDate: string;
  source: string;
}

interface NewsPanelProps {
  url: string;
  queryKey: string[];
  label?: string;
  className?: string;
}

export function NewsPanel({ url, queryKey, label = "Latest News", className }: NewsPanelProps) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<NewsItem[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`${BASE}${url}`);
      if (!res.ok) throw new Error("Failed to fetch news");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const items = data ?? [];

  return (
    <div className={cn("rounded-2xl border border-border/50 bg-card/60 overflow-hidden", className)}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
          <span className="text-xs text-primary/60 font-medium">— analyzed by AI</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-muted-foreground hover:text-white transition-colors p-1 rounded-md hover:bg-white/5 disabled:opacity-40"
          title="Refresh news"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
        </button>
      </div>

      {isLoading && (
        <div className="p-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5 animate-pulse">
              <div className="h-3.5 bg-white/5 rounded w-4/5" />
              <div className="h-3 bg-white/5 rounded w-3/5" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="p-5 flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          Could not load news — AI will still use available data
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="p-5 text-sm text-muted-foreground">
          No recent news found for this matchup.
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <ul className="divide-y divide-border/30">
          {items.map((item, i) => (
            <li key={i} className="px-5 py-3.5 group">
              <div className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-2 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white leading-snug line-clamp-2">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    {item.source && (
                      <span className="text-xs text-primary/70 font-medium">{item.source}</span>
                    )}
                    {item.pubDate && (
                      <span className="text-xs text-muted-foreground/60">
                        {formatPubDate(item.pubDate)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatPubDate(raw: string): string {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw.slice(0, 16);
    const diff = Date.now() - d.getTime();
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
