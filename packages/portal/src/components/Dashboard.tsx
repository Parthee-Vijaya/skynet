"use client";
import { useEffect, useState } from "react";
import { CpuWidget } from "./widgets/CpuWidget";
import { MemoryWidget } from "./widgets/MemoryWidget";
import { StatusWidget } from "./widgets/StatusWidget";
import { DiskWidget } from "./widgets/DiskWidget";
import { WeatherWidget } from "./widgets/WeatherWidget";
import { AirWidget } from "./widgets/AirWidget";
import { PlexWidget } from "./widgets/PlexWidget";
import { DevicesWidget } from "./widgets/DevicesWidget";
import { NewsWidget } from "./widgets/NewsWidget";
import { NzbWidget } from "./widgets/NzbWidget";
import { MarketsWidget } from "./widgets/MarketsWidget";
import { GithubWidget } from "./widgets/GithubWidget";
import { EnergyWidget } from "./widgets/EnergyWidget";
import { FlightsWidget } from "./widgets/FlightsWidget";
import { TrafficWidget } from "./widgets/TrafficWidget";
import { EarthquakesWidget } from "./widgets/EarthquakesWidget";
import { LightningWidget } from "./widgets/LightningWidget";
import { ApodWidget } from "./widgets/ApodWidget";
import { ChatWidget } from "./widgets/ChatWidget";
import { ControlWidget } from "./widgets/ControlWidget";
import { CalendarWidget } from "./widgets/CalendarWidget";
import { RemindersWidget } from "./widgets/RemindersWidget";
import { AgentsWidget } from "./widgets/AgentsWidget";
import { ClaudeHeaderStats } from "./ClaudeHeaderStats";
import { QUOTES } from "@/lib/quotes";

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useRotatingQuote(intervalMs = 20_000) {
  const [quote, setQuote] = useState<string>("");
  const [fading, setFading] = useState(false);
  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
        setFading(false);
      }, 400);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return { quote, fading };
}

export function Dashboard() {
  const now = useClock();
  const { quote, fading } = useRotatingQuote();
  const dateStr = now
    ? now.toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" })
    : "—";
  const timeStr = now
    ? now.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  return (
    <div className="min-h-screen p-3 sm:p-6 lg:p-8">
      {/* Editorial header — stor klokke + claude-code + citat */}
      <header className="max-w-7xl mx-auto mb-6 sm:mb-10 relative rounded-2xl border border-cyan-400/15 bg-[#0d1518]/60 p-5 sm:p-8 lg:p-10 overflow-hidden">
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-400/70 font-mono">
              ▌ S.K.Y.N.E.T. · Personal Intelligence
            </div>
            <h1
              className="text-6xl sm:text-7xl lg:text-[120px] leading-[0.9] tracking-[-0.04em] mt-3 sm:mt-4 font-thin text-cyan-100 tabular-nums"
            >
              {timeStr}
            </h1>
            <p className="text-xs sm:text-sm uppercase tracking-[0.2em] mt-3 sm:mt-4 text-neutral-400 capitalize">
              {dateStr}
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-3 sm:gap-4 shrink-0">
            <ClaudeHeaderStats />
          </div>
        </div>

        <p
          className={`relative text-[11px] sm:text-sm text-neutral-400 italic mt-5 sm:mt-8 pt-4 sm:pt-6 border-t border-cyan-400/10 max-w-3xl transition-opacity duration-400 ${
            fading ? "opacity-0" : "opacity-100"
          }`}
        >
          {quote ? `\u201C${quote}\u201D` : "\u00a0"}
        </p>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3 auto-rows-min">
        {/* Row 1 · System gauges */}
        <CpuWidget />
        <MemoryWidget />
        <StatusWidget />
        <DiskWidget />

        {/* Row 1b · Agents */}
        <AgentsWidget />

        {/* Row 2 · APOD hero */}
        <ApodWidget />

        {/* Row 3 · Chat + Mission control */}
        <ChatWidget />
        <ControlWidget />

        {/* Row 3b · Kalender + Påmindelser (planlægnings-par) */}
        <CalendarWidget />
        <RemindersWidget />

        {/* Row 4 · Trafik + Flights */}
        <TrafficWidget />
        <FlightsWidget />

        {/* Row 5 · Jordskælv + Elpris */}
        <EarthquakesWidget />
        <EnergyWidget />

        {/* Row 6 · Ambient */}
        <LightningWidget />
        <AirWidget />

        {/* Row 6 · Media & hardware */}
        <PlexWidget />
        <DevicesWidget />

        {/* Row 7 · Vejr + Downloads + Markedsdata */}
        <WeatherWidget />
        <NzbWidget />
        <MarketsWidget />

        {/* Row 8 · GitHub + News */}
        <GithubWidget />
        <NewsWidget />
      </main>

      <footer className="max-w-7xl mx-auto mt-8 text-center text-xs text-neutral-600">
        S.K.Y.N.E.T. · System for Knowledge, Yielding Neural Engagement & Tasks
      </footer>
    </div>
  );
}
