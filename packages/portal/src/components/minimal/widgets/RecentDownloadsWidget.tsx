"use client";
import { usePoll } from "@/hooks/usePoll";
import type { RecentDownloads, RecentMovie, RecentEpisode } from "@/lib/recent-downloads";
import { Section } from "../primitives";

function fmtSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function fmtAgo(iso?: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "lige nu";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}t`;
  return `${Math.round(s / 86_400)}d`;
}

function fmtEpisode(ep: RecentEpisode): string {
  if (typeof ep.seasonNumber === "number" && typeof ep.episodeNumber === "number") {
    const s = String(ep.seasonNumber).padStart(2, "0");
    const e = String(ep.episodeNumber).padStart(2, "0");
    return `S${s}E${e}`;
  }
  return "";
}

export function RecentDownloadsWidget() {
  const { data } = usePoll<RecentDownloads>("/api/recent-downloads", 60_000);

  const total = (data?.movies.length ?? 0) + (data?.episodes.length ?? 0);
  const right = (() => {
    if (!data) return undefined;
    if (!data.configured.sonarr && !data.configured.radarr) {
      return <span className="text-neutral-600">○ ikke konfigureret</span>;
    }
    if (!data.online.sonarr && !data.online.radarr) {
      return <span className="text-neutral-600">○ offline</span>;
    }
    if (total === 0) return <span className="text-neutral-600">○ ingen hentet endnu</span>;
    return <span className="text-emerald-500/80">● {total} senest hentet</span>;
  })();

  return (
    <Section title="senest hentet" right={right}>
      {!data ? (
        <div className="text-neutral-700 font-mono text-[12px]">indlæser…</div>
      ) : total === 0 ? (
        <div className="font-mono text-[11px] text-neutral-600 leading-relaxed">
          Ingen importerede downloads endnu. Når Sonarr/Radarr har grab'et og
          flyttet en fil til biblioteket, dukker den op her.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          {/* Film */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-600 mb-1.5 flex items-center gap-2">
              <span>🎬 film</span>
              <span className="text-neutral-800">·</span>
              <span className="normal-case text-neutral-700">{data.movies.length}</span>
            </div>
            {data.movies.length === 0 ? (
              <div className="font-mono text-[10px] text-neutral-700">ingen film endnu</div>
            ) : (
              <div className="space-y-[3px]">
                {data.movies.map((m) => <MovieRow key={m.id} movie={m} />)}
              </div>
            )}
          </div>

          {/* Episoder */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-600 mb-1.5 flex items-center gap-2">
              <span>📺 episoder</span>
              <span className="text-neutral-800">·</span>
              <span className="normal-case text-neutral-700">{data.episodes.length}</span>
            </div>
            {data.episodes.length === 0 ? (
              <div className="font-mono text-[10px] text-neutral-700">ingen episoder endnu</div>
            ) : (
              <div className="space-y-[3px]">
                {data.episodes.map((e) => <EpisodeRow key={e.id} episode={e} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

function MovieRow({ movie }: { movie: RecentMovie }) {
  return (
    <div className="flex items-baseline gap-2 text-[10.5px] font-mono" data-sensitive>
      <span className="text-neutral-300 truncate flex-1">
        {movie.title}
        {movie.year && <span className="text-neutral-600 ml-1">({movie.year})</span>}
      </span>
      {movie.quality && (
        <span className="text-neutral-700 shrink-0 text-[9px] uppercase tracking-wide">
          {movie.quality}
        </span>
      )}
      <span className="text-neutral-700 shrink-0 tabular-nums text-[9.5px]">
        {fmtAgo(movie.date)}
      </span>
    </div>
  );
}

function EpisodeRow({ episode }: { episode: RecentEpisode }) {
  const code = fmtEpisode(episode);
  return (
    <div className="flex items-baseline gap-2 text-[10.5px] font-mono" data-sensitive>
      <span className="text-neutral-300 truncate flex-1">
        {episode.seriesTitle}
        {code && <span className="text-neutral-600 ml-1.5">{code}</span>}
      </span>
      {episode.quality && (
        <span className="text-neutral-700 shrink-0 text-[9px] uppercase tracking-wide">
          {episode.quality}
        </span>
      )}
      <span className="text-neutral-700 shrink-0 tabular-nums text-[9.5px]">
        {fmtAgo(episode.date)}
      </span>
    </div>
  );
}
