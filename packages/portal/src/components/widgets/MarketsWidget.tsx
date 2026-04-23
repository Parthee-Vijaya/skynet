"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { MarketsData, MarketAsset, CurrencyRate } from "@/lib/types";

function changeColor(pct: number | undefined): string {
  if (pct == null) return "text-neutral-500";
  if (pct > 0.1) return "text-emerald-300";
  if (pct < -0.1) return "text-rose-400";
  return "text-neutral-400";
}

function fmtDkk(v: number): string {
  if (v >= 1_000_000)
    return `${(v / 1_000_000).toFixed(2).replace(".", ",")} M`;
  if (v >= 10_000)
    return Math.round(v).toLocaleString("da-DK");
  if (v >= 100) return v.toFixed(0);
  if (v >= 1) return v.toFixed(2).replace(".", ",");
  return v.toFixed(4).replace(".", ",");
}

function fmtChange(pct: number | undefined): string {
  if (pct == null) return "—";
  const s = pct >= 0 ? "+" : "";
  return `${s}${pct.toFixed(2).replace(".", ",")}%`;
}

function Spark({ points, positive }: { points: number[] | undefined; positive: boolean }) {
  if (!points || points.length < 2) return <div className="w-16 h-6" />;
  const w = 64;
  const h = 22;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((v, i) => {
      const x = Math.round(i * step * 100) / 100;
      const y = Math.round((h - ((v - min) / range) * h) * 100) / 100;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  const color = positive ? "#6ee7b7" : "#fb7185";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-16 h-6" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  XAU: "Au",
  XAG: "Ag",
  OIL: "Oil",
};

function CommodityRow({ asset }: { asset: MarketAsset }) {
  const positive = (asset.change24h ?? 0) >= 0;
  const icon = ICONS[asset.symbol] ?? asset.symbol;
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 py-1.5">
      <div className="w-8 h-8 rounded-lg bg-[var(--j-acc,_#00d9ff)]/10 border border-[rgba(var(--j-acc-rgb),_0.25)] flex items-center justify-center text-[10px] font-mono text-[var(--j-acc,_#00d9ff)] font-semibold">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-neutral-200 truncate">{asset.name}</div>
        <div className="text-[10px] font-mono text-neutral-500">
          {asset.unit ? `DKK / ${asset.unit}` : "DKK"}
          {asset.change7d != null && (
            <span className={`ml-2 ${changeColor(asset.change7d)}`}>
              30d {fmtChange(asset.change7d)}
            </span>
          )}
        </div>
      </div>
      <Spark points={asset.spark} positive={positive} />
      <div className="text-right min-w-[70px]">
        <div className="text-xs font-mono tabular-nums text-neutral-100">
          {fmtDkk(asset.priceDkk)}
        </div>
        <div className={`text-[10px] font-mono tabular-nums ${changeColor(asset.change24h)}`}>
          {fmtChange(asset.change24h)}
        </div>
      </div>
    </div>
  );
}

function CurrencyRow({ cur }: { cur: CurrencyRate }) {
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[10px] text-[var(--j-acc,_#00d9ff)]/80 w-8">
          {cur.code}
        </span>
        <span className="text-neutral-400 truncate">{cur.label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono tabular-nums text-neutral-200">
          {cur.dkkPerUnit.toFixed(3).replace(".", ",")}
        </span>
        <span
          className={`text-[10px] font-mono tabular-nums w-14 text-right ${changeColor(cur.change24h)}`}
        >
          {fmtChange(cur.change24h)}
        </span>
      </div>
    </div>
  );
}

export function MarketsWidget() {
  const { data, isLoading } = usePoll<MarketsData>("/api/markets", 5 * 60_000);

  return (
    <Card
      widget="energy"
      title="Markeder"
      className="sm:col-span-2 lg:col-span-4"
      action={
        <span className="text-[10px] font-mono text-[var(--j-acc,_#00d9ff)]/60 uppercase tracking-wider">
          DKK · live
        </span>
      }
    >
      {data?.error && (data?.commodities?.length ?? 0) === 0 ? (
        <div className="text-xs text-rose-400/80">Fejl: {data.error}</div>
      ) : isLoading && !data ? (
        <div className="text-xs text-neutral-500 py-4">Henter markedsdata…</div>
      ) : (
        <div className="space-y-3">
          {/* Råvarer */}
          <div className="divide-y divide-cyan-400/5">
            {(data?.commodities ?? []).map((a) => (
              <CommodityRow key={a.symbol} asset={a} />
            ))}
          </div>

          {/* Valuta DKK */}
          <div className="pt-2 border-t border-cyan-400/10">
            <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 mb-1">
              Valuta · 1 enhed i DKK
            </div>
            <div className="divide-y divide-cyan-400/5">
              {(data?.currencies ?? []).map((c) => (
                <CurrencyRow key={c.code} cur={c} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
