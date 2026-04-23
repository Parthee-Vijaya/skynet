"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { LightningData } from "@/lib/types";

function HourlyBars({ hourly }: { hourly: number[] }) {
  const max = Math.max(1, ...hourly);
  return (
    <div className="flex items-end gap-[2px] h-8">
      {hourly.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm transition-all ${
            v > 0 ? "bg-amber-300/70" : "bg-neutral-800"
          }`}
          style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
          title={`${23 - i}t siden · ${v} hændelser`}
        />
      ))}
    </div>
  );
}

export function LightningWidget() {
  const { data } = usePoll<LightningData>("/api/lightning", 10 * 60_000);

  const active = (data?.last1h ?? 0) > 0 || (data?.totalToday ?? 0) > 0;

  return (
    <Card widget="weather" title="Tordenaktivitet" className="sm:col-span-1 lg:col-span-3">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-3xl font-light tabular-nums text-amber-300">
          {data?.last1h ?? 0}
        </span>
        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">seneste time</span>
        {active && (
          <span className="ml-auto text-xs">⚡</span>
        )}
      </div>

      <HourlyBars hourly={data?.hourly ?? new Array(24).fill(0)} />

      <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-neutral-500">
        <span>
          {data?.nearestKm != null
            ? `~${data.nearestKm}km ${data.nearestDirection ?? ""}`
            : "ingen nær"}
        </span>
        <span>i alt i dag · {data?.totalToday ?? 0}</span>
      </div>
    </Card>
  );
}
