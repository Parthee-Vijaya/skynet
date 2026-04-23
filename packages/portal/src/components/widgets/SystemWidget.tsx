"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { Sparkline } from "@/components/charts/Sparkline";
import type { SystemData, HistoryPoint } from "@/lib/types";
import { formatBytes, formatRate, formatUptime } from "@/lib/formatters";

interface HistoryResponse {
  metric: string;
  points: HistoryPoint[];
}

export function SystemWidget() {
  const { data, isStale } = usePoll<SystemData>("/api/system", 2000);
  const { data: cpuHistory } = usePoll<HistoryResponse>("/api/history/cpu", 60_000);
  const { data: memHistory } = usePoll<HistoryResponse>("/api/history/mem", 60_000);

  const powerLabel = data?.power.source === "ac"
    ? "AC Power"
    : data?.power.source === "battery"
    ? `Batteri ${data.battery.percent ?? ""}${data.battery.percent ? "%" : ""}`.trim()
    : "—";
  const powerColor = data?.power.thermalWarning
    ? "text-rose-400"
    : data?.power.source === "ac"
    ? "text-emerald-400"
    : "text-neutral-400";

  return (
    <Card
      title="System"
      className="sm:col-span-2 lg:col-span-4"
      action={
        <span className="text-xs text-neutral-500 font-mono truncate max-w-[260px]">
          {data?.host.hostname ?? "—"}
          {isStale && <span className="ml-2 text-amber-500">· stale</span>}
        </span>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
        <div>
          <Metric
            value={data?.cpu.load ?? "—"}
            unit="%"
            label={`CPU · ${data?.cpu.cores ?? "—"} cores`}
            progress={data?.cpu.load}
            color="sky"
          />
          <div className="mt-2">
            <Sparkline points={cpuHistory?.points ?? []} color="#38bdf8" min={0} max={100} />
          </div>
        </div>
        <div>
          <Metric
            value={data ? (data.memory.used / 1024 ** 3).toFixed(1) : "—"}
            unit="GB"
            label={`RAM · ${data ? (data.memory.total / 1024 ** 3).toFixed(0) : "—"} GB`}
            progress={data?.memory.percent}
            color="violet"
          />
          <div className="mt-2">
            <Sparkline points={memHistory?.points ?? []} color="#a78bfa" min={0} max={100} />
          </div>
        </div>
        <Metric
          value={data?.disk.percent ?? "—"}
          unit="%"
          label={`Disk · ${data ? formatBytes(data.disk.total) : "—"}`}
          progress={data?.disk.percent}
          color="amber"
        />
        <div>
          <div className="text-xs text-neutral-500 uppercase tracking-wider">Oppetid</div>
          <div className="mt-1 text-2xl font-light tabular-nums text-neutral-100">
            {data ? formatUptime(data.host.uptime) : "—"}
          </div>
          <div className={`mt-2 text-xs ${powerColor}`}>
            {data?.power.thermalWarning && <span className="mr-1">⚠</span>}
            {powerLabel}
          </div>
          {data?.temperature !== null && data?.temperature !== undefined && (
            <div className="mt-0.5 text-xs text-neutral-500 font-mono">{data.temperature}°C</div>
          )}
          {data?.temperature === null && (
            <div className="mt-0.5 text-[10px] text-neutral-600">temp kræver sudo på Apple Silicon</div>
          )}
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-neutral-800">
        <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
          <span className="uppercase tracking-wider">Top CPU-processer</span>
          <span className="font-mono">{data?.processes.total ?? "—"} processer</span>
        </div>
        <div className="space-y-1">
          {(data?.processes.topCpu ?? []).length === 0 ? (
            <div className="text-xs text-neutral-600 py-1">Ingen aktive processer målt</div>
          ) : (
            data?.processes.topCpu.map((p) => (
              <div key={p.pid} className="flex items-center gap-2 text-xs">
                <span className="text-neutral-200 truncate flex-1">{p.name}</span>
                <span className="font-mono text-neutral-500 tabular-nums w-12 text-right">
                  {p.mem.toFixed(1)}%
                </span>
                <span className="font-mono text-sky-400 tabular-nums w-12 text-right">
                  {p.cpu.toFixed(1)}%
                </span>
                <div className="w-16 h-1 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-400/70"
                    style={{ width: `${Math.min(p.cpu, 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-neutral-800 grid grid-cols-2 gap-4 text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <span>↓</span>
          <span className="font-mono text-neutral-300">
            {data ? formatRate(data.network.rxSec) : "—"}
          </span>
          <span>Download</span>
        </div>
        <div className="flex items-center gap-2">
          <span>↑</span>
          <span className="font-mono text-neutral-300">
            {data ? formatRate(data.network.txSec) : "—"}
          </span>
          <span>Upload</span>
        </div>
      </div>
    </Card>
  );
}
