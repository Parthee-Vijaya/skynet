/**
 * Helpers til de tools der ikke har en eksisterende collector.
 *
 * Gratis uden nøgle:
 *   - forecast (Open-Meteo)
 *   - lookup_address (DAWA)
 *   - wikipedia_summary
 *   - search_recipes (TheMealDB)
 *   - lookup_company_cvr (cvrapi.dk)
 *   - crypto_price (CoinGecko)
 *   - find_book (Open Library)
 *   - find_stock_price (Yahoo Finance)
 *   - find_tv_show (TVMaze)
 *   - public_holidays_dk (Nager.Date)
 *   - currency_convert (Frankfurter)
 *   - time_in_city (Intl.DateTimeFormat)
 *
 * Kræver API-nøgle (settings):
 *   - dmi_warnings (DMI Open Data — dmi_api_key)
 *   - find_movie_info (TMDB — tmdb_api_key)
 */

import { getLocation, getSetting } from "@/lib/settings";

// ── Open-Meteo forecast (7 dage) ─────────────────────────────────────────────

export interface ForecastDay {
  date: string;          // YYYY-MM-DD
  weatherCode: number;   // WMO code
  description: string;   // Dansk beskrivelse
  tempMaxC: number;
  tempMinC: number;
  precipitationMm: number;
  precipitationProbabilityMaxPct: number | null;
  windMaxKmh: number;
  windGustsMaxKmh: number | null;
  uvIndexMax: number | null;
  sunrise: string;
  sunset: string;
}

export interface ForecastResponse {
  location: { lat: number; lng: number; label: string };
  days: ForecastDay[];
}

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Klart",
  1: "Mest klart",
  2: "Delvis skyet",
  3: "Overskyet",
  45: "Tåge",
  48: "Rimtåge",
  51: "Let støvregn",
  53: "Støvregn",
  55: "Kraftig støvregn",
  56: "Let isslag",
  57: "Isslag",
  61: "Let regn",
  63: "Regn",
  65: "Kraftig regn",
  66: "Let frysende regn",
  67: "Frysende regn",
  71: "Let snefald",
  73: "Snefald",
  75: "Kraftigt snefald",
  77: "Sneslud",
  80: "Lette regnbyger",
  81: "Regnbyger",
  82: "Voldsomme regnbyger",
  85: "Lette snebyger",
  86: "Snebyger",
  95: "Tordenvejr",
  96: "Tordenvejr m. let hagl",
  99: "Tordenvejr m. kraftig hagl",
};

export function describeWeatherCode(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? `Vejrkode ${code}`;
}

export async function getForecast(daysRequested = 7): Promise<ForecastResponse> {
  const loc = getLocation();
  const days = Math.max(1, Math.min(7, Math.round(daysRequested)));
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,` +
    `precipitation_sum,precipitation_probability_max,wind_speed_10m_max,` +
    `wind_gusts_10m_max,uv_index_max,sunrise,sunset` +
    `&timezone=auto&forecast_days=${days}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = (await res.json()) as {
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      precipitation_probability_max: (number | null)[];
      wind_speed_10m_max: number[];
      wind_gusts_10m_max: (number | null)[];
      uv_index_max: (number | null)[];
      sunrise: string[];
      sunset: string[];
    };
  };
  const out: ForecastDay[] = data.daily.time.map((d, i) => ({
    date: d,
    weatherCode: data.daily.weather_code[i],
    description: describeWeatherCode(data.daily.weather_code[i]),
    tempMaxC: Math.round(data.daily.temperature_2m_max[i] * 10) / 10,
    tempMinC: Math.round(data.daily.temperature_2m_min[i] * 10) / 10,
    precipitationMm: Math.round(data.daily.precipitation_sum[i] * 10) / 10,
    precipitationProbabilityMaxPct: data.daily.precipitation_probability_max[i],
    windMaxKmh: Math.round(data.daily.wind_speed_10m_max[i]),
    windGustsMaxKmh: data.daily.wind_gusts_10m_max[i] != null
      ? Math.round(data.daily.wind_gusts_10m_max[i]!)
      : null,
    uvIndexMax: data.daily.uv_index_max[i],
    sunrise: data.daily.sunrise[i],
    sunset: data.daily.sunset[i],
  }));
  return { location: loc, days: out };
}

// ── DAWA — Danmarks Adressers Web API ────────────────────────────────────────

export interface AddressMatch {
  display: string;        // "Vesterbrogade 1, 1620 København V"
  street: string;
  houseNumber: string;
  postcode: string;
  city: string;
  municipality: string;
  region: string;
  lat: number;
  lon: number;
}

interface DawaAdgangsadresse {
  betegnelse?: string;
  vejstykke?: { navn?: string };
  husnr?: string;
  postnummer?: { nr?: string; navn?: string };
  kommune?: { navn?: string };
  region?: { navn?: string };
  adgangspunkt?: { koordinater?: [number, number] };
}

interface DawaResult {
  tekst?: string;
  adresse?: DawaAdgangsadresse & { adgangsadresse?: DawaAdgangsadresse };
}

export async function lookupAddress(query: string, limit = 5): Promise<AddressMatch[]> {
  // DAWA autocomplete returnerer fuzzy matches
  const url = `https://api.dataforsyningen.dk/adresser/autocomplete?q=${encodeURIComponent(query)}&per_side=${limit}&type=adresse`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`DAWA HTTP ${res.status}`);
  const data = (await res.json()) as DawaResult[];
  return data.flatMap((r): AddressMatch[] => {
    const adr = r.adresse?.adgangsadresse ?? r.adresse;
    if (!adr) return [];
    const coords = adr.adgangspunkt?.koordinater;
    return [{
      display: r.tekst ?? adr.betegnelse ?? "",
      street: adr.vejstykke?.navn ?? "",
      houseNumber: adr.husnr ?? "",
      postcode: adr.postnummer?.nr ?? "",
      city: adr.postnummer?.navn ?? "",
      municipality: adr.kommune?.navn ?? "",
      region: adr.region?.navn ?? "",
      lon: coords?.[0] ?? 0,
      lat: coords?.[1] ?? 0,
    }];
  });
}

// ── Wikipedia REST API ───────────────────────────────────────────────────────

export interface WikiSummary {
  title: string;
  description?: string;
  extract: string;        // Første afsnit
  url: string;
  thumbnailUrl?: string;
  lang: string;
}

export async function wikipediaSummary(title: string, lang = "da"): Promise<WikiSummary> {
  const tryFetch = async (l: string): Promise<WikiSummary | null> => {
    const url = `https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Skynet/1.0 (personal assistant)", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
    const d = (await res.json()) as {
      type?: string;
      title?: string;
      description?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
      thumbnail?: { source?: string };
    };
    if (d.type === "disambiguation") return null;
    return {
      title: d.title ?? title,
      description: d.description,
      extract: (d.extract ?? "").slice(0, 800),
      url: d.content_urls?.desktop?.page ?? `https://${l}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      thumbnailUrl: d.thumbnail?.source,
      lang: l,
    };
  };

  // Først forsøge ønsket sprog, derefter en på engelsk
  const primary = await tryFetch(lang);
  if (primary) return primary;
  if (lang !== "en") {
    const fallback = await tryFetch("en");
    if (fallback) return fallback;
  }
  throw new Error(`ingen Wikipedia-side fundet for "${title}"`);
}

// ── DMI varsler via MeteoAlarm (gratis, ingen key) ───────────────────────────
//
// MeteoAlarm.org aggregerer EU-vejrvarsler inkl. DMI's danske varsler i et
// fælles CAP-formateret atom-feed. Ingen registrering, ingen key.

export interface WeatherWarning {
  event: string;            // "Storm", "Glat vej", osv
  severity: string;         // "Minor", "Moderate", "Severe", "Extreme"
  level: string;            // farve-niveau "yellow"/"orange"/"red"
  area: string;
  effective: string;        // ISO start
  expires: string;          // ISO slut
  headline: string;
  description: string;
  url?: string;
}

export async function getWeatherWarnings(): Promise<WeatherWarning[]> {
  const url = "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-denmark";
  const res = await fetch(url, {
    headers: { "User-Agent": "Skynet/1.0 (personal assistant)", Accept: "application/atom+xml,application/xml" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`MeteoAlarm HTTP ${res.status}`);
  const xml = await res.text();
  return parseMeteoalarmAtom(xml);
}

/** Simpel regex-parser til MeteoAlarm atom + indlejret CAP-1.2 */
function parseMeteoalarmAtom(xml: string): WeatherWarning[] {
  const out: WeatherWarning[] = [];
  const entryRe = /<entry[\s\S]*?<\/entry>/g;
  const matches = xml.match(entryRe) ?? [];
  for (const e of matches) {
    const title = pick(e, "title");
    const summary = pick(e, "summary");
    const link = pickAttr(e, "link", "href");
    // CAP-info kan være indlejret som cap:info eller bare som tekst i summary
    const event = pickNs(e, "cap", "event") ?? title;
    const severity = pickNs(e, "cap", "severity") ?? "Unknown";
    const effective = pickNs(e, "cap", "effective") ?? pick(e, "updated") ?? "";
    const expires = pickNs(e, "cap", "expires") ?? "";
    const area = pickNs(e, "cap", "areaDesc") ?? "";
    const description = pickNs(e, "cap", "description") ?? summary;
    const level = pickAwarenessLevel(e);
    out.push({
      event: stripCdata(event),
      severity: stripCdata(severity),
      level,
      area: stripCdata(area),
      effective,
      expires,
      headline: stripCdata(title),
      description: stripCdata(description).slice(0, 600),
      url: link,
    });
  }
  return out;
}

function pick(s: string, tag: string): string {
  const m = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m?.[1]?.trim() ?? "";
}
function pickNs(s: string, ns: string, tag: string): string {
  const m = s.match(new RegExp(`<${ns}:${tag}[^>]*>([\\s\\S]*?)<\\/${ns}:${tag}>`));
  return m?.[1]?.trim() ?? "";
}
function pickAttr(s: string, tag: string, attr: string): string {
  const m = s.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`));
  return m?.[1] ?? "";
}
function pickAwarenessLevel(s: string): string {
  // MeteoAlarm bruger awareness_level 1..4 → green/yellow/orange/red
  const m = s.match(/awareness_level[^"]*"[^"]*?>(\d)/i)
    || s.match(/<cap:parameter[\s\S]*?awareness_level[\s\S]*?<value[^>]*>(\d)/i);
  const code = m?.[1];
  if (code === "2") return "yellow";
  if (code === "3") return "orange";
  if (code === "4") return "red";
  return "green";
}
function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

// ── TheMealDB (opskrifter, gratis ingen key) ─────────────────────────────────

export interface MealRecipe {
  id: string;
  name: string;
  category?: string;
  area?: string;
  instructions: string;
  ingredients: Array<{ ingredient: string; measure: string }>;
  thumbUrl?: string;
  sourceUrl?: string;
  youtubeUrl?: string;
}

interface RawMeal {
  idMeal?: string;
  strMeal?: string;
  strCategory?: string;
  strArea?: string;
  strInstructions?: string;
  strMealThumb?: string;
  strSource?: string;
  strYoutube?: string;
  [k: string]: string | null | undefined;
}

function rawMealToRecipe(m: RawMeal): MealRecipe {
  const ingredients: Array<{ ingredient: string; measure: string }> = [];
  for (let i = 1; i <= 20; i++) {
    const ing = m[`strIngredient${i}`]?.toString().trim();
    const meas = m[`strMeasure${i}`]?.toString().trim();
    if (ing) ingredients.push({ ingredient: ing, measure: meas ?? "" });
  }
  return {
    id: m.idMeal ?? "",
    name: m.strMeal ?? "",
    category: m.strCategory ?? undefined,
    area: m.strArea ?? undefined,
    instructions: (m.strInstructions ?? "").slice(0, 1500),
    ingredients,
    thumbUrl: m.strMealThumb ?? undefined,
    sourceUrl: m.strSource ?? undefined,
    youtubeUrl: m.strYoutube ?? undefined,
  };
}

export async function searchRecipes(query: string, limit = 5): Promise<MealRecipe[]> {
  // Tom query → returnér tilfældig opskrift
  const url = query.trim()
    ? `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`
    : `https://www.themealdb.com/api/json/v1/1/random.php`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`TheMealDB HTTP ${res.status}`);
  const data = (await res.json()) as { meals?: RawMeal[] | null };
  return (data.meals ?? []).slice(0, limit).map(rawMealToRecipe);
}

// ── Reddit (gratis ingen key, public JSON) ───────────────────────────────────

export interface RedditPost {
  title: string;
  subreddit: string;
  author: string;
  score: number;
  numComments: number;
  url: string;             // ekstern URL hvis link-post, ellers permalink
  permalink: string;       // reddit.com/r/.../comments/.../
  createdAt: string;       // ISO
  selftext?: string;
}

interface RedditChild {
  data?: {
    title?: string;
    subreddit?: string;
    author?: string;
    score?: number;
    num_comments?: number;
    url?: string;
    permalink?: string;
    created_utc?: number;
    selftext?: string;
    is_self?: boolean;
  };
}

export async function redditSearch(opts: {
  subreddit?: string;
  query?: string;
  sort?: "hot" | "top" | "new" | "rising" | "relevance";
  time?: "hour" | "day" | "week" | "month" | "year" | "all";
  limit?: number;
}): Promise<RedditPost[]> {
  const limit = Math.min(25, Math.max(1, opts.limit ?? 10));
  const sort = opts.sort ?? (opts.subreddit && !opts.query ? "top" : "relevance");
  const time = opts.time ?? "day";
  let url: string;
  if (opts.subreddit && !opts.query) {
    // Top/hot/new fra et subreddit
    const sortPath = ["hot", "new", "rising", "top"].includes(sort) ? sort : "top";
    url = `https://www.reddit.com/r/${encodeURIComponent(opts.subreddit)}/${sortPath}.json?limit=${limit}${sortPath === "top" ? `&t=${time}` : ""}`;
  } else if (opts.query) {
    // Søg
    const params = new URLSearchParams({
      q: opts.query,
      limit: String(limit),
      sort,
      t: time,
    });
    if (opts.subreddit) params.set("restrict_sr", "on");
    url = opts.subreddit
      ? `https://www.reddit.com/r/${encodeURIComponent(opts.subreddit)}/search.json?${params}`
      : `https://www.reddit.com/search.json?${params}`;
  } else {
    throw new Error("subreddit eller query påkrævet");
  }
  const res = await fetch(url, {
    headers: { "User-Agent": "Skynet/1.0 (personal assistant)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
  const data = (await res.json()) as { data?: { children?: RedditChild[] } };
  return (data.data?.children ?? []).flatMap((c): RedditPost[] => {
    const d = c.data;
    if (!d?.title) return [];
    return [{
      title: d.title,
      subreddit: d.subreddit ?? "",
      author: d.author ?? "",
      score: d.score ?? 0,
      numComments: d.num_comments ?? 0,
      url: d.is_self ? `https://www.reddit.com${d.permalink ?? ""}` : (d.url ?? ""),
      permalink: `https://www.reddit.com${d.permalink ?? ""}`,
      createdAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : "",
      selftext: d.selftext ? d.selftext.slice(0, 300) : undefined,
    }];
  });
}

// ── Aggregeret nyhedstool: DR + Politiken + verdens-feeds ────────────────────

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  date: string;
  summary: string;
}

const FEEDS_DK: Array<{ source: string; url: string }> = [
  { source: "DR", url: "https://www.dr.dk/nyheder/service/feeds/allenyheder" },
  { source: "Politiken", url: "https://politiken.dk/rss/senestenyt.rss" },
  { source: "TV2", url: "https://feeds.tv2.dk/nyheder" },
  { source: "Berlingske", url: "https://www.berlingske.dk/content/feed?feed_type=rss2" },
];

const FEEDS_WORLD: Array<{ source: string; url: string }> = [
  { source: "BBC World", url: "http://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "Reuters World", url: "https://feeds.reuters.com/Reuters/worldNews" },
  { source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { source: "Guardian World", url: "https://www.theguardian.com/world/rss" },
];

async function fetchFeed(source: string, url: string, limit: number): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Skynet/1.0", Accept: "application/rss+xml,application/xml" },
      signal: AbortSignal.timeout(8_000),
      redirect: "follow",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: NewsItem[] = [];
    const itemRe = /<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/g;
    const matches = xml.match(itemRe) ?? [];
    for (const block of matches) {
      if (items.length >= limit) break;
      const title = stripHtml(picksFlex(block, "title"));
      const link = pickAttr(block, "link", "href") || picksFlex(block, "link").trim();
      const date = picksFlex(block, "pubDate") || picksFlex(block, "published") || picksFlex(block, "updated");
      const desc = stripHtml(picksFlex(block, "description") || picksFlex(block, "summary") || picksFlex(block, "content"));
      if (title) items.push({ title, source, url: link, date, summary: desc.slice(0, 200) });
    }
    return items;
  } catch {
    return [];
  }
}

function picksFlex(b: string, tag: string): string {
  const cdata = b.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"));
  if (cdata) return cdata[1].trim();
  const plain = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return plain?.[1]?.trim() ?? "";
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function getNews(opts: {
  scope?: "dk" | "world" | "both";
  limitPerSource?: number;
}): Promise<{ scope: string; items: NewsItem[] }> {
  const scope = opts.scope ?? "both";
  const perSource = opts.limitPerSource ?? 3;
  const feeds = scope === "dk" ? FEEDS_DK
    : scope === "world" ? FEEDS_WORLD
    : [...FEEDS_DK.slice(0, 2), ...FEEDS_WORLD.slice(0, 2)];
  const all = await Promise.all(feeds.map((f) => fetchFeed(f.source, f.url, perSource)));
  // Flet og sortér efter dato (nyeste først hvor muligt)
  const merged = all.flat();
  merged.sort((a, b) => {
    const ta = Date.parse(a.date);
    const tb = Date.parse(b.date);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
    return 0;
  });
  return { scope, items: merged.slice(0, 20) };
}

