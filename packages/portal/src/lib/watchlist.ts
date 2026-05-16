/**
 * Watchlist aggregator — fletter Sonarr-series og Radarr-movies til ét view.
 *
 * Sonarr/Radarr er source-of-truth (monitored=true betyder "vil se").
 * Status beregnes fra `episodeFileCount` / `hasFile` + queue.
 */
import * as sonarr from "./collectors/sonarr";
import * as radarr from "./collectors/radarr";

export type WatchlistStatus = "pending" | "downloading" | "partial" | "ready";
export type WatchlistType = "tv" | "movie";

export interface WatchlistItem {
  service: "sonarr" | "radarr";
  serviceId: number;
  type: WatchlistType;
  title: string;
  year?: number;
  externalId: number; // tvdbId for tv, tmdbId for movies
  imdbId?: string;
  poster?: string;
  overview?: string;
  monitored: boolean;
  status: WatchlistStatus;
  added?: string;
  /** Sonarr: "5/10 episoder" · Radarr: "1.4 GB" eller "ikke hentet" */
  detail: string;
  progress?: number; // 0-100, kun for tv
  sizeOnDisk?: number;
}

export interface WatchlistData {
  online: { sonarr: boolean; radarr: boolean };
  configured: { sonarr: boolean; radarr: boolean };
  items: WatchlistItem[];
  counts: { pending: number; downloading: number; partial: number; ready: number; total: number };
}

function pickPoster(images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>): string | undefined {
  const poster = images?.find((i) => i.coverType === "poster");
  return poster?.remoteUrl || poster?.url;
}

export async function collect(): Promise<WatchlistData> {
  const [sStatus, rStatus] = await Promise.all([sonarr.getStatus(), radarr.getStatus()]);

  const [sSeries, sQueue, rMovies, rQueue] = await Promise.all([
    sStatus.online ? sonarr.listSeries() : Promise.resolve([]),
    sStatus.online ? sonarr.getQueue() : Promise.resolve([]),
    rStatus.online ? radarr.listMovies() : Promise.resolve([]),
    rStatus.online ? radarr.getQueue() : Promise.resolve([]),
  ]);

  const sDownloadingIds = new Set(sQueue.map((q) => q.seriesId).filter((id): id is number => typeof id === "number"));
  const rDownloadingIds = new Set(rQueue.map((q) => q.movieId).filter((id): id is number => typeof id === "number"));

  const items: WatchlistItem[] = [];

  for (const series of sSeries) {
    if (!series.monitored) continue;
    const stats = series.statistics ?? {};
    const fileCount = stats.episodeFileCount ?? 0;
    const totalCount = stats.episodeCount ?? 0;
    const isDownloading = sDownloadingIds.has(series.id);

    let status: WatchlistStatus;
    if (isDownloading) status = "downloading";
    else if (fileCount === 0) status = "pending";
    else if (totalCount > 0 && fileCount >= totalCount) status = "ready";
    else status = "partial";

    const progress = totalCount > 0 ? Math.round((fileCount / totalCount) * 100) : 0;
    const detail =
      status === "pending"
        ? "afventer"
        : status === "downloading"
        ? "henter…"
        : status === "ready"
        ? `${fileCount} afsnit · komplet`
        : `${fileCount}/${totalCount} afsnit`;

    items.push({
      service: "sonarr",
      serviceId: series.id,
      type: "tv",
      title: series.title,
      year: series.year,
      externalId: series.tvdbId ?? 0,
      imdbId: series.imdbId,
      poster: pickPoster(series.images),
      overview: series.overview,
      monitored: true,
      status,
      added: series.added,
      detail,
      progress,
      sizeOnDisk: stats.sizeOnDisk,
    });
  }

  for (const movie of rMovies) {
    if (!movie.monitored) continue;
    const isDownloading = rDownloadingIds.has(movie.id);
    const hasFile = !!movie.hasFile;
    let status: WatchlistStatus;
    if (isDownloading) status = "downloading";
    else if (hasFile) status = "ready";
    else status = "pending";

    const size = movie.movieFile?.size ?? movie.sizeOnDisk;
    const detail = hasFile
      ? `${formatSize(size)} · ${movie.movieFile?.quality?.quality?.name ?? "klar"}`
      : isDownloading
      ? "henter…"
      : "afventer";

    items.push({
      service: "radarr",
      serviceId: movie.id,
      type: "movie",
      title: movie.title,
      year: movie.year,
      externalId: movie.tmdbId ?? 0,
      imdbId: movie.imdbId,
      poster: pickPoster(movie.images),
      overview: movie.overview,
      monitored: true,
      status,
      added: movie.added,
      detail,
      sizeOnDisk: size,
    });
  }

  // Sortering: pending øverst, så downloading, så partial, så ready. Indenfor hver gruppe: nyest tilføjet først.
  const order: Record<WatchlistStatus, number> = { downloading: 0, pending: 1, partial: 2, ready: 3 };
  items.sort((a, b) => {
    const d = order[a.status] - order[b.status];
    if (d !== 0) return d;
    const ta = a.added ? Date.parse(a.added) : 0;
    const tb = b.added ? Date.parse(b.added) : 0;
    return tb - ta;
  });

  const counts = {
    pending: items.filter((i) => i.status === "pending").length,
    downloading: items.filter((i) => i.status === "downloading").length,
    partial: items.filter((i) => i.status === "partial").length,
    ready: items.filter((i) => i.status === "ready").length,
    total: items.length,
  };

  return {
    online: { sonarr: sStatus.online, radarr: rStatus.online },
    configured: { sonarr: sStatus.configured, radarr: rStatus.configured },
    items,
    counts,
  };
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${Math.round(mb)} MB`;
}
