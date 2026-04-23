"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { PlexData } from "@/lib/types";

export function PlexWidget() {
  const { data } = usePoll<PlexData>("/api/plex", 10_000);

  return (
    <Card
      widget="plex"
      title="Plex"
      className="sm:col-span-1 lg:col-span-6"
      action={
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full pulse-dot ${
              data?.online ? "bg-emerald-500" : "bg-neutral-600"
            }`}
          />
          <span className="text-neutral-400">
            {data?.online ? "Online" : data ? "Offline" : "..."}
          </span>
        </span>
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-light tabular-nums">{data?.sessions.length ?? 0}</span>
        <span className="text-sm text-neutral-500">
          {data?.sessions.length === 1 ? "aktiv stream" : "aktive streams"}
        </span>
      </div>

      {data?.sessions.length === 0 && data.online && (
        <div className="mt-3 text-sm text-neutral-500">Ingen aktive afspilninger</div>
      )}

      {data?.sessions && data.sessions.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {data.sessions.slice(0, 2).map((s, i) => (
            <div key={i} className="p-2 rounded-lg bg-neutral-900 border border-neutral-800">
              <div className="text-xs truncate">{s.title}</div>
              <div className="text-[10px] text-neutral-500 mt-0.5 font-mono truncate">
                {s.player} · {s.remainingMinutes} min
              </div>
              <div className="mt-1 h-0.5 bg-neutral-800 rounded-full">
                <div
                  className="h-full bg-sky-400 rounded-full transition-all duration-500"
                  style={{ width: `${s.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {data?.online && (
        <div className="mt-3 pt-2 border-t border-neutral-800 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
          <span>{data.library.movies} film-bib</span>
          <span>{data.library.shows} serie-bib</span>
        </div>
      )}

      {data && !data.online && (
        <div className="mt-2 text-[10px] text-neutral-500">
          Token mangler i indstillinger
        </div>
      )}
    </Card>
  );
}
