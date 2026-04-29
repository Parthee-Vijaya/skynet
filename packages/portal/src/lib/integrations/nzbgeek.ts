/**
 * NZBgeek API-integration.
 *
 * Två endpoints:
 *   - https://api.nzbgeek.info/rss?t=trending_movies&r=KEY  → trending movies (kun denne trending-type virker)
 *   - https://api.nzbgeek.info/api?t=search|tvsearch|movie&q=&apikey=KEY → Newznab-kompatibel søgning
 *
 * Begge returnerer RSS/XML i Newznab-format.
 */

import { getNzbgeekApiKey } from "@/lib/settings";

export class NzbgeekError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "NzbgeekError";
  }
}

export type NzbgeekMode = "trending" | "search" | "tv" | "movie";

export interface NzbItem {
  title: string;
  pubDate: string;
  link?: string;
  /** Detail-side på nzbgeek.info, hvis det er en trending-feed */
  detailUrl?: string;
  /** IMDB ID (kun trending_movies) */
  imdbId?: string;
  /** TVDB ID (kun trending_tv hvis det fandtes) */
  tvdbId?: string;
  coverUrl?: string;
  /** Størrelse i bytes (kun /api/search-resultater) */
  sizeBytes?: number;
  category?: string;
  description?: string;
}

export interface NzbResult {
  mode: NzbgeekMode;
  total: number;
  items: NzbItem[];
}

export async function searchNzbgeek(opts: {
  query?: string;
  mode?: NzbgeekMode;
  limit?: number;
}): Promise<NzbResult> {
  const apiKey = getNzbgeekApiKey();
  if (!apiKey) {
    throw new NzbgeekError(
      "NZBgeek API-nøgle ikke konfigureret. Indsæt din 'r'-værdi fra api.nzbgeek.info i Skynets /automations → setup",
      "NOT_CONFIGURED",
    );
  }
  const limit = Math.max(1, Math.min(100, Math.round(opts.limit ?? 20)));
  // Default-mode: trending hvis ingen query, ellers fri søgning
  const mode: NzbgeekMode = opts.mode ?? (opts.query ? "search" : "trending");
  let url: string;
  if (mode === "trending") {
    url = `https://api.nzbgeek.info/rss?t=trending_movies&limit=${limit}&r=${encodeURIComponent(apiKey)}`;
  } else {
    const t = mode === "tv" ? "tvsearch" : mode === "movie" ? "movie" : "search";
    const params = new URLSearchParams({
      t,
      apikey: apiKey,
      limit: String(limit),
    });
    if (opts.query) params.set("q", opts.query);
    url = `https://api.nzbgeek.info/api?${params.toString()}`;
  }

  const res = await fetch(url, {
    headers: { "User-Agent": "Skynet/1.0", Accept: "application/rss+xml,application/xml" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new NzbgeekError("NZBgeek afviste API-nøglen — tjek den i settings", "API_AUTH");
  }
  if (!res.ok) throw new NzbgeekError(`NZBgeek HTTP ${res.status}`, "HTTP_ERROR");
  const xml = await res.text();

  // Newznab-fejl er XML <error code="..." description="..."/>
  const errMatch = xml.match(/<error\s+code="(\d+)"\s+description="([^"]+)"\s*\/>/);
  if (errMatch) {
    throw new NzbgeekError(`NZBgeek fejl: ${errMatch[2]} (code ${errMatch[1]})`, errMatch[1]);
  }

  const totalMatch = xml.match(/<newznab:response[^>]*total="(\d+)"/);
  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  const items: NzbItem[] = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = m[1];
    items.push(parseItem(block, mode));
  }

  return { mode, total: total || items.length, items };
}

function parseItem(block: string, mode: NzbgeekMode): NzbItem {
  const title = stripCdata(pick(block, "title"));
  const pubDate = pick(block, "pubDate");
  const detailUrl = pick(block, "movie") || pick(block, "comments") || undefined;
  const imdbId = pick(block, "imdbid") || undefined;
  const tvdbId = pick(block, "tvdbid") || undefined;
  const coverUrl = pick(block, "coverurl") || undefined;
  const description = stripCdata(pick(block, "description")) || undefined;
  const category = pick(block, "category") || undefined;

  // Newznab-attr: <newznab:attr name="size" value="..."/>
  const attrs = parseAttrs(block);
  const sizeStr = attrs.size ?? attrs.SIZE;
  const sizeBytes = sizeStr ? parseInt(sizeStr, 10) : undefined;

  // Link til selve nzb-download (kun /api-resultater)
  const linkRaw = pick(block, "link");
  const link = linkRaw && linkRaw.startsWith("http") ? linkRaw : undefined;

  return {
    title,
    pubDate,
    link,
    detailUrl,
    imdbId,
    tvdbId,
    coverUrl,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : undefined,
    category: category || attrs.category,
    description: description?.slice(0, 400),
    // unused 'mode' parameter — kept for future per-mode-specific parsing
    ..._unused(mode),
  };
}

function _unused(_: NzbgeekMode): Record<string, never> { return {}; }

function pick(s: string, tag: string): string {
  const m = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m?.[1]?.trim() ?? "";
}

function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function parseAttrs(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<newznab:attr\s+name="([^"]+)"\s+value="([^"]+)"\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}
