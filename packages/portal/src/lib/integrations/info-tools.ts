/**
 * Helpers til de tools der ikke har en eksisterende collector:
 *   - forecast (7-dages vejr via Open-Meteo)
 *   - lookup_address (DAWA — Danmarks Adressers Web API)
 *   - wikipedia_summary (REST API)
 *
 * Alle gratis, ingen nøgle.
 */

import { getLocation } from "@/lib/settings";

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
