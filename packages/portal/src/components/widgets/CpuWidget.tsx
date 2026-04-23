"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import { Gauge } from "@/components/ui/Gauge";
import { Sparkline } from "@/components/charts/Sparkline";
import type { SystemData, HistoryPoint } from "@/lib/types";

interface HistoryResponse {
  metric: string;
  points: HistoryPoint[];
}

export function CpuWidget() {
  const { data } = usePoll<SystemData>("/api/system", 2000);
  const { data: history } = usePoll<HistoryResponse>("/api/history/cpu", 30_000);

  const load = data?.cpu.load ?? 0;

  return (
    <Card widget="cpu" title="CPU · Systemkerne" className="sm:col-span-1 lg:col-span-3">
      <div className="flex items-center gap-4">
        <Gauge value={load} label={`${data?.cpu.cores ?? "—"} cores`} color="#00d9ff" size={100} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1.5">Historik 5m</div>
          <Sparkline points={history?.points ?? []} color="#00d9ff" min={0} max={100} height={40} />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-cyan-400/10 space-y-1">
        <div className="text-[9px] text-neutral-500 uppercase tracking-[0.2em] mb-1">Top processer</div>
        {(data?.processes.topCpu ?? []).length === 0 ? (
          <div className="text-xs text-neutral-600">—</div>
        ) : (
          data?.processes.topCpu.slice(0, 3).map((p) => (
            <div key={p.pid} className="flex items-center gap-2 text-xs">
              <span className="text-neutral-300 truncate flex-1">{p.name}</span>
              <span className="font-mono text-cyan-300 tabular-nums">{p.cpu.toFixed(0)}%</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
