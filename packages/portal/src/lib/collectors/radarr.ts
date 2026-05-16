import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSetting } from "@/lib/settings";

const RADARR_CONFIG_PATHS = [
  join(homedir(), ".config", "Radarr", "config.xml"),
  join(homedir(), "Library", "Application Support", "Radarr", "config.xml"),
];

const DEFAULT_BASE_URL = "http://localhost:7878";

async function resolveApiKey(): Promise<string | null> {
  const setting = getSetting("radarr_api_key");
  if (setting) return setting;
  for (const p of RADARR_CONFIG_PATHS) {
    try {
      const xml = await fs.readFile(p, "utf8");
      const m = xml.match(/<ApiKey>([a-f0-9]{16,})<\/ApiKey>/i);
      if (m) return m[1];
    } catch { /* fil findes ikke */ }
  }
  return null;
}

function resolveBaseUrl(): string {
  return (getSetting("radarr_url") || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function radarrFetch<T>(
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

export interface RadarrMovie {
  id: number;
  title: string;
  sortTitle?: string;
  year?: number;
  tmdbId?: number;
  imdbId?: string;
  monitored?: boolean;
  status?: string;
  overview?: string;
  runtime?: number;
  hasFile?: boolean;
  sizeOnDisk?: number;
  added?: string;
  remotePoster?: string;
  images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>;
  movieFile?: { size?: number; quality?: { quality?: { name?: string } } };
}

interface RadarrQualityProfile { id: number; name: string }
interface RadarrRootFolder { id: number; path: string; freeSpace?: number; accessible?: boolean }
interface RadarrQueueRecord { id: number; movieId?: number; title?: string; status?: string }

export async function isConfigured(): Promise<boolean> {
  return (await resolveApiKey()) !== null;
}

export async function getStatus(): Promise<{ online: boolean; configured: boolean; version?: string }> {
  const configured = await isConfigured();
  if (!configured) return { online: false, configured: false };
  const data = await radarrFetch<{ version?: string }>("/api/v3/system/status");
  if (!data) return { online: false, configured: true };
  return { online: true, configured: true, version: data.version };
}

export async function listMovies(): Promise<RadarrMovie[]> {
  return (await radarrFetch<RadarrMovie[]>("/api/v3/movie")) ?? [];
}

export async function lookupMovie(term: string): Promise<RadarrMovie[]> {
  const q = encodeURIComponent(term.trim());
  if (!q) return [];
  return (await radarrFetch<RadarrMovie[]>(`/api/v3/movie/lookup?term=${q}`)) ?? [];
}

let qpCache: { at: number; data: RadarrQualityProfile[] } | null = null;
let rfCache: { at: number; data: RadarrRootFolder[] } | null = null;

async function getQualityProfiles(): Promise<RadarrQualityProfile[]> {
  if (qpCache && Date.now() - qpCache.at < 5 * 60_000) return qpCache.data;
  const data = (await radarrFetch<RadarrQualityProfile[]>("/api/v3/qualityprofile")) ?? [];
  qpCache = { at: Date.now(), data };
  return data;
}

async function getRootFolders(): Promise<RadarrRootFolder[]> {
  if (rfCache && Date.now() - rfCache.at < 5 * 60_000) return rfCache.data;
  const data = (await radarrFetch<RadarrRootFolder[]>("/api/v3/rootfolder")) ?? [];
  rfCache = { at: Date.now(), data };
  return data;
}

export async function getQueue(): Promise<RadarrQueueRecord[]> {
  type QueuePage = { records?: RadarrQueueRecord[] };
  const data = await radarrFetch<QueuePage>("/api/v3/queue?pageSize=100");
  return data?.records ?? [];
}

export interface RadarrHistoryRecord {
  id: number;
  date?: string;
  sourceTitle?: string;
  eventType?: string;
  movieId?: number;
  movie?: RadarrMovie;
  quality?: { quality?: { name?: string } };
  data?: { size?: string };
}

/** Hent senest importerede film (downloadFolderImported). */
export async function getRecentlyImported(limit = 10): Promise<RadarrHistoryRecord[]> {
  type Page = { records?: RadarrHistoryRecord[] };
  const data = await radarrFetch<Page>(
    `/api/v3/history?pageSize=${limit}&page=1&sortKey=date&sortDirection=descending&eventType=3&includeMovie=true`
  );
  return data?.records ?? [];
}

export interface AddMovieOptions {
  qualityProfileId?: number;
  rootFolderPath?: string;
  monitored?: boolean;
  searchForMovie?: boolean;
  minimumAvailability?: "tba" | "announced" | "inCinemas" | "released" | "preDB";
}

export async function addMovie(
  candidate: RadarrMovie,
  opts: AddMovieOptions = {}
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const profiles = await getQualityProfiles();
  const roots = await getRootFolders();
  const qualityProfileId = opts.qualityProfileId ?? profiles[0]?.id;
  const rootFolderPath = opts.rootFolderPath ?? roots[0]?.path;
  if (!qualityProfileId || !rootFolderPath) {
    return { ok: false, error: "Radarr mangler quality-profile eller root-folder" };
  }
  if (!candidate.tmdbId) {
    return { ok: false, error: "Radarr-kandidat mangler tmdbId" };
  }

  const body: Record<string, unknown> = {
    title: candidate.title,
    tmdbId: candidate.tmdbId,
    year: candidate.year,
    qualityProfileId,
    rootFolderPath,
    monitored: opts.monitored ?? true,
    minimumAvailability: opts.minimumAvailability ?? "released",
    images: candidate.images ?? [],
    addOptions: {
      searchForMovie: opts.searchForMovie ?? true,
      monitor: "movieOnly",
    },
  };

  const key = await resolveApiKey();
  if (!key) return { ok: false, error: "Radarr API-key mangler" };
  const base = resolveBaseUrl();
  try {
    const res = await fetch(`${base}/api/v3/movie`, {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Radarr ${res.status}: ${text.slice(0, 200)}` };
    }
    const created = (await res.json()) as RadarrMovie;
    return { ok: true, id: created.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

export async function deleteMovie(id: number, deleteFiles = false): Promise<boolean> {
  const key = await resolveApiKey();
  if (!key) return false;
  const base = resolveBaseUrl();
  try {
    const res = await fetch(
      `${base}/api/v3/movie/${id}?deleteFiles=${deleteFiles}&addImportExclusion=false`,
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
  const movie = await radarrFetch<RadarrMovie>(`/api/v3/movie/${id}`);
  if (!movie) return false;
  const key = await resolveApiKey();
  if (!key) return false;
  const base = resolveBaseUrl();
  try {
    const res = await fetch(`${base}/api/v3/movie/${id}`, {
      method: "PUT",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ ...movie, monitored }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
