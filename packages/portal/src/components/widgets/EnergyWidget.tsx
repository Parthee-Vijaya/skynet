"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { EnergyData } from "@/lib/types";

function priceColor(kr: number | null): string {
  if (kr == null) return "text-neutral-400";
  if (kr < 0.8) return "text-emerald-300";
  if (kr < 1.5) return "text-cyan-300";
  if (kr < 2.5) return "text-amber-300";
  return "text-rose-400";
}

function MiniTrend({ points }: { points: Array<{ hour: string; priceKr: number }> }) {
  if (points.length === 0) return null;
  const values = points.map((p) => p.priceKr);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0.1);
  const w = 180;
  const h = 40;
  const step = w / Math.max(1, points.length - 1);
  const norm = (v: number) => h - ((v - min) / (max - min)) * h;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${i * step},${norm(p.priceKr)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <defs>
        <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00d9ff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#00d9ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="url(#energyGrad)" />
      <path d={d} fill="none" stroke="#00d9ff" strokeWidth="1.5" />
    </svg>
  );
}

export function EnergyWidget() {
  const { data } = usePoll<EnergyData>("/api/energy", 10 * 60_000);

  const price = data?.region === "DK1" ? data?.priceDK1Kr : data?.priceDK2Kr;

  return (
    <Card widget="energy" title="Elpris · DK" className="sm:col-span-2 lg:col-span-6">
      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-light tabular-nums ${priceColor(price ?? null)}`}>
            {price != null ? price.toFixed(2) : "—"}
          </span>
          <span className="text-xs text-neutral-500">DKK/kWh</span>
          <span className="ml-auto text-[10px] font-mono text-cyan-400/60 uppercase tracking-wider">
            {data?.region ?? "DK2"}
          </span>
        </div>

        <MiniTrend points={data?.trend ?? []} />

        <div className="pt-2 border-t border-cyan-400/10 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500 uppercase tracking-wider text-[10px]">Grøn nu</span>
            <span className="font-mono tabular-nums text-emerald-300">{data?.greenPct ?? 0}%</span>
          </div>
          <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-emerald-400/70 transition-all duration-500"
              style={{ width: `${data?.windPct ?? 0}%` }}
              title="Vind"
            />
            <div
              className="h-full bg-amber-300/70 transition-all duration-500"
              style={{ width: `${data?.solarPct ?? 0}%` }}
              title="Sol"
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500">
            <span>vind {data?.windPct ?? 0}% · sol {data?.solarPct ?? 0}%</span>
            <span>
              {data?.co2GPerKwh != null ? `${data.co2GPerKwh} g/kWh` : "—"}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
