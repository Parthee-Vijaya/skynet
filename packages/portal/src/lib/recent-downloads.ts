/**
 * Senest hentede film + episoder fra Sonarr/Radarr history.
 * Bruger eventType=3 (downloadFolderImported) — kun fuldt importerede filer.
 */
import * as sonarr from "./collectors/sonarr";
import * as radarr from "./collectors/radarr";

export interface RecentMovie {
  id: number;
  title: string;
  year?: number;
  date: string;
  quality?: string;
  sizeBytes?: number;
  poster?: string;
  sourceTitle?: string;
}

export interface RecentEpisode {
  id: number;
  seriesTitle: string;
  episodeTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  date: string;
  quality?: string;
  poster?: string;
  sourceTitle?: string;
}

export interface RecentDownloads {
  online: { sonarr: boolean; radarr: boolean };
  configured: { sonarr: boolean; radarr: boolean };
  movies: RecentMovie[];
  episodes: RecentEpisode[];
}

function pickPoster(images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>): string | undefined {
  const poster = images?.find((i) => i.coverType === "poster");
  return poster?.remoteUrl || poster?.url;
}

export async function collect(limit = 5): Promise<RecentDownloads> {
  const [sStatus, rStatus] = await Promise.all([sonarr.getStatus(), radarr.getStatus()]);

  const [sHist, rHist] = await Promise.all([
    sStatus.online ? sonarr.getRecentlyImported(limit) : Promise.resolve([]),
    rStatus.online ? radarr.getRecentlyImported(limit) : Promise.resolve([]),
  ]);

  const episodes: RecentEpisode[] = sHist.slice(0, limit).map((h) => ({
    id: h.id,
    seriesTitle: h.series?.title ?? "(ukendt serie)",
    episodeTitle: h.episode?.title,
    seasonNumber: h.episode?.seasonNumber,
    episodeNumber: h.episode?.episodeNumber,
    date: h.date ?? "",
    quality: h.quality?.quality?.name,
    poster: pickPoster(h.series?.images),
    sourceTitle: h.sourceTitle,
  }));

  const movies: RecentMovie[] = rHist.slice(0, limit).map((h) => ({
    id: h.id,
    title: h.movie?.title ?? "(ukendt film)",
    year: h.movie?.year,
    date: h.date ?? "",
    quality: h.quality?.quality?.name,
    sizeBytes: h.data?.size ? parseInt(h.data.size, 10) : undefined,
    poster: pickPoster(h.movie?.images),
    sourceTitle: h.sourceTitle,
  }));

  return {
    online: { sonarr: sStatus.online, radarr: rStatus.online },
    configured: { sonarr: sStatus.configured, radarr: rStatus.configured },
    movies,
    episodes,
  };
}
