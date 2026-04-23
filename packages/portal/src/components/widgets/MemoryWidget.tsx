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

export function MemoryWidget() {
  const { data } = usePoll<SystemData>("/api/system", 2000);
  const { data: history } = usePoll<HistoryResponse>("/api/history/mem", 30_000);

  const usedGb = data ? (data.memory.used / 1024 ** 3).toFixed(1) : "0";
  const totalGb = data ? (data.memory.total / 1024 ** 3).toFixed(0) : "—";
  const pct = data?.memory.percent ?? 0;

  return (
    <Card widget="memory" title="Hukommelse" className="sm:col-span-1 lg:col-span-3">
      <div className="flex items-center gap-4">
        <Gauge value={pct} label={`${usedGb} / ${totalGb}GB`} color="#a78bfa" size={100} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1.5">Historik 5m</div>
          <Sparkline points={history?.points ?? []} color="#a78bfa" min={0} max={100} height={40} />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-cyan-400/10 space-y-1">
        <div className="text-[9px] text-neutral-500 uppercase tracking-[0.2em] mb-1">Top processer</div>
        {(data?.processes.topMem ?? []).length === 0 ? (
          <div className="text-xs text-neutral-600">—</div>
        ) : (
          data?.processes.topMem.slice(0, 3).map((p) => (
            <div key={p.pid} className="flex items-center gap-2 text-xs">
              <span className="text-neutral-300 truncate flex-1">{p.name}</span>
              <span className="font-mono text-violet-300 tabular-nums">{p.mem.toFixed(1)}%</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
