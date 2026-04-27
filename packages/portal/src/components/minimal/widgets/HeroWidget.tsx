"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { QUOTES } from "@/lib/quotes";
import { Sep } from "../primitives";
import { usePoll } from "@/hooks/usePoll";

function useProfile() {
  const [name, setName] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { userName?: string; location?: { label?: string } }) => {
        if (d?.userName) setName(d.userName);
        if (d?.location?.label) setCity(d.location.label);
      })
      .catch(() => {});
  }, []);
  return { name, city };
}

interface SunData {
  sun?: { sunrise?: string; sunset?: string; dayLengthMinutes?: number };
}
interface SystemData {
  host?: { uptime?: number };
  loadAvg?: number[];
}
interface GithubEventsData {
  events?: Array<{ type?: string; createdAt?: string }>;
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = +d - +start;
  return Math.floor(diff / 86_400_000);
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}t`;
  if (h > 0) return `${h}t ${m}m`;
  return `${m}m`;
}

function fmtDayLength(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}t ${String(m).padStart(2, "0")}m`;
}

// Dynamic import — Three.js kan ikke SSR
const SkynetGlobe = dynamic(
  () => import("./SkynetGlobe").then((m) => ({ default: m.SkynetGlobe })),
  { ssr: false, loading: () => <div style={{ width: 220, height: 220, flexShrink: 0 }} /> }
);

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useRotatingQuote(intervalMs = 20_000) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(Math.floor(Math.random() * QUOTES.length));
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % QUOTES.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return { quote: QUOTES[idx] ?? "", idx };
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "god nat";
  if (h < 10) return "god morgen";
  if (h < 12) return "god formiddag";
  if (h < 18) return "god eftermiddag";
  return "god aften";
}

const DAGE = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MDR = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((+t - +ys) / 86_400_000) + 1) / 7);
}

export function HeroWidget() {
  const now = useClock();
  const { quote, idx } = useRotatingQuote();
  const { name: userName, city } = useProfile();
  const { data: weather } = usePoll<SunData>("/api/weather", 5 * 60_000);
  const { data: system } = usePoll<SystemData>("/api/system", 30_000);
  const { data: github } = usePoll<GithubEventsData>("/api/github", 10 * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = now ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : "--:--";
  const date = now
    ? `${DAGE[now.getDay()]} · ${now.getDate()} ${MDR[now.getMonth()]} ${now.getFullYear()} · uge ${isoWeek(now)}`
    : "—";
  const hello = now ? greetingFor(now) : "";
  const total = QUOTES.length;

  // Sol-info linje (A)
  const sunrise = weather?.sun?.sunrise;
  const sunset = weather?.sun?.sunset;
  const daylight = weather?.sun?.dayLengthMinutes ? fmtDayLength(weather.sun.dayLengthMinutes) : null;
  const dayN = now ? dayOfYear(now) : null;
  const isLeap = now ? new Date(now.getFullYear(), 1, 29).getMonth() === 1 : false;
  const totalDays = isLeap ? 366 : 365;

  // Mini-stats linje (B)
  const todayIso = now ? now.toISOString().slice(0, 10) : "";
  const commitsToday = (github?.events ?? []).filter(
    (e) => e.type === "PushEvent" && (e.createdAt ?? "").startsWith(todayIso),
  ).length;
  const uptime = system?.host?.uptime ? fmtUptime(system.host.uptime) : null;
  const load = system?.loadAvg?.[0] != null ? system.loadAvg[0].toFixed(2) : null;

  return (
    <section
      className="col-span-12 lg:col-span-8"
      style={{ display: "flex", gap: 32, alignItems: "center" }}
    >
      {/* Globe */}
      <SkynetGlobe size={220} />

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="font-mono text-neutral-50 leading-none font-extralight tracking-tight tabular-nums"
          style={{ fontSize: "clamp(48px, 7vw, 104px)" }}
        >
          {time}
        </div>
        <div className="font-mono text-[12px] text-neutral-500 mt-2.5">{date}</div>
        <div className="font-mono text-[13px] text-neutral-200 mt-1">
          {hello}
          {userName && (
            <>
              , <b className="text-neutral-50 font-medium">{userName}</b>
            </>
          )}
          .
          {city && (
            <span className="text-neutral-500 ml-3 text-[11px]">📍 {city}</span>
          )}
        </div>
        <p className="font-mono text-[13px] text-neutral-200 mt-5 max-w-[540px] leading-relaxed min-h-[1.6em]">
          <span className="text-neutral-500 mr-1">—</span>
          {quote}
          <small className="text-neutral-500 ml-3 text-[11px]">
            quote {String(idx + 1).padStart(3, "0")}
            <Sep />
            {total} total
          </small>
        </p>

        {/* A · sol + dag-info */}
        <div className="font-mono text-[11px] text-neutral-500 mt-5 tabular-nums">
          {sunrise && sunset ? (
            <>
              <span className="text-amber-500/70">☀ {sunrise}</span>
              <Sep />
              <span className="text-indigo-400/70">🌙 {sunset}</span>
              {daylight && (<><Sep /><span className="text-neutral-400">{daylight} dagslys</span></>)}
            </>
          ) : (
            <span className="text-neutral-700">☀ —</span>
          )}
          {dayN != null && (<><Sep /><span>dag {dayN}/{totalDays}</span></>)}
        </div>

        {/* B · mini-stats */}
        <div className="font-mono text-[11px] text-neutral-500 mt-1.5 tabular-nums">
          <span className="text-rose-400/70">🔥 {commitsToday}</span>
          <span className="text-neutral-400 ml-1">commits i dag</span>
          {uptime && (<><Sep /><span className="text-cyan-400/70">⏱ {uptime}</span><span className="text-neutral-400 ml-1">uptime</span></>)}
          {load && (<><Sep /><span className="text-emerald-400/70">⚡ {load}</span><span className="text-neutral-400 ml-1">load</span></>)}
        </div>
      </div>
    </section>
  );
}
