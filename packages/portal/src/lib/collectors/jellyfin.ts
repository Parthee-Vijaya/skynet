/**
 * Jellyfin collector — taler med Jellyfin's REST API.
 *
 * Konfigurer i settings:
 *   - jellyfin_url       (default http://localhost:8096)
 *   - jellyfin_api_key   (generér i Jellyfin → Dashboard → API Keys)
 *
 * API-doc: https://api.jellyfin.org/
 *
 * Endpoints brugt:
 *   - GET /System/Info        version + servernavn (auth-required)
 *   - GET /Sessions           aktive afspilnings-sessions
 *   - GET /Items/Counts       library-totals (movies/series/episodes)
 *
 * Auth: header "X-Emby-Token: <key>" (samme på Jellyfin og Emby — bevaret
 * som backwards-compat).
 */
import type { JellyfinData, JellyfinSession } from "@/lib/types";
import { getSetting } from "@/lib/settings";

const TIMEOUT = 5000;

interface JfSession {
  Id?: string;
  UserId?: string;
  UserName?: string;
  Client?: string;
  DeviceName?: string;
  PlayState?: {
    PositionTicks?: number;
    IsPaused?: boolean;
    PlayMethod?: string;
  };
  NowPlayingItem?: {
    Name?: string;
    SeriesName?: string;
    Type?: string;
    RunTimeTicks?: number;
    Width?: number;
    Height?: number;
    MediaStreams?: Array<{ Type?: string; DisplayTitle?: string; Height?: number }>;
  };
}

interface JfCounts {
  MovieCount?: number;
  SeriesCount?: number;
  EpisodeCount?: number;
}

interface JfSystemInfo {
  Version?: string;
  ServerName?: string;
}

function jfHeaders(apiKey: string): Record<string, string> {
  // Jellyfin accepterer enten X-Emby-Token eller MediaBrowser-style auth
  // i Authorization-header. X-Emby-Token er simplest og virker på alle versioner.
  return {
    "X-Emby-Token": apiKey,
    Accept: "application/json",
  };
}

async function jfFetch<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, {
    headers: jfHeaders(apiKey),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Jellyfin HTTP ${res.status} (${url})`);
  return (await res.json()) as T;
}

/** Resolution-klasse fra Width — 4K hvis ≥3000, 1080P hvis ≥1700, 720P hvis ≥1100 */
function resolutionLabel(width?: number, height?: number): string {
  if (width && width >= 3000) return "4K";
  if (height && height >= 2000) return "4K";
  if (height && height >= 1000) return "1080P";
  if (height && height >= 700) return "720P";
  if (height && height >= 400) return "480P";
  return "—";
}

/** Jellyfin tæller "ticks" som 100ns-enheder (Windows-arv). 1 sek = 10_000_000 ticks. */
function ticksToMs(ticks: number | undefined): number {
  return Math.round((ticks ?? 0) / 10_000);
}

export async function collect(): Promise<JellyfinData> {
  const url = (getSetting("jellyfin_url") || "http://localhost:8096").replace(/\/+$/, "");
  const apiKey = getSetting("jellyfin_api_key");
  if (!apiKey) {
    return { online: false, sessions: [], library: { movies: 0, shows: 0, episodes: 0 } };
  }

  try {
    const [sysInfo, sessionsRaw, counts] = await Promise.all([
      jfFetch<JfSystemInfo>(`${url}/System/Info`, apiKey).catch(() => ({} as JfSystemInfo)),
      jfFetch<JfSession[]>(`${url}/Sessions?activeWithinSeconds=120`, apiKey),
      jfFetch<JfCounts>(`${url}/Items/Counts`, apiKey).catch(() => ({} as JfCounts)),
    ]);

    // Filter: kun sessions der faktisk afspiller noget lige nu
    const playing = sessionsRaw.filter((s) => !!s.NowPlayingItem);

    const sessions: JellyfinSession[] = playing.map((s) => {
      const item = s.NowPlayingItem ?? {};
      const totalMs = ticksToMs(item.RunTimeTicks);
      const positionMs = ticksToMs(s.PlayState?.PositionTicks);
      const progress = totalMs > 0 ? Math.round((positionMs / totalMs) * 100) : 0;
      const remainingMinutes = totalMs > 0 ? Math.max(0, Math.round((totalMs - positionMs) / 60000)) : 0;
      const title = item.SeriesName ? `${item.SeriesName} — ${item.Name ?? ""}` : (item.Name ?? "—");
      // Find videostream for resolution
      const video = item.MediaStreams?.find((m) => m.Type === "Video");
      return {
        title,
        player: s.DeviceName || s.Client || "Ukendt",
        user: s.UserName || "—",
        quality: resolutionLabel(item.Width, video?.Height ?? item.Height),
        progress,
        remainingMinutes,
        paused: s.PlayState?.IsPaused === true,
      };
    });

    return {
      online: true,
      sessions,
      library: {
        movies: counts.MovieCount ?? 0,
        shows: counts.SeriesCount ?? 0,
        episodes: counts.EpisodeCount ?? 0,
      },
      version: sysInfo.Version,
    };
  } catch {
    return { online: false, sessions: [], library: { movies: 0, shows: 0, episodes: 0 } };
  }
}
