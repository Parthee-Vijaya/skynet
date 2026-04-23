"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import { formatBytes } from "@/lib/formatters";
import type { DiskData, DiskDevice } from "@/lib/types";

function formatMB(mb: number): string {
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  if (mb < 1024 * 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${(mb / 1024 / 1024).toFixed(2)} TB`;
}

function DeviceRow({ d }: { d: DiskDevice }) {
  const labelColor = d.isInternal ? "text-cyan-300" : "text-emerald-400";
  const barColor = d.isInternal ? "bg-cyan-400/70" : "bg-emerald-400/70";
  const writing = d.rateMBs > 0.05;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className={`text-[10px] font-mono uppercase tracking-wider ${labelColor}`}>
          {d.isInternal ? "Intern" : "Ekstern"}
        </span>
        <span className="text-xs text-neutral-300 truncate flex-1">{d.name}</span>
        <span className="text-[10px] text-neutral-500 font-mono">{d.interfaceType}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-light tabular-nums text-neutral-100">
          {formatBytes(d.usedBytes)}
        </span>
        <span className="text-xs text-neutral-500">/ {formatBytes(d.totalBytes)}</span>
        <span className="text-xs ml-auto font-mono text-neutral-400">{d.percentUsed}%</span>
      </div>
      <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-500`}
          style={{ width: `${Math.min(d.percentUsed, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 pt-0.5">
        <span className={writing ? "text-neutral-300" : ""}>
          ⇅ {d.rateMBs.toFixed(2)} MB/s
          {writing && <span className="ml-1 text-emerald-400">●</span>}
        </span>
        <span>total {formatMB(d.totalMB)}</span>
      </div>
    </div>
  );
}

export function DiskWidget() {
  const { data } = usePoll<DiskData>("/api/disk", 10_000);
  const devices = data?.devices ?? [];

  return (
    <Card
      widget="status"
      title="Lagring"
      className="sm:col-span-2 lg:col-span-3"
      action={
        <span className="text-xs text-neutral-500 font-mono">
          {devices.length} drev
        </span>
      }
    >
      {devices.length === 0 ? (
        <div className="text-xs text-neutral-500">Indlæser …</div>
      ) : (
        <div className="space-y-4">
          {devices.map((d) => (
            <DeviceRow key={d.id} d={d} />
          ))}
        </div>
      )}
    </Card>
  );
}
