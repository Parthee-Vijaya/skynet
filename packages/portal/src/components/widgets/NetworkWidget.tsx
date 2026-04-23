"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/charts/Sparkline";
import { formatRate } from "@/lib/formatters";
import type { SystemData, HistoryPoint } from "@/lib/types";

interface HistoryResponse {
  metric: string;
  points: HistoryPoint[];
}

export function NetworkWidget() {
  const { data } = usePoll<SystemData>("/api/system", 2000);
  const { data: rxHistory } = usePoll<HistoryResponse>("/api/history/netIn", 30_000);
  const { data: txHistory } = usePoll<HistoryResponse>("/api/history/netOut", 30_000);

  const rx = data?.network.rxSec ?? 0;
  const tx = data?.network.txSec ?? 0;
  const active = rx > 1024 || tx > 1024;

  return (
    <Card
      title="Netværk"
      className="sm:col-span-1 lg:col-span-2"
      action={
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              active ? "bg-emerald-500 pulse-dot" : "bg-neutral-600"
            }`}
          />
          <span className="text-neutral-400">{active ? "aktiv" : "idle"}</span>
        </span>
      }
    >
      <div className="space-y-2">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">↓ Ned</span>
            <span className="text-sm font-mono tabular-nums text-sky-400">{formatRate(rx)}</span>
          </div>
          <Sparkline points={rxHistory?.points ?? []} color="#38bdf8" height={20} />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">↑ Op</span>
            <span className="text-sm font-mono tabular-nums text-emerald-400">{formatRate(tx)}</span>
          </div>
          <Sparkline points={txHistory?.points ?? []} color="#34d399" height={20} />
        </div>
      </div>
    </Card>
  );
}
