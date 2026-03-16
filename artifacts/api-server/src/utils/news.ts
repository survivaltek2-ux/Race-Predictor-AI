export interface NewsItem {
  title: string;
  description: string;
  pubDate: string;
  source: string;
}

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
  // Google News RSS descriptions are either CDATA-wrapped or HTML-entity-encoded.
  // After normalising, they're almost always just a list of <a> links with no prose.
  // Return empty if that's the case so the UI stays clean.
  const step1 = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  const decoded = decodeEntities(step1).trim();

  // If the decoded content starts with a tag (or is dominated by tags), skip it.
  if (decoded.startsWith("<")) return "";

  // Strip any embedded HTML and grab the first 200 chars of plain text
  const plain = decoded.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
  if (plain.length < 15) return "";

  return plain.slice(0, 200);
}

function parseRssItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);

    const rawTitle = titleMatch?.[1] ?? "";
    const rawDesc = descMatch?.[1] ?? "";

    const title = stripHtml(rawTitle).trim();
    // Google News descriptions often contain a nested <a> list — grab just the first sentence text
    const description = extractDescriptionText(rawDesc);

    const pubDate = pubDateMatch?.[1]?.trim() ?? "";
    const source = sourceMatch?.[1]?.trim() ?? "Google News";

    if (title) items.push({ title, description, pubDate, source });
  }

  return items;
}

export async function fetchNews(query: string, maxResults = 5): Promise<NewsItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SportsPredictor/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml).slice(0, maxResults);
  } catch {
    return [];
  }
}

export async function fetchTeamNews(homeTeam: string, awayTeam: string, sportTitle: string): Promise<string> {
  const [homeNews, awayNews] = await Promise.all([
    fetchNews(`${homeTeam} ${sportTitle}`, 3),
    fetchNews(`${awayTeam} ${sportTitle}`, 3),
  ]);

  const allNews = [...homeNews, ...awayNews];
  if (allNews.length === 0) return "";

  const deduped = allNews.filter((item, idx, arr) =>
    arr.findIndex((o) => o.title === item.title) === idx
  );

  const lines = deduped
    .map((n) => {
      const dateStr = n.pubDate ? ` (${n.pubDate.slice(0, 16)})` : "";
      return `  • ${n.title}${dateStr}${n.description ? `\n    ${n.description}` : ""}`;
    })
    .join("\n");

  return `RECENT SPORTS NEWS (use to inform your prediction — injuries, form, lineup changes, etc.):\n${lines}`;
}

export async function fetchHorseRacingNews(trackName: string, horseNames: string[]): Promise<string> {
  const trackQuery = `${trackName} horse racing`;
  const [trackNews, ...horseNewsArr] = await Promise.all([
    fetchNews(trackQuery, 3),
    ...horseNames.slice(0, 3).map((name) => fetchNews(`${name} horse racing`, 2)),
  ]);

  const allNews = [
    ...trackNews,
    ...horseNewsArr.flat(),
  ];

  if (allNews.length === 0) return "";

  const deduped = allNews.filter((item, idx, arr) =>
    arr.findIndex((o) => o.title === item.title) === idx
  );

  const lines = deduped
    .map((n) => {
      const dateStr = n.pubDate ? ` (${n.pubDate.slice(0, 16)})` : "";
      return `  • ${n.title}${dateStr}${n.description ? `\n    ${n.description}` : ""}`;
    })
    .join("\n");

  return `RECENT HORSE RACING NEWS (use to inform your prediction — track conditions, horse form, late scratches, etc.):\n${lines}`;
}
