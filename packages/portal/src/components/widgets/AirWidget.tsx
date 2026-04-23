"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { AirQualityData } from "@/lib/types";
import { ratingLabel, ratingColor } from "@/lib/formatters";

function AqiBar({ aqi }: { aqi: number }) {
  const pct = Math.max(2, Math.min(100, aqi));
  return (
    <div className="relative h-1.5 rounded-full overflow-hidden bg-neutral-800">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: "100%",
          background:
            "linear-gradient(to right, #34d399 0%, #34d399 20%, #fbbf24 40%, #fb923c 60%, #f43f5e 80%, #d946ef 100%)",
        }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-[3px] h-3 bg-white rounded-sm shadow-lg"
        style={{ left: `calc(${pct}% - 1.5px)` }}
      />
    </div>
  );
}

function uvLabel(uv: number): { text: string; color: string } {
  if (uv < 3) return { text: "Lav", color: "text-emerald-400" };
  if (uv < 6) return { text: "Moderat", color: "text-amber-400" };
  if (uv < 8) return { text: "Høj", color: "text-orange-400" };
  if (uv < 11) return { text: "Meget høj", color: "text-rose-400" };
  return { text: "Ekstrem", color: "text-fuchsia-400" };
}

function pollenLabel(v: number): { text: string; color: string } {
  if (v < 10) return { text: "lav", color: "text-emerald-400" };
  if (v < 30) return { text: "mod.", color: "text-amber-400" };
  if (v < 70) return { text: "høj", color: "text-orange-400" };
  return { text: "meget høj", color: "text-rose-400" };
}

export function AirWidget() {
  const { data } = usePoll<AirQualityData>("/api/air", 30 * 60_000);

  const pollenEntries: Array<{ name: string; value: number }> = data
    ? [
        { name: "Birk", value: data.pollen.birch ?? 0 },
        { name: "Græs", value: data.pollen.grass ?? 0 },
        { name: "El", value: data.pollen.alder ?? 0 },
        { name: "Ambrosia", value: data.pollen.ragweed ?? 0 },
      ].filter((p) => p.value > 0.5)
    : [];

  const topPollen = pollenEntries.sort((a, b) => b.value - a.value)[0];
  const uv = data?.uvIndex ?? null;

  return (
    <Card
      widget="weather"
      title="Luftkvalitet"
      className="sm:col-span-1 lg:col-span-3"
      action={
        data && (
          <span className={`text-xs px-2 py-0.5 rounded-md ${ratingColor(data.rating)}`}>
            {ratingLabel(data.rating)}
          </span>
        )
      }
    >
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-thin tabular-nums">{data?.aqi ?? "—"}</span>
        <span className="text-sm text-neutral-500">AQI</span>
        {uv != null && (
          <span className="ml-auto text-xs flex items-baseline gap-1">
            <span className="text-neutral-500">UV</span>
            <span className={`font-mono tabular-nums ${uvLabel(uv).color}`}>{uv.toFixed(1)}</span>
            <span className="text-[10px] text-neutral-500">{uvLabel(uv).text}</span>
          </span>
        )}
      </div>

      {data && (
        <div className="mt-2">
          <AqiBar aqi={data.aqi} />
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-neutral-500">PM2.5</span>
          <span className="font-mono">{data?.pm25 ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">PM10</span>
          <span className="font-mono">{data?.pm10 ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">NO₂</span>
          <span className="font-mono">{data?.no2 ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">O₃</span>
          <span className="font-mono">{data?.o3 ?? "—"}</span>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-neutral-800">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Pollen</span>
          {topPollen && (
            <span className={`text-[10px] font-mono ${pollenLabel(topPollen.value).color}`}>
              {topPollen.name} {pollenLabel(topPollen.value).text}
            </span>
          )}
        </div>
        {pollenEntries.length === 0 ? (
          <div className="text-xs text-neutral-600">Ingen målbar pollen</div>
        ) : (
          <div className="space-y-1">
            {pollenEntries.slice(0, 3).map((p) => (
              <div key={p.name} className="flex items-center gap-2 text-[11px]">
                <span className="text-neutral-400 w-16">{p.name}</span>
                <div className="flex-1 h-1 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className={`h-full ${pollenLabel(p.value).color.replace("text-", "bg-")}/60`}
                    style={{ width: `${Math.min(100, p.value)}%` }}
                  />
                </div>
                <span className="font-mono text-neutral-500 tabular-nums w-10 text-right">
                  {p.value.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
