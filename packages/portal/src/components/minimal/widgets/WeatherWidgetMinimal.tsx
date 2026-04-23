"use client";
import { usePoll } from "@/hooks/usePoll";
import type { WeatherData } from "@/lib/types";
import { weatherEmoji, weatherLabel } from "@/lib/formatters";
import { Section } from "../primitives";

export function WeatherWidgetMinimal() {
  const { data } = usePoll<WeatherData>("/api/weather", 10 * 60_000);

  return (
    <Section
      title="vejr"
      right={data ? <span className="text-neutral-600">{data.location}</span> : undefined}
      className="col-span-12 lg:col-span-6"
    >
      {!data ? (
        <div className="text-neutral-700 font-mono text-[12px]">indlæser…</div>
      ) : (
        <div className="font-mono">
          {/* Top row: emoji + temp + label */}
          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-2xl leading-none">{weatherEmoji(data.current.weatherCode)}</span>
            <span className="text-neutral-50 text-[28px] font-extralight tabular-nums leading-none">
              {Math.round(data.current.temp)}°
            </span>
            <span className="text-neutral-500 text-[11px]">
              føles {Math.round(data.current.feelsLike)}° · {weatherLabel(data.current.weatherCode)}
            </span>
          </div>

          {/* Wind + humidity + sun */}
          <div className="flex gap-4 text-[11px] text-neutral-500 mb-3">
            <span>🌬 {Math.round(data.current.windSpeed)} m/s</span>
            <span>💧 {data.current.humidity}%</span>
            <span className="text-amber-500/70">☀ {data.sun.sunrise}</span>
            <span className="text-indigo-400/70">🌙 {data.sun.sunset}</span>
          </div>

          {/* 6-hour sparkline */}
          <div className="flex gap-[6px]">
            {data.hourly.slice(0, 6).map((h) => {
              const hour = new Date(h.time).getHours().toString().padStart(2, "0");
              return (
                <div key={h.time} className="flex flex-col items-center gap-0.5 flex-1">
                  <span className="text-neutral-600 text-[9px]">{hour}</span>
                  <span className="text-[12px]">{weatherEmoji(h.weatherCode)}</span>
                  <span className="text-neutral-400 text-[10px] tabular-nums">{Math.round(h.temp)}°</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}
