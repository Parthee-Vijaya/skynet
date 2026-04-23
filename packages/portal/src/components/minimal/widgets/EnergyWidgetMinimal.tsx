"use client";
import { usePoll } from "@/hooks/usePoll";
import type { EnergyData } from "@/lib/types";
import { Section } from "../primitives";

function priceColor(kr: number): string {
  if (kr < 0.5) return "#7dd67d";   // grøn: billig
  if (kr < 1.5) return "#e5e5e5";   // neutral
  if (kr < 3.0) return "#e6b450";   // gul: dyr
  return "#d87373";                  // rød: meget dyr
}

function priceLabel(kr: number): string {
  if (kr < 0.5) return "billig";
  if (kr < 1.5) return "normal";
  if (kr < 3.0) return "dyr";
  return "meget dyr";
}

const BAR_MAX_ORE = 500; // 500 øre/kWh = 5 kr/kWh

export function EnergyWidgetMinimal() {
  const { data } = usePoll<EnergyData>("/api/energy", 15 * 60_000);

  const price = data?.priceDK2Kr ?? data?.priceDK1Kr ?? null;
  const priceOre = price !== null ? Math.round(price * 100) : null;
  const barPct = priceOre !== null ? Math.min(100, (priceOre / BAR_MAX_ORE) * 100) : 0;
  const color = priceOre !== null ? priceColor(price!) : "#444";

  return (
    <Section
      title="el-spot (DK)"
      right={data?.region ? <span className="text-neutral-600">{data.region}</span> : undefined}
      className="col-span-12 lg:col-span-6"
    >
      {!data ? (
        <div className="text-neutral-700 font-mono text-[12px]">indlæser…</div>
      ) : (
        <div className="font-mono">
          {/* Main price */}
          <div className="flex items-baseline gap-3 mb-2">
            <span style={{ color }} className="text-[28px] font-extralight tabular-nums leading-none">
              {priceOre !== null ? priceOre : "—"}
            </span>
            <span className="text-neutral-500 text-[12px]">øre/kWh</span>
            {priceOre !== null && (
              <span style={{ color }} className="text-[11px]">
                · {priceLabel(price!)}
              </span>
            )}
          </div>

          {/* Price bar */}
          <div className="mb-3" style={{ height: 4, background: "#1c1c1c", position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: 0, top: 0, bottom: 0,
                width: `${barPct}%`,
                background: color,
                transition: "width 0.6s ease",
              }}
            />
          </div>

          {/* Mix: wind + solar + green % */}
          <div className="flex gap-5 text-[11px] text-neutral-500 mb-3">
            {data.windPct > 0 && <span>🌬 vind {data.windPct}%</span>}
            {data.solarPct > 0 && <span>☀️ sol {data.solarPct}%</span>}
            {data.greenPct > 0 && (
              <span style={{ color: data.greenPct > 60 ? "#7dd67d" : "#e5e5e5" }}>
                🌿 grøn {data.greenPct}%
              </span>
            )}
            {data.co2GPerKwh !== null && (
              <span className="ml-auto text-neutral-600">{data.co2GPerKwh} g CO₂/kWh</span>
            )}
          </div>

          {/* Trend sparkline */}
          {data.trend.length > 0 && (
            <div className="flex gap-[4px] items-end" style={{ height: 28 }}>
              {data.trend.map((p, i) => {
                const h = Math.max(2, Math.round((Math.max(0, p.priceKr * 100) / BAR_MAX_ORE) * 28));
                const c = priceColor(p.priceKr);
                const isLast = i === data.trend.length - 1;
                return (
                  <div
                    key={p.hour}
                    title={`${p.hour}: ${Math.round(p.priceKr * 100)} øre`}
                    style={{
                      flex: 1,
                      height: h,
                      background: isLast ? c : "#2a2a2a",
                      borderTop: isLast ? `1px solid ${c}` : "none",
                      alignSelf: "flex-end",
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
