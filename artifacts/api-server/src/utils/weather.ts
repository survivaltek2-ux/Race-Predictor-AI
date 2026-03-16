export interface WeatherResult {
  tempF: number;
  conditions: string;
  windMph: number;
  precipIn: number;
  humidity: number;
  description: string;
}

const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Icy fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Light rain showers",
  81: "Moderate rain showers",
  82: "Heavy rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

export async function fetchWeather(lat: number, lon: number): Promise<WeatherResult | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,precipitation,weather_code,relative_humidity_2m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const c = data.current;
    const tempF = Math.round(c.temperature_2m);
    const windMph = Math.round(c.wind_speed_10m);
    const precipIn = parseFloat((c.precipitation ?? 0).toFixed(2));
    const humidity = Math.round(c.relative_humidity_2m);
    const conditions = WMO_CODES[c.weather_code as number] ?? "Unknown";
    const description = `${conditions}, ${tempF}°F, wind ${windMph} mph, humidity ${humidity}%${precipIn > 0 ? `, precipitation ${precipIn}"` : ""}`;
    return { tempF, conditions, windMph, precipIn, humidity, description };
  } catch {
    return null;
  }
}

export const TRACK_COORDS: Record<string, [number, number]> = {
  "churchill downs": [38.2028, -85.7700],
  "belmont park": [40.7148, -73.7098],
  "pimlico": [39.3389, -76.6644],
  "santa anita": [34.1477, -117.9993],
  "santa anita park": [34.1477, -117.9993],
  "keeneland": [38.0376, -84.5841],
  "saratoga": [43.0775, -73.7835],
  "saratoga race course": [43.0775, -73.7835],
  "gulfstream park": [25.9814, -80.1381],
  "gulfstream": [25.9814, -80.1381],
  "oaklawn park": [34.5124, -93.0654],
  "oaklawn": [34.5124, -93.0654],
  "del mar": [32.9596, -117.2653],
  "monmouth park": [40.2832, -74.0223],
  "aqueduct": [40.6682, -73.8277],
  "laurel park": [39.0941, -76.8525],
  "fair grounds": [29.9820, -90.0960],
  "fair grounds race course": [29.9820, -90.0960],
  "tampa bay downs": [28.0278, -82.7143],
  "turfway park": [38.9831, -84.6280],
  "golden gate fields": [37.9078, -122.3080],
  "los alamitos": [33.8054, -117.9895],
  "penn national": [40.4234, -76.8097],
  "parx racing": [40.1101, -74.9483],
  "parx": [40.1101, -74.9483],
  "remington park": [35.5653, -97.4775],
  "lone star park": [32.9743, -97.0600],
  "hawthorne race course": [41.7236, -87.7756],
  "presque isle downs": [42.1219, -79.9850],
  "charles town races": [39.3026, -77.8686],
  "colonial downs": [37.5421, -77.2168],
  "sam houston race park": [29.9702, -95.5602],
  "woodbine": [43.7315, -79.5358],
  "meadowlands": [40.8128, -74.0742],
  "philadelphia park": [40.1101, -74.9483],
};

export function getTrackCoords(trackName: string): [number, number] | null {
  const key = trackName.toLowerCase().trim();
  for (const [k, v] of Object.entries(TRACK_COORDS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

// Only outdoor sports get weather
export const OUTDOOR_SPORT_KEYS = new Set(["americanfootball_nfl", "americanfootball_ncaaf", "baseball_mlb", "baseball_ncaa"]);

export const VENUE_COORDS: Record<string, [number, number]> = {
  // NFL
  "kansas city chiefs": [39.0489, -94.4839],
  "buffalo bills": [42.7738, -78.7869],
  "green bay packers": [44.5013, -88.0622],
  "new england patriots": [42.0909, -71.2643],
  "new york giants": [40.8128, -74.0742],
  "new york jets": [40.8128, -74.0742],
  "chicago bears": [41.8623, -87.6167],
  "cleveland browns": [41.5061, -81.6995],
  "pittsburgh steelers": [40.4468, -80.0158],
  "baltimore ravens": [39.2780, -76.6228],
  "washington commanders": [38.9076, -76.8644],
  "philadelphia eagles": [39.9008, -75.1675],
  "dallas cowboys": [32.7473, -97.0945],
  "denver broncos": [39.7439, -105.0201],
  "las vegas raiders": [36.0909, -115.1833],
  "los angeles rams": [33.9535, -118.3392],
  "los angeles chargers": [33.9535, -118.3392],
  "san francisco 49ers": [37.4033, -121.9694],
  "seattle seahawks": [47.5952, -122.3316],
  "arizona cardinals": [33.5277, -112.2626],
  "tennessee titans": [36.1665, -86.7713],
  "jacksonville jaguars": [30.3239, -81.6373],
  "miami dolphins": [25.9580, -80.2389],
  "tampa bay buccaneers": [27.9759, -82.5033],
  "carolina panthers": [35.2258, -80.8528],
  "atlanta falcons": [33.7553, -84.4006],
  "new orleans saints": [29.9511, -90.0812],
  "minnesota vikings": [44.9740, -93.2578],
  "detroit lions": [42.3400, -83.0456],
  "indianapolis colts": [39.7601, -86.1639],
  "cincinnati bengals": [39.0954, -84.5160],
  "houston texans": [29.6847, -95.4107],
  // MLB
  "new york yankees": [40.8296, -73.9262],
  "new york mets": [40.7571, -73.8458],
  "boston red sox": [42.3467, -71.0972],
  "chicago cubs": [41.9484, -87.6553],
  "chicago white sox": [41.8299, -87.6338],
  "los angeles dodgers": [34.0739, -118.2400],
  "los angeles angels": [33.8003, -117.8827],
  "san francisco giants": [37.7786, -122.3893],
  "oakland athletics": [37.7516, -122.2005],
  "seattle mariners": [47.5914, -122.3325],
  "texas rangers": [32.7512, -97.0832],
  "houston astros": [29.7573, -95.3555],
  "st. louis cardinals": [38.6226, -90.1927],
  "milwaukee brewers": [43.0280, -87.9712],
  "minnesota twins": [44.9817, -93.2776],
  "detroit tigers": [42.3390, -83.0485],
  "cleveland guardians": [41.4962, -81.6852],
  "kansas city royals": [39.0517, -94.4803],
  "colorado rockies": [39.7560, -104.9942],
  "arizona diamondbacks": [33.4453, -112.0667],
  "san diego padres": [32.7073, -117.1566],
  "miami marlins": [25.7781, -80.2197],
  "philadelphia phillies": [39.9057, -75.1665],
  "atlanta braves": [33.8908, -84.4678],
  "washington nationals": [38.8730, -77.0074],
  "toronto blue jays": [43.6414, -79.3894],
  "tampa bay rays": [27.7682, -82.6534],
  "baltimore orioles": [39.2838, -76.6217],
  "pittsburgh pirates": [40.4469, -80.0057],
  "cincinnati reds": [39.0979, -84.5082],
};

export function getVenueCoords(homeTeam: string, sportKey: string): [number, number] | null {
  if (!OUTDOOR_SPORT_KEYS.has(sportKey)) return null;
  const key = homeTeam.toLowerCase().trim();
  if (VENUE_COORDS[key]) return VENUE_COORDS[key];
  // Fuzzy match on last word of team name (e.g. "Chiefs", "Patriots")
  for (const [k, v] of Object.entries(VENUE_COORDS)) {
    const parts = k.split(" ");
    const last = parts[parts.length - 1];
    if (key.includes(last) || last.length > 4 && key.endsWith(last)) return v;
  }
  return null;
}

export function buildWeatherPromptSection(weather: WeatherResult, context: "racing" | "sports"): string {
  if (context === "racing") {
    const trackImpact = weather.precipIn > 0.1
      ? `⚠ PRECIPITATION ALERT: ${weather.precipIn}" recorded — track likely sloppy or muddy; favor horses with wet-track form`
      : weather.windMph > 20
        ? `⚠ HIGH WIND: ${weather.windMph} mph — pace horses on the front may tire; consider stalkers and closers`
        : weather.tempF < 32
          ? "⚠ FREEZING temperatures — track may be hard/frozen; extra caution on speed figures"
          : "Track conditions: normal";
    return `LIVE WEATHER AT TRACK:\n- Conditions: ${weather.description}\n- ${trackImpact}`;
  } else {
    const gameImpact = weather.precipIn > 0.1
      ? `Rain (${weather.precipIn}") expected — favors run-heavy offenses, suppresses passing yards/totals`
      : weather.windMph > 20
        ? `High wind (${weather.windMph} mph) — significantly hurts passing games and field goals; lean Under`
        : weather.tempF < 32
          ? `Freezing conditions (${weather.tempF}°F) — cold weather tightens games, favors defensive teams`
          : weather.tempF > 95
            ? `Extreme heat (${weather.tempF}°F) — fatigue factor in later innings/quarters`
            : "No significant weather factor";
    return `LIVE WEATHER AT VENUE:\n- Conditions: ${weather.description}\n- Game Impact: ${gameImpact}`;
  }
}
