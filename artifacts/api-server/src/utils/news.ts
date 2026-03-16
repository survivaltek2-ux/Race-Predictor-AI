export interface NewsItem {
  title: string;
  description: string;
  pubDate: string;
  source: string;
}

// ─── Noise filters ─────────────────────────────────────────────────────────
// Patterns that reliably identify non-sports / ad content.  Tested case-insensitively.
const NOISE_PATTERNS: RegExp[] = [
  // Obituaries & death notices  ("John Doe, 83, of Springfield" or "Dies at 74")
  /\b\d{2,3},\s+of\s+\w/i,
  /\bdies?\b.*\bat\s+\d{2}/i,
  /\bpassed away\b/i,
  /\bobituary\b/i,
  /\bmemorial\s+service\b/i,
  /\bfuneral\b/i,
  /\bin\s+loving\s+memory\b/i,

  // Casino / gambling ads (not sports betting context)
  /\bjackpot\s+record/i,
  /\bslot\s+machine/i,
  /\bcasino['']s?\s+jackpot/i,
  /\blucky\s+players?\s+break/i,

  // Non-sports "industrial / municipal" news
  /\bindustrial\s+business\s+park\b/i,
  /\bstate\s+funds?\s+for\b/i,
  /\breceives?\s+\$\d+[MBK]\b/i,

  // Motocross / non-horse-racing motor sport (when querying for horse racing)
  /\bsupermotocross\b/i,

  // Real-estate / cooking / unrelated lifestyle
  /\brecipe\b/i,
  /\breal\s+estate\b/i,
];

function isNoise(title: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(title));
}

// ─── Relevance scoring ──────────────────────────────────────────────────────
const HORSE_RACING_TERMS = [
  /\bhorse\s+rac/i, /\brac(e|ing|etrack)\b/i, /\bjockey\b/i, /\btrainer\b/i,
  /\bderby\b/i, /\bstakes\b/i, /\bpurse\b/i, /\bhandicap\b/i, /\bgallop\b/i,
  /\bthrooughbred\b/i, /\bdirt\s+track\b/i, /\bturf\b/i, /\bfurlongs?\b/i,
  /\bscratch(ed)?\b/i, /\bmorn(ing)?\s+line\b/i, /\bpost\s+time\b/i,
  /\bchurchill\s+downs\b/i, /\bbelmont\b/i, /\bsaratoga\b/i, /\bkeeneland\b/i,
  /\baqueduct\b/i, /\bpimlico\b/i, /\btriple\s+crown\b/i,
];

const GENERAL_SPORTS_TERMS = [
  /\binjur(y|ies|ed)\b/i, /\bsuspend(ed)?\b/i, /\btrade(d)?\b/i, /\bsigned\b/i,
  /\bcoach\b/i, /\broster\b/i, /\bplayoff\b/i, /\bscored?\b/i, /\bwins?\b/i,
  /\bloses?\b/i, /\bdefeats?\b/i, /\bbeat\b/i, /\bgame\b/i, /\bmatch\b/i,
  /\bseason\b/i, /\bteam\b/i, /\bplayer\b/i, /\bchampionship\b/i, /\bleague\b/i,
  /\bdraft\b/i, /\bcontract\b/i, /\bfree\s+agent\b/i, /\blineup\b/i, /\bstarting\b/i,
];

function isRelevantHorseRacing(title: string, trackName: string): boolean {
  const titleLower = title.toLowerCase();
  const trackLower = trackName.toLowerCase();
  // Accept if it mentions the track by name OR uses any horse-racing term
  if (titleLower.includes(trackLower)) return true;
  return HORSE_RACING_TERMS.some((p) => p.test(title));
}

function isRelevantSport(title: string, homeTeam: string, awayTeam: string, sportTitle: string): boolean {
  const titleLower = title.toLowerCase();
  const sportLower = sportTitle.toLowerCase();
  // Accept if it explicitly names a team, the sport, or a common sports action
  if (titleLower.includes(homeTeam.toLowerCase())) return true;
  if (titleLower.includes(awayTeam.toLowerCase())) return true;
  if (sportLower && titleLower.includes(sportLower)) return true;
  return GENERAL_SPORTS_TERMS.some((p) => p.test(title));
}

// ─── HTML helpers ───────────────────────────────────────────────────────────
function stripHtml(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractDescriptionText(raw: string): string {
  const step1 = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  const decoded = decodeEntities(step1).trim();
  if (decoded.startsWith("<")) return "";
  const plain = decoded.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
  if (plain.length < 15) return "";
  return plain.slice(0, 200);
}

// ─── RSS parsing ─────────────────────────────────────────────────────────────
function parseRssItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const descMatch  = block.match(/<description>([\s\S]*?)<\/description>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const sourceMatch  = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);

    const title       = stripHtml(titleMatch?.[1] ?? "").trim();
    const description = extractDescriptionText(descMatch?.[1] ?? "");
    const pubDate     = pubDateMatch?.[1]?.trim() ?? "";
    const source      = sourceMatch?.[1]?.trim() ?? "Google News";

    if (title) items.push({ title, description, pubDate, source });
  }

  return items;
}

// Realistic browser User-Agent — cloud IPs are frequently blocked without one
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ─── Public fetch helpers ─────────────────────────────────────────────────────
export async function fetchNews(query: string, maxResults = 5): Promise<NewsItem[]> {
  const encodedQuery = encodeURIComponent(query);

  // Try multiple sources in order — if one is blocked in the production
  // environment, the next one picks up
  const sources = [
    `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`,
    `https://www.bing.com/news/search?q=${encodedQuery}&format=rss&setmkt=en-US`,
    `https://feeds.bbci.co.uk/sport/rss.xml`, // BBC Sports (unfiltered fallback)
  ];

  const headers = {
    "User-Agent": UA,
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  for (const url of sources) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.error(`[news] ${new URL(url).hostname} returned HTTP ${res.status} for query "${query}"`);
        continue;
      }
      const xml = await res.text();
      const items = parseRssItems(xml).slice(0, maxResults * 3);
      if (items.length > 0) return items;
      console.error(`[news] ${new URL(url).hostname} returned 0 items for query "${query}" — trying next source`);
    } catch (err) {
      console.error(`[news] fetch failed for ${url}: ${(err as Error).message}`);
    }
  }

  return [];
}

function dedup(items: NewsItem[]): NewsItem[] {
  return items.filter((item, idx, arr) =>
    arr.findIndex((o) => o.title === item.title) === idx
  );
}

export async function fetchTeamNews(homeTeam: string, awayTeam: string, sportTitle: string): Promise<string> {
  const [homeNews, awayNews] = await Promise.all([
    fetchNews(`${homeTeam} ${sportTitle}`, 4),
    fetchNews(`${awayTeam} ${sportTitle}`, 4),
  ]);

  const filtered = dedup([...homeNews, ...awayNews])
    .filter((n) => !isNoise(n.title))
    .filter((n) => isRelevantSport(n.title, homeTeam, awayTeam, sportTitle))
    .slice(0, 6);

  if (filtered.length === 0) return "";

  const lines = filtered
    .map((n) => {
      const dateStr = n.pubDate ? ` (${n.pubDate.slice(0, 16)})` : "";
      return `  • ${n.title}${dateStr}${n.description ? `\n    ${n.description}` : ""}`;
    })
    .join("\n");

  return `RECENT SPORTS NEWS (use to inform your prediction — injuries, form, lineup changes, etc.):\n${lines}`;
}

export async function fetchRaceNewsItems(trackName: string, horseNames: string[]): Promise<NewsItem[]> {
  const [trackNews, ...horseNewsArr] = await Promise.all([
    fetchNews(`${trackName} horse racing`, 5),
    ...horseNames.slice(0, 3).map((name) => fetchNews(`${name} horse racing`, 3)),
  ]);

  return dedup([...trackNews, ...horseNewsArr.flat()])
    .filter((n) => !isNoise(n.title))
    .filter((n) => isRelevantHorseRacing(n.title, trackName))
    .slice(0, 10);
}

export async function fetchTeamNewsItems(homeTeam: string, awayTeam: string, sportTitle: string): Promise<NewsItem[]> {
  const [homeNews, awayNews] = await Promise.all([
    fetchNews(`${homeTeam} ${sportTitle}`, 4),
    fetchNews(`${awayTeam} ${sportTitle}`, 4),
  ]);

  return dedup([...homeNews, ...awayNews])
    .filter((n) => !isNoise(n.title))
    .filter((n) => isRelevantSport(n.title, homeTeam, awayTeam, sportTitle))
    .slice(0, 8);
}

export async function fetchHorseRacingNews(trackName: string, horseNames: string[]): Promise<string> {
  const [trackNews, ...horseNewsArr] = await Promise.all([
    fetchNews(`${trackName} horse racing`, 5),
    ...horseNames.slice(0, 3).map((name) => fetchNews(`${name} horse racing`, 3)),
  ]);

  const filtered = dedup([...trackNews, ...horseNewsArr.flat()])
    .filter((n) => !isNoise(n.title))
    .filter((n) => isRelevantHorseRacing(n.title, trackName))
    .slice(0, 6);

  if (filtered.length === 0) return "";

  const lines = filtered
    .map((n) => {
      const dateStr = n.pubDate ? ` (${n.pubDate.slice(0, 16)})` : "";
      return `  • ${n.title}${dateStr}${n.description ? `\n    ${n.description}` : ""}`;
    })
    .join("\n");

  return `RECENT HORSE RACING NEWS (use to inform your prediction — track conditions, horse form, late scratches, etc.):\n${lines}`;
}
