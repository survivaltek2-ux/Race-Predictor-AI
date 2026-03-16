export interface NewsItem {
  title: string;
  description: string;
  pubDate: string;
  source: string;
}

// ─── Hard noise filter — always discard ────────────────────────────────────
const NOISE_PATTERNS: RegExp[] = [
  // Obituaries & death notices
  /\b\d{2,3},\s+of\s+\w/i,
  /\bdies?\b.*\bat\s+\d{2}/i,
  /\bpassed away\b/i,
  /\bobituary\b/i,
  /\bmemorial\s+service\b/i,
  /\bfuneral\b/i,
  /\bin\s+loving\s+memory\b/i,
  // Casino / gambling ads
  /\bjackpot\s+record/i,
  /\bslot\s+machine/i,
  /\bcasino['']s?\s+jackpot/i,
  /\blucky\s+players?\s+break/i,
  // Non-sports industrial / municipal
  /\bindustrial\s+business\s+park\b/i,
  /\bstate\s+funds?\s+for\b/i,
  /\breceives?\s+\$\d+[MBK]\b/i,
  // Motocross / unrelated motorsport
  /\bsupermotocross\b/i,
  // Real-estate / cooking / lifestyle
  /\brecipe\b/i,
  /\breal\s+estate\b/i,
  // Opinion / fluff / evergreen content that has zero predictive value
  /\bpower\s+rankings?\b/i,
  /\bfantasy\s+(football|baseball|basketball|hockey|picks|rankings|advice)\b/i,
  /\bmock\s+draft\b/i,
  /\bbest\s+bets\b/i,
  /\bsports\s+betting\s+odds\b/i,
  /\bprophecies\b/i,
  /\blegacy\b.*\ball[-\s]time\b/i,
  /\bgreatest\s+(of\s+all\s+time|ever)\b/i,
  /\bthrowback\b/i,
  /\bon\s+this\s+day\b/i,
  /\b(funniest|weirdest|craziest)\s+moments?\b/i,
  /\bhighlights?\s+of\s+the\s+(week|month|year)\b/i,
  /\bwatch:\s/i,
  /\bgallery:/i,
];

// ─── Low-signal patterns — deprioritise but don't discard outright ──────────
// Items matching these get a score penalty. They may still appear if we don't
// have enough high-signal content to fill the quota.
const LOW_SIGNAL_PATTERNS: RegExp[] = [
  /\bpreview\b/i,
  /\boutlook\b/i,
  /\bprediction\b/i,
  /\bforecast\b/i,
  /\banalysis\b/i,
  /\bbreakdown\b/i,
  /\bhow\s+to\s+watch\b/i,
  /\bwhere\s+to\s+watch\b/i,
  /\bschedule\b/i,
  /\btickets?\b/i,
  /\brecap\b/i,
  /\bhighlights?\b/i,
  /\b(season|year|career)\s+review\b/i,
  /\bhistory\s+between\b/i,
  /\bstats\s+and\s+trends?\b/i,
  /\bpick(s)?\s+and\s+predictions?\b/i,
  /\bbest\s+(player|team)\s+in\b/i,
  /\branking\b/i,
  /\btop\s+\d+\b/i,
  /\bwho\s+is\s+the\s+best\b/i,
];

// ─── High-signal facts — these bubble to the top ────────────────────────────
// Sports: injury / availability / roster / lineup moves
const SPORTS_HIGH_SIGNAL: RegExp[] = [
  // Injury & availability
  /\binjur(y|ies|ed)\b/i,
  /\bruled?\s+out\b/i,
  /\bout\s+for\s+(the\s+)?(game|season|week|month)\b/i,
  /\bout\s+indefinitely\b/i,
  /\bmissed?\s+(practice|training|session|start)\b/i,
  /\bdid\s+not\s+practice\b/i,
  /\blimited\s+practice\b/i,
  /\bday[-\s]to[-\s]day\b/i,
  /\bquestionable\b/i,
  /\bdoubtful\b/i,
  /\bon\s+(the\s+)?(injured\s+reserve|IL|DL)\b/i,
  /\bactivated\s+from\b/i,
  /\bconcussion\s+protocol\b/i,
  /\btorn\s+(acl|mcl|achilles|meniscus|hamstring)\b/i,
  /\bfracture[d]?\b/i,
  /\bsprain(ed)?\b/i,
  /\bstrain(ed)?\b/i,
  /\bsurgery\b/i,
  /\bunder\s+the\s+weather\b/i,
  /\breturn(s|ing|ed)?\s+from\s+injury\b/i,
  /\bhealth\s+(update|status)\b/i,
  // Suspensions & discipline
  /\bsuspend(ed|sion)\b/i,
  /\bbanned\b/i,
  /\bdisqualified\b/i,
  /\bejected\b/i,
  /\bfined\s+\$?\d+/i,
  /\bdisciplinar(y|ily)\b/i,
  // Roster / lineup moves
  /\btrade[d]?\b/i,
  /\bacquire[d]?\b/i,
  /\btransfer[r]?ed?\b/i,
  /\breleased?\b/i,
  /\bwaived?\b/i,
  /\bdesignated\s+for\s+assignment\b/i,
  /\bsign(s|ed|ing)\b/i,
  /\bfree\s+agent\b/i,
  /\bbenched?\b/i,
  /\bwill\s+start\b/i,
  /\bstarting\s+(lineup|rotation|pitcher|quarterback|goalie)\b/i,
  /\bscratch(ed)?\s+(from|before)\b/i,
  /\blate\s+scratch\b/i,
  /\blineup\s+change\b/i,
  /\broster\s+(move|update|change)\b/i,
  /\bcall[s]?\s+up\b/i,
  /\bpromot(ed|ion)\b/i,
  // Coaching changes
  /\bfired\b/i,
  /\bcoaching\s+change\b/i,
  /\bnew\s+(head\s+)?coach\b/i,
  /\binterim\s+coach\b/i,
];

// Horse racing: high-signal facts specific to the sport
const HORSE_RACING_HIGH_SIGNAL: RegExp[] = [
  /\bscratch(ed)?\b/i,
  /\blate\s+scratch\b/i,
  /\bjockey\s+(change|swap|replac|named|booked|rides?)\b/i,
  /\b(replac|swap)(ed|ing)?\s+(jockey|rider)\b/i,
  /\btrainer\s+(change|swap|suspens|fine|banned)\b/i,
  /\bequipment\s+change\b/i,
  /\bblinkers\s+(on|off|added|removed)\b/i,
  /\b(vet|veterinary)\s+scratch\b/i,
  /\blame\b/i,
  /\binjur(y|ed)\b/i,
  /\bmorning[-\s]line\s+(odd|favor|change)\b/i,
  /\bpost\s+position\b/i,
  /\bbullet\s+workout\b/i,
  /\bworkout\s+(time|bullet|blowout)\b/i,
  /\bsloppy\s+track\b/i,
  /\bmuddy\s+track\b/i,
  /\btrack\s+(condition|surface|fast|sloppy|muddy|good|firm)\b/i,
  /\bwithdraw[sn]?\b/i,
  /\bwon'?t\s+(run|race|start)\b/i,
  /\bpulled\s+(from|out)\b/i,
  /\bbypasses?\b/i,
  /\bskips?\s+(the\s+)?(race|start)\b/i,
];

// Horse racing relevance — must contain at least one of these to be included at all
const HORSE_RACING_RELEVANT: RegExp[] = [
  /\bhorse\s+rac/i,
  /\brac(e|ing|etrack)\b/i,
  /\bjockey\b/i,
  /\btrainer\b/i,
  /\bderby\b/i,
  /\bstakes\b/i,
  /\bpurse\b/i,
  /\bhandicap\b/i,
  /\bthoroughbred\b/i,
  /\bturf\b/i,
  /\bfurlongs?\b/i,
  /\bscratch(ed)?\b/i,
  /\bmorn(ing)?\s+line\b/i,
  /\bpost\s+time\b/i,
  /\bchurchill\s+downs\b/i,
  /\bbelmont\b/i,
  /\bsaratoga\b/i,
  /\bkeeneland\b/i,
  /\baqueduct\b/i,
  /\bpimlico\b/i,
  /\btriple\s+crown\b/i,
  /\bclaimsing\b/i,
  /\bworkout\b/i,
  /\bequine\b/i,
  /\bcolt\b/i,
  /\bfilly\b/i,
  /\bmare\b/i,
  /\bgelding\b/i,
  /\bstallion\b/i,
];

function isNoise(title: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(title));
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
// Returns 0–10. Items are sorted descending before slicing so the most
// fact-rich, actionable results always appear first.
function scoreSportsItem(title: string, homeTeam: string, awayTeam: string, sportTitle: string): number {
  const t = title;
  let score = 0;

  // Must mention a team or the sport to score at all
  const tl = t.toLowerCase();
  const mentionsTeam = tl.includes(homeTeam.toLowerCase()) || tl.includes(awayTeam.toLowerCase());
  const mentionsSport = sportTitle && tl.includes(sportTitle.toLowerCase());
  if (!mentionsTeam && !mentionsSport) return 0;

  // Low-signal penalty (applied before high-signal boost so a headline can still
  // overcome the penalty if it has a strong factual signal)
  if (LOW_SIGNAL_PATTERNS.some((p) => p.test(t))) score -= 2;

  // Team name bonus — more specific = more useful
  if (mentionsTeam) score += 2;

  // High-signal boost — each matching pattern adds points
  const highMatches = SPORTS_HIGH_SIGNAL.filter((p) => p.test(t)).length;
  score += highMatches * 3;

  return score;
}

function scoreHorseRacingItem(title: string, trackName: string, horseNames: string[]): number {
  const t = title;
  let score = 0;

  // Must be racing-relevant to score at all
  if (!HORSE_RACING_RELEVANT.some((p) => p.test(t))) {
    // Track name fallback
    if (!t.toLowerCase().includes(trackName.toLowerCase())) return 0;
  }

  // Low-signal penalty
  if (LOW_SIGNAL_PATTERNS.some((p) => p.test(t))) score -= 2;

  // Track name bonus
  if (t.toLowerCase().includes(trackName.toLowerCase())) score += 2;

  // Horse name bonus — directly about a horse in this race
  if (horseNames.some((name) => t.toLowerCase().includes(name.toLowerCase()))) score += 4;

  // High-signal boost
  const highMatches = HORSE_RACING_HIGH_SIGNAL.filter((p) => p.test(t)).length;
  score += highMatches * 3;

  return score;
}

function sortAndFilter<T extends { title: string }>(items: T[], scorer: (item: T) => number, min = 0): T[] {
  return items
    .map((item) => ({ item, score: scorer(item) }))
    .filter(({ score }) => score > min)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

// Legacy wrappers kept for backward compat (used in some places)
function isRelevantHorseRacing(title: string, trackName: string): boolean {
  return scoreHorseRacingItem(title, trackName, []) > 0;
}

function isRelevantSport(title: string, homeTeam: string, awayTeam: string, sportTitle: string): boolean {
  return scoreSportsItem(title, homeTeam, awayTeam, sportTitle) > 0;
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
  // Broad team queries + a targeted injury/trade sweep
  const [homeNews, awayNews, injuryNews] = await Promise.all([
    fetchNews(`${homeTeam} ${sportTitle}`, 8),
    fetchNews(`${awayTeam} ${sportTitle}`, 8),
    fetchNews(`${homeTeam} OR ${awayTeam} injury trade suspension`, 6),
  ]);

  const scored = sortAndFilter(
    dedup([...homeNews, ...awayNews, ...injuryNews]).filter((n) => !isNoise(n.title)),
    (n) => scoreSportsItem(n.title, homeTeam, awayTeam, sportTitle),
  ).slice(0, 6);

  if (scored.length === 0) return "";

  const lines = scored
    .map((n) => {
      const dateStr = n.pubDate ? ` (${n.pubDate.slice(0, 16)})` : "";
      return `  • ${n.title}${dateStr}${n.description ? `\n    ${n.description}` : ""}`;
    })
    .join("\n");

  return `RECENT SPORTS NEWS — prioritised by fact-signal (injuries, roster moves, suspensions appear first):\n${lines}`;
}

export async function fetchRaceNewsItems(trackName: string, horseNames: string[]): Promise<NewsItem[]> {
  const [trackNews, scratchNews, ...horseNewsArr] = await Promise.all([
    fetchNews(`${trackName} horse racing`, 8),
    fetchNews(`${trackName} scratch jockey injury`, 5),
    ...horseNames.slice(0, 4).map((name) => fetchNews(`"${name}" horse racing scratch injury`, 4)),
  ]);

  return sortAndFilter(
    dedup([...trackNews, ...scratchNews, ...horseNewsArr.flat()]).filter((n) => !isNoise(n.title)),
    (n) => scoreHorseRacingItem(n.title, trackName, horseNames),
  ).slice(0, 10);
}

export async function fetchTeamNewsItems(homeTeam: string, awayTeam: string, sportTitle: string): Promise<NewsItem[]> {
  const [homeNews, awayNews, injuryNews] = await Promise.all([
    fetchNews(`${homeTeam} ${sportTitle}`, 8),
    fetchNews(`${awayTeam} ${sportTitle}`, 8),
    fetchNews(`${homeTeam} OR ${awayTeam} injury trade suspension`, 6),
  ]);

  return sortAndFilter(
    dedup([...homeNews, ...awayNews, ...injuryNews]).filter((n) => !isNoise(n.title)),
    (n) => scoreSportsItem(n.title, homeTeam, awayTeam, sportTitle),
  ).slice(0, 8);
}

export async function fetchHorseRacingNews(trackName: string, horseNames: string[]): Promise<string> {
  const [trackNews, scratchNews, ...horseNewsArr] = await Promise.all([
    fetchNews(`${trackName} horse racing`, 8),
    fetchNews(`${trackName} scratch jockey injury`, 5),
    ...horseNames.slice(0, 4).map((name) => fetchNews(`"${name}" horse racing scratch injury`, 4)),
  ]);

  const scored = sortAndFilter(
    dedup([...trackNews, ...scratchNews, ...horseNewsArr.flat()]).filter((n) => !isNoise(n.title)),
    (n) => scoreHorseRacingItem(n.title, trackName, horseNames),
  ).slice(0, 6);

  if (scored.length === 0) return "";

  const lines = scored
    .map((n) => {
      const dateStr = n.pubDate ? ` (${n.pubDate.slice(0, 16)})` : "";
      return `  • ${n.title}${dateStr}${n.description ? `\n    ${n.description}` : ""}`;
    })
    .join("\n");

  return `RECENT HORSE RACING NEWS — prioritised by fact-signal (scratches, jockey changes, injuries appear first):\n${lines}`;
}
