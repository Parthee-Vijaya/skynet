"use client";
import { usePoll } from "@/hooks/usePoll";
import type { SystemData, HistoryPoint } from "@/lib/types";
import { Section, Ring, Bar, MiniSpark } from "../primitives";

interface HistoryResponse {
  metric: string;
  points: HistoryPoint[];
}

export function CpuWidgetMinimal() {
  const { data } = usePoll<SystemData>("/api/system", 2000);
  const { data: history } = usePoll<HistoryResponse>("/api/history/cpu", 30_000);
  const load = data?.cpu.load ?? 0;
  const cores = data?.cpu.cores ?? 0;
  const brand = data?.cpu.brand ?? "—";

  const procs = data?.processes.topCpu.slice(0, 3) ?? [];
  const spark =
    history?.points.map((p) => ({ value: p.value })) ??
    [];

  return (
    <Section
      title="cpu"
      right={<span>{cores} cores · {brand || "apple silicon"}</span>}
      className="col-span-12 md:col-span-6 lg:col-span-4"
    >
      <div className="grid grid-cols-[auto_1fr] gap-4 items-center font-mono">
        <Ring value={load} label="load" size={88} />
        <div className="text-[11px] text-neutral-500">
          historik · 5m
          <span className="block text-neutral-200 mt-0.5">{cores} kerner aktive</span>
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
            <Bar pct={p.cpu} tone={p.cpu > 45 ? "bad" : p.cpu > 25 ? "warn" : "fg"} />
            <span className="ml-2 text-neutral-100 tabular-nums w-10 text-right">
              {p.cpu.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
