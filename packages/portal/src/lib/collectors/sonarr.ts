import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSetting } from "@/lib/settings";

const SONARR_CONFIG_PATHS = [
  join(homedir(), ".config", "Sonarr", "config.xml"),
  join(homedir(), "Library", "Application Support", "Sonarr", "config.xml"),
];

const DEFAULT_BASE_URL = "http://localhost:8989";

async function resolveApiKey(): Promise<string | null> {
  const setting = getSetting("sonarr_api_key");
  if (setting) return setting;
  for (const p of SONARR_CONFIG_PATHS) {
    try {
      const xml = await fs.readFile(p, "utf8");
      const m = xml.match(/<ApiKey>([a-f0-9]{16,})<\/ApiKey>/i);
      if (m) return m[1];
    } catch { /* fil findes ikke — fortsæt */ }
  }
  return null;
}

function resolveBaseUrl(): string {
  return (getSetting("sonarr_url") || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function sonarrFetch<T>(
  path: string,
  init?: RequestInit & { timeout?: number }
): Promise<T | null> {
  const key = await resolveApiKey();
  if (!key) return null;
  const base = resolveBaseUrl();
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        "X-Api-Key": key,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(init?.timeout ?? 6000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    if (res.status === 204) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// --- Types (kun det vi bruger) ---

export interface SonarrSeriesStatistics {
  episodeFileCount?: number;
  episodeCount?: number;
  totalEpisodeCount?: number;
  sizeOnDisk?: number;
  percentOfEpisodes?: number;
}

export interface SonarrSeries {
  id: number;
  title: string;
  sortTitle?: string;
  year?: number;
  tvdbId?: number;
  imdbId?: string;
  monitored?: boolean;
  status?: string;
  overview?: string;
  network?: string;
  runtime?: number;
  ended?: boolean;
  added?: string;
  remotePoster?: string;
  images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>;
  statistics?: SonarrSeriesStatistics;
}

interface SonarrQualityProfile { id: number; name: string }
interface SonarrRootFolder { id: number; path: string; accessible?: boolean; freeSpace?: number }
interface SonarrLanguageProfile { id: number; name: string }
interface SonarrQueueRecord { id: number; seriesId?: number; title?: string; status?: string }

// --- Public API ---

export async function isConfigured(): Promise<boolean> {
  return (await resolveApiKey()) !== null;
}

export async function getStatus(): Promise<{ online: boolean; configured: boolean; version?: string }> {
  const configured = await isConfigured();
  if (!configured) return { online: false, configured: false };
  const data = await sonarrFetch<{ version?: string }>("/api/v3/system/status");
  if (!data) return { online: false, configured: true };
  return { online: true, configured: true, version: data.version };
}

export async function listSeries(): Promise<SonarrSeries[]> {
  return (await sonarrFetch<SonarrSeries[]>("/api/v3/series")) ?? [];
}

export async function lookupSeries(term: string): Promise<SonarrSeries[]> {
  const q = encodeURIComponent(term.trim());
  if (!q) return [];
  return (await sonarrFetch<SonarrSeries[]>(`/api/v3/series/lookup?term=${q}`)) ?? [];
}

let qpCache: { at: number; data: SonarrQualityProfile[] } | null = null;
let rfCache: { at: number; data: SonarrRootFolder[] } | null = null;
let lpCache: { at: number; data: SonarrLanguageProfile[] } | null = null;

async function getQualityProfiles(): Promise<SonarrQualityProfile[]> {
  if (qpCache && Date.now() - qpCache.at < 5 * 60_000) return qpCache.data;
  const data = (await sonarrFetch<SonarrQualityProfile[]>("/api/v3/qualityprofile")) ?? [];
  qpCache = { at: Date.now(), data };
  return data;
}

async function getRootFolders(): Promise<SonarrRootFolder[]> {
  if (rfCache && Date.now() - rfCache.at < 5 * 60_000) return rfCache.data;
  const data = (await sonarrFetch<SonarrRootFolder[]>("/api/v3/rootfolder")) ?? [];
  rfCache = { at: Date.now(), data };
  return data;
}

async function getLanguageProfiles(): Promise<SonarrLanguageProfile[]> {
  if (lpCache && Date.now() - lpCache.at < 5 * 60_000) return lpCache.data;
  // Sonarr v4 har droppet language profiles — endpoint kan returnere 404
  const data = (await sonarrFetch<SonarrLanguageProfile[]>("/api/v3/languageprofile")) ?? [];
  lpCache = { at: Date.now(), data };
  return data;
}

export async function getQueue(): Promise<SonarrQueueRecord[]> {
  type QueuePage = { records?: SonarrQueueRecord[] };
  const data = await sonarrFetch<QueuePage>("/api/v3/queue?pageSize=100");
  return data?.records ?? [];
}

export interface SonarrHistoryRecord {
  id: number;
  date?: string;
  sourceTitle?: string;
  eventType?: string;
  episodeId?: number;
  seriesId?: number;
  series?: SonarrSeries;
  episode?: {
    id: number;
    title?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    airDate?: string;
  };
  quality?: { quality?: { name?: string } };
  data?: { size?: string };
}

/** Hent senest importerede episoder (downloadFolderImported). */
export async function getRecentlyImported(limit = 10): Promise<SonarrHistoryRecord[]> {
  type Page = { records?: SonarrHistoryRecord[] };
  const data = await sonarrFetch<Page>(
    `/api/v3/history?pageSize=${limit}&page=1&sortKey=date&sortDirection=descending&eventType=3&includeSeries=true&includeEpisode=true`
  );
  return data?.records ?? [];
}

export interface AddSeriesOptions {
  qualityProfileId?: number;
  rootFolderPath?: string;
  languageProfileId?: number;
  monitor?: "all" | "future" | "missing" | "existing" | "pilot" | "firstSeason" | "latestSeason" | "none";
  seasonFolder?: boolean;
  searchForMissingEpisodes?: boolean;
}

export async function addSeries(
  candidate: SonarrSeries,
  opts: AddSeriesOptions = {}
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const profiles = await getQualityProfiles();
  const roots = await getRootFolders();
  const langs = await getLanguageProfiles();
  const qualityProfileId = opts.qualityProfileId ?? profiles[0]?.id;
  const rootFolderPath = opts.rootFolderPath ?? roots[0]?.path;
  if (!qualityProfileId || !rootFolderPath) {
    return { ok: false, error: "Sonarr mangler quality-profile eller root-folder" };
  }
  if (!candidate.tvdbId) {
    return { ok: false, error: "Sonarr-kandidat mangler tvdbId" };
  }

  const body: Record<string, unknown> = {
    title: candidate.title,
    tvdbId: candidate.tvdbId,
    year: candidate.year,
    qualityProfileId,
    rootFolderPath,
    monitored: true,
    seasonFolder: opts.seasonFolder ?? true,
    images: candidate.images ?? [],
    addOptions: {
      monitor: opts.monitor ?? "all",
      searchForMissingEpisodes: opts.searchForMissingEpisodes ?? true,
      searchForCutoffUnmetEpisodes: false,
    },
  };
  if (langs.length > 0) {
    body.languageProfileId = opts.languageProfileId ?? langs[0].id;
  }

  const key = await resolveApiKey();
  if (!key) return { ok: false, error: "Sonarr API-key mangler" };
  const base = resolveBaseUrl();
  try {
    const res = await fetch(`${base}/api/v3/series`, {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Sonarr ${res.status}: ${text.slice(0, 200)}` };
    }
    const created = (await res.json()) as SonarrSeries;
    return { ok: true, id: created.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

export async function deleteSeries(id: number, deleteFiles = false): Promise<boolean> {
  const key = await resolveApiKey();
  if (!key) return false;
  const base = resolveBaseUrl();
  try {
    const res = await fetch(
      `${base}/api/v3/series/${id}?deleteFiles=${deleteFiles}&addImportListExclusion=false`,
      {
        method: "DELETE",
        headers: { "X-Api-Key": key },
        signal: AbortSignal.timeout(8000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function setMonitored(id: number, monitored: boolean): Promise<boolean> {
  const series = await sonarrFetch<SonarrSeries>(`/api/v3/series/${id}`);
  if (!series) return false;
  const key = await resolveApiKey();
  if (!key) return false;
  const base = resolveBaseUrl();
  try {
    const res = await fetch(`${base}/api/v3/series/${id}`, {
      method: "PUT",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ ...series, monitored }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
