"use client";
import { usePoll } from "@/hooks/usePoll";
import type { JellyfinData } from "@/lib/types";
import { Section } from "../primitives";

/**
 * Jellyfin "nu afspilles" widget til det minimale cockpit.
 * Viser aktive streams med titel, afspiller, bruger, progress + resterende tid.
 * Offline / ingen api-key → kompakt status-besked med setup-hint.
 */
export function JellyfinWidgetMinimal() {
  const { data } = usePoll<JellyfinData>("/api/jellyfin", 10_000);

  const right = data ? (
    <span className={data.online ? "text-emerald-500/80" : "text-neutral-600"}>
      {data.online
        ? data.sessions.length > 0
          ? `● ${data.sessions.length} aktiv${data.sessions.length === 1 ? "" : "e"}`
          : "● ledig"
        : "○ offline"}
    </span>
  ) : undefined;

  return (
    <Section title="jellyfin" right={right} className="col-span-12 lg:col-span-6">
      {!data ? (
        <div className="text-neutral-700 font-mono text-[12px]">indlæser…</div>
      ) : !data.online ? (
        <div className="font-mono text-[11px] text-neutral-600">
          Jellyfin Media Server ikke tilgængelig · sæt <code className="text-neutral-500">jellyfin_url</code> + <code className="text-neutral-500">jellyfin_api_key</code> i settings
        </div>
      ) : data.sessions.length === 0 ? (
        <div className="font-mono">
          <div className="text-neutral-600 text-[12px] mb-2">intet afspilles lige nu</div>
          <div className="flex gap-4 text-[11px] text-neutral-600">
            <span>🎬 {data.library.movies} film</span>
            <span>📺 {data.library.shows} serier</span>
            <span>🎞 {data.library.episodes} episoder</span>
          </div>
        </div>
      ) : (
        <div className="font-mono space-y-2">
          {data.sessions.slice(0, 2).map((s, i) => (
            <div key={i} className="border border-dashed border-neutral-800 p-2">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-neutral-100 text-[13px] truncate flex-1" data-sensitive>{s.title}</span>
                <span className="text-neutral-600 text-[10px] shrink-0">{s.quality}</span>
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] text-neutral-500 truncate flex-1" data-sensitive>
                  {s.user} · {s.player}
                </span>
                <span className="text-[10px] text-neutral-600 shrink-0 tabular-nums">
                  {s.paused ? "⏸ pauset" : `${s.remainingMinutes} min tilbage`}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-[3px] bg-neutral-900 relative overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                    s.paused ? "bg-neutral-600" : "bg-violet-500/70"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, s.progress))}%` }}
                />
              </div>
              <div className="text-[10px] text-neutral-700 tabular-nums mt-0.5">
                {s.progress}%
              </div>
            </div>
          ))}
          {data.sessions.length > 2 && (
            <div className="text-[10px] text-neutral-600 pl-1">
              + {data.sessions.length - 2} andre
            </div>
          )}
          <div className="flex gap-4 text-[10px] text-neutral-600 pt-1 border-t border-dashed border-neutral-900">
            <span>🎬 {data.library.movies}</span>
            <span>📺 {data.library.shows}</span>
            <span>🎞 {data.library.episodes}</span>
          </div>
        </div>
      )}
    </Section>
  );
}
