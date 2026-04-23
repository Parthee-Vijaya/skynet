"use client";
import { usePoll } from "@/hooks/usePoll";
import type { SystemData, HistoryPoint } from "@/lib/types";
import { Section, Ring, Bar, MiniSpark } from "../primitives";

interface HistoryResponse {
  metric: string;
  points: HistoryPoint[];
}

function fmtGB(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

export function RamWidgetMinimal() {
  const { data } = usePoll<SystemData>("/api/system", 2000);
  const { data: history } = usePoll<HistoryResponse>("/api/history/mem", 30_000);
  const pct = data?.memory.percent ?? 0;
  const used = data?.memory.used ?? 0;
  const total = data?.memory.total ?? 0;
  const procs = data?.processes.topMem.slice(0, 3) ?? [];
  const spark = history?.points.map((p) => ({ value: p.value })) ?? [];

  return (
    <Section
      title="ram"
      right={
        <span>
          {fmtGB(used)} / {fmtGB(total)} gb · unified
        </span>
      }
      className="col-span-12 md:col-span-6 lg:col-span-4"
    >
      <div className="grid grid-cols-[auto_1fr] gap-4 items-center font-mono">
        <Ring value={pct} label="used" size={88} />
        <div className="text-[11px] text-neutral-500">
          historik · 5m
          <span className="block text-neutral-200 mt-0.5 tabular-nums">
            {fmtGB(used)} gb in use
          </span>
          <div className="mt-2">
            <MiniSpark points={spark} height={22} />
          </div>
        </div>
      </div>
      <div className="mt-4 text-[11px] font-mono">
        <div className="text-neutral-500 mb-1">top processer</div>
        {procs.length === 0 && <div className="text-neutral-700">—</div>}
        {procs.map((p) => (
          <div key={p.pid} className="flex items-center py-0.5">
            <span className="flex-1 text-neutral-300 truncate">{p.name}</span>
            <Bar pct={p.mem * 10} tone="fg" />
            <span className="ml-2 text-neutral-100 tabular-nums w-12 text-right">
              {p.mem.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
