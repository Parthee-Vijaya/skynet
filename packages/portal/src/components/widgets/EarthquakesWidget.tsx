"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { EarthquakesData, EarthquakeItem } from "@/lib/types";

function magColor(m: number): string {
  if (m >= 7) return "text-fuchsia-400";
  if (m >= 6) return "text-rose-400";
  if (m >= 5.5) return "text-amber-300";
  if (m >= 5) return "text-cyan-300";
  return "text-neutral-400";
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t`;
  return `${Math.floor(h / 24)}d`;
}

function Row({ q }: { q: EarthquakeItem }) {
  return (
    <a
      href={q.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs py-1 hover:bg-cyan-400/5 px-1 -mx-1 rounded transition-colors"
    >
      <span className={`font-mono font-light tabular-nums text-sm w-10 ${magColor(q.magnitude)}`}>
        {q.magnitude.toFixed(1)}
      </span>
      <span className="flex-1 min-w-0 truncate text-neutral-300">{q.place}</span>
      {q.tsunami && <span className="text-cyan-300 text-[10px]">🌊</span>}
      <span className="text-[10px] font-mono text-neutral-500">{timeAgo(q.timeMs)}</span>
    </a>
  );
}

export function EarthquakesWidget() {
  const { data } = usePoll<EarthquakesData>("/api/earthquakes", 5 * 60_000);

  return (
    <Card
      widget="quake"
      title="Jordskælv · 24t"
      className="sm:col-span-2 lg:col-span-6"
      action={
        <span className="text-[10px] font-mono text-cyan-400/60">
          {data?.count ?? 0} · M4.5+
        </span>
      }
    >
      {data?.largest && (
        <div className="mb-2 pb-2 border-b border-cyan-400/10">
          <div className="text-[9px] text-neutral-500 uppercase tracking-[0.2em] mb-1">Største</div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-light tabular-nums ${magColor(data.largest.magnitude)}`}>
              M{data.largest.magnitude.toFixed(1)}
            </span>
            <span className="text-xs text-neutral-400 truncate flex-1">{data.largest.place}</span>
          </div>
        </div>
      )}
      <div className="divide-y divide-cyan-400/5">
        {(data?.items ?? []).slice(0, 5).map((q, i) => (
          <Row key={`${q.timeMs}-${i}`} q={q} />
        ))}
        {(!data || data.items.length === 0) && !data?.error && (
          <div className="text-xs text-neutral-500 py-2">Ingen seneste 24t</div>
        )}
      </div>
    </Card>
  );
}
