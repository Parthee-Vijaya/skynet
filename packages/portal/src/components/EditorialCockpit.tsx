"use client";

import { useState, useEffect, useMemo } from "react";
import { usePoll } from "@/hooks/usePoll";
import { DEFAULT_APPS, type AppEntry, pickAppUrl } from "@/lib/apps";

/**
 * EditorialCockpit
 *
 * Editorial Magazine forside med sidebar-workspace til deep-dive.
 * Kombinerer F (æstetik) + G (interaktivitet).
 *
 * Theme: dark (default) / light · toggle øverst
 * Sidebar: vis/skjul · toggle ved siden af theme
 *
 * Sidebar-kategorier: alle / system / kode / medie / firewall / verden / apps
 */

type Theme = "dark" | "light";

const THEMES: Record<Theme, Record<string, string>> = {
  dark: {
    paper: "#0a0a0a",
    paperElev: "#0e0e0e",
    paperHover: "rgba(255,255,255,0.03)",
    ink: "#f5f5f5",
    inkSoft: "#e5e5e5",
    dim: "rgba(229,229,229,0.55)",
    dimMore: "rgba(229,229,229,0.35)",
    faint: "rgba(229,229,229,0.10)",
    online: "#7dd67d",
  },
  light: {
    paper: "#f5f0e4",
    paperElev: "#fefcf7",
    paperHover: "rgba(28,22,19,0.04)",
    ink: "#181613",
    inkSoft: "#2a2520",
    dim: "rgba(28,22,19,0.62)",
    dimMore: "rgba(28,22,19,0.45)",
    faint: "rgba(28,22,19,0.12)",
    online: "#16a34a",
  },
};

const SERIF = "Georgia, 'Times New Roman', serif";

type CatId = "alle" | "system" | "code" | "media" | "firewall" | "ambient" | "apps";

const CATEGORIES: { id: CatId; label: string; icon: string; color: string }[] = [
  { id: "alle", label: "Alle", icon: "▦", color: "#f5f5f5" },
  { id: "system", label: "System", icon: "▣", color: "#38bdf8" },
  { id: "code", label: "Kode", icon: "◆", color: "#10b981" },
  { id: "media", label: "Medie", icon: "▶", color: "#a78bfa" },
  { id: "firewall", label: "Firewall", icon: "▥", color: "#fb7185" },
  { id: "ambient", label: "Verden", icon: "☁", color: "#e6b450" },
  { id: "apps", label: "Apps", icon: "⚏", color: "#22d3ee" },
];

// ─────────────────────────────────────────────────────────────────────
// Data shapes
// ─────────────────────────────────────────────────────────────────────

interface SystemData {
  cpu?: { load: number; cores: number; brand: string };
  memory?: { used: number; total: number; percent: number };
  disk?: { used: number; total: number; percent: number };
  network?: { rxSec: number; txSec: number };
  host?: { uptime?: number; hostname?: string };
  loadAvg?: number[];
}
interface DiskDevice {
  id: string;
  name: string;
  interfaceType: string;
  mount: string;
  totalBytes: number;
  usedBytes: number;
  percentUsed: number;
  isInternal: boolean;
  rateMBs?: number;
}
interface DiskData {
  devices?: DiskDevice[];
  mounts?: Array<{ path: string; fs: string; totalBytes: number; usedBytes: number; percentUsed: number }>;
}
interface WeatherData {
  current?: { temp: number; feelsLike?: number; weatherCode?: number; windSpeed?: number; humidity?: number };
  sun?: { sunrise?: string; sunset?: string; dayLengthMinutes?: number };
  location?: string;
}
interface JellyfinSession {
  title: string;
  player: string;
  user: string;
  quality?: string;
  progress: number; // 0-100
  remainingMinutes: number;
  paused: boolean;
}
interface JellyfinData {
  online?: boolean;
  sessions?: JellyfinSession[];
  library?: { movies: number; shows: number; episodes: number };
  version?: string;
}
interface SabnzbdData {
  configured?: boolean;
  online?: boolean;
  speedKbps?: number;
  totalQueue?: number;
  paused?: boolean;
  diskFreeGb?: number | null;
}
interface EnergyData {
  priceDK2Kr?: number;
  greenPct?: number;
  co2GPerKwh?: number;
  region?: string;
}
interface ClaudeBucket {
  in?: number;
  out?: number;
  cacheRead?: number;
  cacheCreate?: number;
  total?: number;
  messages?: number;
}
interface ClaudeData {
  today?: ClaudeBucket;
  week?: ClaudeBucket;
  total?: ClaudeBucket;
  dailyTotals?: Array<{ date: string; tokens: number }>;
  recent?: Array<{
    sessionId: string;
    project: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    messageCount: number;
    tokensOut: number;
  }>;
  rateLimits?: {
    fiveHour?: { usedPercent: number; resetsIn?: string };
    sevenDay?: { usedPercent: number; resetsIn?: string };
  };
  liveWindows?: {
    fiveHour?: { tokens: number; messages: number; estimatedPercent: number };
    sevenDay?: { tokens: number; messages: number; estimatedPercent: number };
  };
}

function fmtTokens(n: number | undefined): string {
  if (!n) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} mia`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} mio`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}

function fmtDuration(ms: number | undefined): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}t`;
  if (h > 0) return `${h}t ${m % 60}m`;
  return `${m}m`;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function usePersistedState<T extends string | boolean>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(key);
    if (stored != null) {
      if (typeof initial === "boolean") setValue((stored === "true") as T);
      else setValue(stored as T);
    }
  }, [key, initial]);
  const setter = (v: T) => {
    setValue(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, String(v));
    }
  };
  return [value, setter];
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

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "god nat";
  if (h < 10) return "god morgen";
  if (h < 12) return "god formiddag";
  if (h < 18) return "god eftermiddag";
  return "god aften";
}

function fmtBytes(b: number | undefined, digits = 1): string {
  if (!b) return "—";
  const tb = b / 1024 ** 4;
  if (tb >= 1) return `${tb.toFixed(digits)} TB`;
  const gb = b / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(digits)} GB`;
  const mb = b / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

function fmtRate(bps: number | undefined): string {
  if (!bps) return "0 KB/s";
  const kb = bps / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB/s`;
  return `${(kb / 1024).toFixed(1)} MB/s`;
}

function fmtUptime(sec: number | undefined): string {
  if (!sec) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return `${d}d ${h}t`;
  const m = Math.floor((sec % 3600) / 60);
  return `${h}t ${m}m`;
}

const ZODIAC = [
  { m: 1, d: 20, sym: "♒", da: "Vandmanden" },
  { m: 2, d: 19, sym: "♓", da: "Fiskene" },
  { m: 3, d: 21, sym: "♈", da: "Vædderen" },
  { m: 4, d: 20, sym: "♉", da: "Tyren" },
  { m: 5, d: 21, sym: "♊", da: "Tvillingerne" },
  { m: 6, d: 21, sym: "♋", da: "Krebsen" },
  { m: 7, d: 23, sym: "♌", da: "Løven" },
  { m: 8, d: 23, sym: "♍", da: "Jomfruen" },
  { m: 9, d: 23, sym: "♎", da: "Vægten" },
  { m: 10, d: 23, sym: "♏", da: "Skorpionen" },
  { m: 11, d: 22, sym: "♐", da: "Skytten" },
  { m: 12, d: 22, sym: "♑", da: "Stenbukken" },
];

function getZodiac(d: Date): { sym: string; da: string } {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  let idx = ZODIAC.length - 1;
  for (let i = 0; i < ZODIAC.length; i++) {
    const s = ZODIAC[i];
    if (m > s.m || (m === s.m && day >= s.d)) idx = i;
    else break;
  }
  return ZODIAC[idx];
}

// ─────────────────────────────────────────────────────────────────────
// Inline-icon SVG (Lucide-style)
// ─────────────────────────────────────────────────────────────────────

function SunIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
function MoonIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function MenuIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h18M3 6h18M3 18h18" />
    </svg>
  );
}
function ChevronLeftIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

export function EditorialCockpit() {
  const [active, setActive] = useState<CatId>("alle");
  const [theme, setTheme] = usePersistedState<Theme>("cockpit.theme", "dark");
  const [sidebarOpen, setSidebarOpen] = usePersistedState<boolean>("cockpit.sidebar", true);
  const now = useClock();

  const { data: system } = usePoll<SystemData>("/api/system", 30_000);
  const { data: disk } = usePoll<DiskData>("/api/disk", 60_000);
  const { data: weather } = usePoll<WeatherData>("/api/weather", 5 * 60_000);
  const { data: jellyfin } = usePoll<JellyfinData>("/api/jellyfin", 30_000);
  const { data: sabnzbd } = usePoll<SabnzbdData>("/api/sabnzbd", 30_000);
  const { data: energy } = usePoll<EnergyData>("/api/energy", 15 * 60_000);
  const { data: claude } = usePoll<ClaudeData>("/api/claude", 60_000);

  const time = now ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : "--:--";
  const dateLong = now
    ? `${DAGE[now.getDay()]} · ${now.getDate()}. ${MDR[now.getMonth()]} · uge ${isoWeek(now)}`
    : "—";
  const hello = now ? greetingFor(now) : "";
  const zodiac = now ? getZodiac(now) : { sym: "♉", da: "Tyren" };

  const t = THEMES[theme];

  // CSS-variabler så hele træet kan bruge var(--paper) etc.
  const cssVars = {
    "--paper": t.paper,
    "--paper-elev": t.paperElev,
    "--paper-hover": t.paperHover,
    "--ink": t.ink,
    "--ink-soft": t.inkSoft,
    "--dim": t.dim,
    "--dim-more": t.dimMore,
    "--faint": t.faint,
    "--online": t.online,
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen flex"
      style={{
        ...cssVars,
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      {sidebarOpen && (
        <Sidebar
          active={active}
          onSelect={setActive}
          system={system}
          time={time}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 overflow-x-hidden relative">
        {/* Top-right toggles */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-3" style={{ background: "var(--paper)", borderBottom: `1px solid var(--faint)` }}>
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="inline-flex items-center justify-center w-8 h-8 transition-colors hover:opacity-80"
                style={{ color: "var(--ink)" }}
                aria-label="Vis sidebar"
                title="Vis sidebar"
              >
                <MenuIcon size={16} />
              </button>
            )}
            <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: "var(--dim)" }}>
              {CATEGORIES.find((c) => c.id === active)?.label ?? "—"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] rounded transition-colors hover:opacity-80"
              style={{ color: "var(--ink)", border: `1px solid var(--faint)` }}
              aria-label={theme === "dark" ? "Skift til light mode" : "Skift til dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <SunIcon size={13} /> : <MoonIcon size={13} />}
              <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
          </div>
        </div>

        {active === "alle" && (
          <EditorialOverview
            time={time}
            dateLong={dateLong}
            hello={hello}
            zodiac={zodiac}
            system={system}
            disk={disk}
            weather={weather}
            jellyfin={jellyfin}
            sabnzbd={sabnzbd}
            energy={energy}
            claude={claude}
            onCategoryClick={setActive}
          />
        )}
        {active === "system" && <SystemDeepDive system={system} disk={disk} />}
        {active === "code" && <CodeDeepDive claude={claude} />}
        {active === "media" && <MediaDeepDive jellyfin={jellyfin} sabnzbd={sabnzbd} />}
        {active === "firewall" && <FirewallDeepDive />}
        {active === "ambient" && <AmbientDeepDive weather={weather} energy={energy} />}
        {active === "apps" && <AppsGrid />}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────

function Sidebar({
  active,
  onSelect,
  system,
  time,
  onClose,
}: {
  active: CatId;
  onSelect: (id: CatId) => void;
  system: SystemData | undefined;
  time: string;
  onClose: () => void;
}) {
  return (
    <nav
      className="w-[220px] shrink-0 flex flex-col sticky top-0 h-screen"
      style={{ borderRight: `1px solid var(--faint)`, background: "var(--paper-elev)" }}
    >
      <div className="px-5 py-5 flex items-start justify-between" style={{ borderBottom: `1px solid var(--faint)` }}>
        <div>
          <div style={{ color: "var(--ink)" }}>
            skynet<span style={{ color: "var(--dim-more)" }}>.live</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] mt-1" style={{ color: "var(--dim)" }}>
            cockpit
          </div>
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center justify-center w-7 h-7 transition-colors hover:opacity-70"
          style={{ color: "var(--dim)" }}
          aria-label="Skjul sidebar"
          title="Skjul sidebar"
        >
          <ChevronLeftIcon size={14} />
        </button>
      </div>

      <div className="flex flex-col py-3 flex-1 overflow-y-auto">
        {CATEGORIES.map((cat) => {
          const isActive = active === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className="flex items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[var(--paper-hover)]"
              style={{
                color: isActive ? "var(--ink)" : "var(--dim)",
                background: isActive ? `${cat.color}1a` : "transparent",
                borderLeft: `3px solid ${isActive ? cat.color : "transparent"}`,
              }}
            >
              <span className="w-5 text-base" style={{ color: isActive ? cat.color : "var(--dim)" }}>
                {cat.icon}
              </span>
              <span className="flex-1 text-sm">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Quick nav links */}
      <div className="px-5 py-3 text-[11px]" style={{ borderTop: `1px solid var(--faint)`, color: "var(--dim)" }}>
        <div className="flex flex-col gap-1">
          <a href="/automations" className="hover:opacity-80 transition-opacity">automations</a>
          <a href="/chat" className="hover:opacity-80 transition-opacity">chat</a>
          <a href="/firewall" className="hover:opacity-80 transition-opacity">firewall · fuld side</a>
          <a href="/settings" className="hover:opacity-80 transition-opacity">settings</a>
        </div>
      </div>

      <div className="px-5 py-4 text-[10px]" style={{ borderTop: `1px solid var(--faint)`, color: "var(--dim)" }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--online)" }} />
          <span>online</span>
          {system?.host?.uptime && (
            <>
              <span style={{ color: "var(--faint)" }}>·</span>
              <span>{fmtUptime(system.host.uptime)} up</span>
            </>
          )}
        </div>
        <div className="tabular-nums text-[10px]" style={{ color: "var(--ink)" }}>{time}</div>
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Editorial Overview (default · "alle")
// ─────────────────────────────────────────────────────────────────────

function EditorialOverview({
  time,
  dateLong,
  hello,
  zodiac,
  system,
  disk,
  weather,
  jellyfin,
  sabnzbd,
  energy,
  claude,
  onCategoryClick,
}: {
  time: string;
  dateLong: string;
  hello: string;
  zodiac: { sym: string; da: string };
  system: SystemData | undefined;
  disk: DiskData | undefined;
  weather: WeatherData | undefined;
  jellyfin: JellyfinData | undefined;
  sabnzbd: SabnzbdData | undefined;
  energy: EnergyData | undefined;
  claude: ClaudeData | undefined;
  onCategoryClick: (id: CatId) => void;
}) {
  const fiveHour = claude?.liveWindows?.fiveHour?.estimatedPercent ?? claude?.rateLimits?.fiveHour?.usedPercent;
  const sevenDay = claude?.liveWindows?.sevenDay?.estimatedPercent ?? claude?.rateLimits?.sevenDay?.usedPercent;
  const session = jellyfin?.sessions?.[0];
  const internalSsd = disk?.devices?.find((d) => d.isInternal);
  const ssdFreeBytes = internalSsd ? internalSsd.totalBytes - internalSsd.usedBytes : undefined;
  return (
    <div className="max-w-5xl mx-auto px-10 py-12">
      {/* Masthead */}
      <header className="flex items-baseline justify-between mb-16 text-[10px] uppercase tracking-[0.4em]" style={{ color: "var(--dim)" }}>
        <span>skynet · personlig intelligens</span>
        <span>{dateLong}</span>
      </header>

      {/* Cover */}
      <section className="text-center mb-20">
        <div className="text-[10px] uppercase tracking-[0.5em] mb-6" style={{ color: "var(--dim)" }}>
          denne time
        </div>
        <h1
          className="leading-[0.85] font-light tracking-[-0.04em] tabular-nums"
          style={{ color: "var(--ink)", fontFamily: SERIF, fontSize: "clamp(120px, 18vw, 200px)" }}
        >
          {time}
        </h1>
        <div className="mt-8 text-lg font-light" style={{ color: "var(--ink)" }}>
          {hello}, Parthee. {weather?.location && <span style={{ color: "var(--dim)" }}>· {weather.location}</span>}
        </div>
        {weather?.sun && (
          <div className="mt-3 text-sm font-light" style={{ color: "var(--dim)" }}>
            ☀ {weather.sun.sunrise} → 🌙 {weather.sun.sunset}
            <span className="mx-3">·</span>
            {zodiac.sym} {zodiac.da}
          </div>
        )}
      </section>

      {/* Section divider */}
      <div className="flex items-center gap-6 mb-12">
        <span className="flex-1 h-px" style={{ background: "var(--faint)" }} />
        <span className="text-[10px] uppercase tracking-[0.5em]" style={{ color: "var(--dim)" }}>
          tilstand
        </span>
        <span className="flex-1 h-px" style={{ background: "var(--faint)" }} />
      </div>

      {/* 4 sektioner i 2×2 — klik for deep-dive */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
        <SectionCard
          title="System"
          subtitle={system?.cpu?.brand ? `${system.cpu.brand} · ${fmtUptime(system?.host?.uptime)} oppe` : "indlæser…"}
          accent={CATEGORIES.find((c) => c.id === "system")!.color}
          onClick={() => onCategoryClick("system")}
        >
          <MetricRow label="cpu" value={system?.cpu?.load !== undefined ? `${system.cpu.load}%` : "—"} bar={system?.cpu?.load} sub={system?.cpu?.cores ? `${system.cpu.cores} kerner` : ""} />
          <MetricRow label="ram" value={system?.memory?.percent !== undefined ? `${system.memory.percent}%` : "—"} bar={system?.memory?.percent} sub={system?.memory?.used ? `${fmtBytes(system.memory.used, 1)} / ${fmtBytes(system.memory.total, 0)}` : ""} />
          <MetricRow
            label="ssd ledig"
            value={ssdFreeBytes !== undefined ? fmtBytes(ssdFreeBytes, 0) : "—"}
            bar={internalSsd?.percentUsed}
            sub={internalSsd ? `intern · ${internalSsd.percentUsed}% brugt af ${fmtBytes(internalSsd.totalBytes, 0)}` : ""}
          />
          <MetricRow
            label="ekstern"
            value={(() => {
              const ext = disk?.devices?.find((d) => !d.isInternal);
              if (!ext) return "—";
              const free = ext.totalBytes - ext.usedBytes;
              return fmtBytes(free, 1);
            })()}
            sub={(() => {
              const ext = disk?.devices?.find((d) => !d.isInternal);
              if (!ext) return "";
              return `${ext.name} · ${ext.percentUsed}% brugt`;
            })()}
          />
          <MetricRow label="net" value={`↓ ${fmtRate(system?.network?.rxSec)}`} sub={`↑ ${fmtRate(system?.network?.txSec)} live`} />
        </SectionCard>

        <SectionCard
          title="Kode"
          subtitle="claude · brug & limits"
          accent={CATEGORIES.find((c) => c.id === "code")!.color}
          onClick={() => onCategoryClick("code")}
        >
          <MetricRow
            label="5t window"
            value={fiveHour !== undefined ? `${fiveHour.toFixed(1)}%` : "—"}
            bar={fiveHour}
            sub={claude?.rateLimits?.fiveHour?.resetsIn ? `nulstilles ${claude.rateLimits.fiveHour.resetsIn}` : ""}
          />
          <MetricRow
            label="7-dag"
            value={sevenDay !== undefined ? `${sevenDay.toFixed(1)}%` : "—"}
            bar={sevenDay}
            sub={claude?.rateLimits?.sevenDay?.resetsIn ? `nulstilles ${claude.rateLimits.sevenDay.resetsIn}` : ""}
          />
          <MetricRow
            label="tokens i dag"
            value={fmtTokens(claude?.today?.total)}
            sub={claude?.today?.messages !== undefined ? `${claude.today.messages} beskeder` : ""}
          />
          <MetricRow
            label="tokens uge"
            value={fmtTokens(claude?.week?.total)}
            sub={claude?.week?.messages !== undefined ? `${claude.week.messages} beskeder` : ""}
          />
          <MetricRow
            label="tokens i alt"
            value={fmtTokens(claude?.total?.total)}
            sub={claude?.total?.messages !== undefined ? `${claude.total.messages.toLocaleString("da-DK")} beskeder all-time` : ""}
          />
        </SectionCard>

        <SectionCard
          title="Medie"
          subtitle={jellyfin?.library ? `${jellyfin.library.movies} film · ${jellyfin.library.shows} serier` : "jellyfin · sabnzbd"}
          accent={CATEGORIES.find((c) => c.id === "media")!.color}
          onClick={() => onCategoryClick("media")}
        >
          <MetricRow
            label="jellyfin"
            value={jellyfin?.online ? `${jellyfin?.sessions?.length ?? 0}` : "—"}
            sub={session ? `${session.user} · ${session.title}` : (jellyfin?.online ? "ingen ser nu" : "ikke konfigureret")}
          />
          {session && (
            <MetricRow
              label="progress"
              value={`${session.progress}%`}
              bar={session.progress}
              sub={`${session.remainingMinutes}m tilbage · ${session.player}${session.paused ? " · paused" : ""}`}
            />
          )}
          <MetricRow
            label="sabnzbd"
            value={sabnzbd?.online ? (sabnzbd?.totalQueue ? `${sabnzbd.totalQueue}` : "tom") : "—"}
            sub={sabnzbd?.online ? (sabnzbd.paused ? "paused" : `${((sabnzbd.speedKbps ?? 0) / 1024).toFixed(1)} MB/s`) : "ikke online"}
          />
          <MetricRow label="disk ledig" value={sabnzbd?.diskFreeGb !== null && sabnzbd?.diskFreeGb !== undefined ? `${sabnzbd.diskFreeGb.toFixed(0)} GB` : "—"} sub="download-disk" />
        </SectionCard>

        <SectionCard
          title="Verden"
          subtitle="vejr · elpris"
          accent={CATEGORIES.find((c) => c.id === "ambient")!.color}
          onClick={() => onCategoryClick("ambient")}
        >
          <MetricRow label="vejr" value={weather?.current?.temp !== undefined ? `${weather.current.temp}°` : "—"} sub={weather?.current?.feelsLike !== undefined ? `føles ${weather.current.feelsLike}°` : ""} />
          <MetricRow label="vind" value={weather?.current?.windSpeed !== undefined ? `${weather.current.windSpeed} m/s` : "—"} sub={weather?.current?.humidity !== undefined ? `fugt ${weather.current.humidity}%` : ""} />
          <MetricRow label="elpris" value={energy?.priceDK2Kr !== undefined ? `${energy.priceDK2Kr.toFixed(2)} kr` : "—"} sub={energy?.greenPct !== undefined ? `grøn ${energy.greenPct}%` : ""} />
          <MetricRow label="CO₂" value={energy?.co2GPerKwh !== undefined ? `${energy.co2GPerKwh} g/kWh` : "—"} sub={energy?.region ?? ""} />
        </SectionCard>
      </section>

      {/* Apps row */}
      <section className="mt-20">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-2xl font-light tracking-tight" style={{ color: "var(--ink)", fontFamily: SERIF }}>
            Apps
          </h2>
          <button
            onClick={() => onCategoryClick("apps")}
            className="text-[11px] uppercase tracking-wider hover:opacity-80 transition-opacity"
            style={{ color: "var(--dim)" }}
          >
            se alle ↗
          </button>
        </div>
        <AppsRow limit={6} />
      </section>

      <footer className="mt-20 pt-6 text-[10px] uppercase tracking-[0.4em] flex justify-between" style={{ color: "var(--dim)", borderTop: `1px solid var(--faint)` }}>
        <span>editorial · cockpit</span>
        <span>{dateLong}</span>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SectionCard (clickable section in editorial view)
// ─────────────────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
  accent,
  onClick,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left transition-colors hover:bg-[var(--paper-hover)] -mx-3 px-3 py-3 rounded"
    >
      <header className="mb-4">
        <h2
          className="text-3xl font-light tracking-tight group-hover:underline underline-offset-8"
          style={{ color: "var(--ink)", fontFamily: SERIF, textDecorationColor: accent }}
        >
          {title}
          <span className="ml-3 opacity-0 group-hover:opacity-50 text-base" style={{ color: accent }}>
            ↗
          </span>
        </h2>
        <div className="text-[10px] uppercase tracking-[0.3em] mt-1" style={{ color: "var(--dim)" }}>
          {subtitle}
        </div>
      </header>
      <div>{children}</div>
    </button>
  );
}

function MetricRow({ label, value, bar, sub }: { label: string; value: string; bar?: number; sub?: string }) {
  return (
    <div className="flex items-baseline gap-4 py-2" style={{ borderBottom: `1px solid var(--faint)` }}>
      <span className="w-20 text-xs font-light" style={{ color: "var(--dim)" }}>
        {label}
      </span>
      {typeof bar === "number" && (
        <span className="font-mono text-[11px] select-none" style={{ color: "var(--ink)" }}>
          {"▓".repeat(Math.round(bar / 10))}
          <span style={{ color: "var(--faint)" }}>{"░".repeat(10 - Math.round(bar / 10))}</span>
        </span>
      )}
      <span className="text-base tabular-nums" style={{ color: "var(--ink)" }}>
        {value}
      </span>
      {sub && <span className="text-xs ml-auto font-light truncate" style={{ color: "var(--dim)" }}>{sub}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Deep-dives
// ─────────────────────────────────────────────────────────────────────

function DeepHeader({ title, sub, accent }: { title: string; sub?: string; accent: string }) {
  return (
    <header className="mb-10 pb-6" style={{ borderBottom: `1px solid var(--faint)` }}>
      <div className="text-[10px] uppercase tracking-[0.3em] mb-2" style={{ color: accent }}>
        deep-dive
      </div>
      <h1 className="text-5xl font-light tracking-tight" style={{ color: "var(--ink)", fontFamily: SERIF }}>
        {title}
      </h1>
      {sub && <div className="text-sm mt-2" style={{ color: "var(--dim)" }}>{sub}</div>}
    </header>
  );
}

function MetricBlock({ label, value, sub, bar, accent }: { label: string; value: string; sub?: string; bar?: number; accent: string }) {
  return (
    <div className="py-7" style={{ borderBottom: `1px solid var(--faint)` }}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs uppercase tracking-[0.3em]" style={{ color: "var(--dim)" }}>
          {label}
        </span>
        <span className="text-4xl font-extralight tabular-nums" style={{ color: "var(--ink)" }}>
          {value}
        </span>
      </div>
      {sub && <div className="text-[11px]" style={{ color: "var(--dim)" }}>{sub}</div>}
      {typeof bar === "number" && (
        <div className="h-1 mt-3" style={{ background: "var(--faint)" }}>
          <div className="h-full" style={{ width: `${Math.min(100, Math.max(0, bar))}%`, background: accent }} />
        </div>
      )}
    </div>
  );
}

function DeepWrapper({ children }: { children: React.ReactNode }) {
  return <div className="max-w-3xl mx-auto px-10 py-14">{children}</div>;
}

function SystemDeepDive({ system, disk }: { system: SystemData | undefined; disk: DiskData | undefined }) {
  const accent = "#38bdf8";
  return (
    <DeepWrapper>
      <DeepHeader title="System" sub={system?.cpu?.brand ?? "—"} accent={accent} />
      <MetricBlock label="CPU" value={system?.cpu?.load !== undefined ? `${system.cpu.load}%` : "—"} sub={system?.cpu?.cores ? `${system.cpu.cores} kerner` : ""} bar={system?.cpu?.load} accent={accent} />
      <MetricBlock label="Hukommelse" value={system?.memory?.percent !== undefined ? `${system.memory.percent}%` : "—"} sub={system?.memory?.used !== undefined ? `${fmtBytes(system.memory.used, 1)} / ${fmtBytes(system.memory.total, 0)}` : ""} bar={system?.memory?.percent} accent={accent} />

      {disk?.devices?.map((d) => {
        const freeBytes = d.totalBytes - d.usedBytes;
        return (
          <MetricBlock
            key={d.id}
            label={d.isInternal ? "Intern SSD" : `Ekstern · ${d.name}`}
            value={`${fmtBytes(freeBytes, 1)} ledig`}
            sub={`${d.percentUsed}% brugt · ${fmtBytes(d.usedBytes, 1)} af ${fmtBytes(d.totalBytes, 1)} · ${d.interfaceType}`}
            bar={d.percentUsed}
            accent={accent}
          />
        );
      })}

      <MetricBlock label="Netværk (live)" value={`↓ ${fmtRate(system?.network?.rxSec)}`} sub={`↑ ${fmtRate(system?.network?.txSec)} · opdateres hver 30 sek`} accent={accent} />
      <MetricBlock label="Load avg" value={system?.loadAvg?.[0] !== undefined ? system.loadAvg[0].toFixed(2) : "—"} sub={system?.loadAvg ? `${system.loadAvg.slice(0, 3).map((l) => l.toFixed(2)).join(" · ")} (1m · 5m · 15m)` : ""} accent={accent} />
      <MetricBlock label="Uptime" value={fmtUptime(system?.host?.uptime)} sub={system?.host?.hostname ?? ""} accent={accent} />
    </DeepWrapper>
  );
}

function CodeDeepDive({ claude }: { claude: ClaudeData | undefined }) {
  const accent = "#10b981";
  const fiveHour = claude?.liveWindows?.fiveHour?.estimatedPercent ?? claude?.rateLimits?.fiveHour?.usedPercent;
  const sevenDay = claude?.liveWindows?.sevenDay?.estimatedPercent ?? claude?.rateLimits?.sevenDay?.usedPercent;

  return (
    <DeepWrapper>
      <DeepHeader title="Kode" sub="claude brug · limits · sessions" accent={accent} />

      {/* Rate limits */}
      <MetricBlock
        label="5-times window"
        value={fiveHour !== undefined ? `${fiveHour.toFixed(1)}%` : "—"}
        sub={
          claude?.liveWindows?.fiveHour
            ? `${fmtTokens(claude.liveWindows.fiveHour.tokens)} · ${claude.liveWindows.fiveHour.messages} beskeder · nulstilles ${claude.rateLimits?.fiveHour?.resetsIn ?? "—"}`
            : claude?.rateLimits?.fiveHour?.resetsIn ? `nulstilles ${claude.rateLimits.fiveHour.resetsIn}` : ""
        }
        bar={fiveHour}
        accent={accent}
      />
      <MetricBlock
        label="7-dage window"
        value={sevenDay !== undefined ? `${sevenDay.toFixed(1)}%` : "—"}
        sub={
          claude?.liveWindows?.sevenDay
            ? `${fmtTokens(claude.liveWindows.sevenDay.tokens)} · ${claude.liveWindows.sevenDay.messages} beskeder · nulstilles ${claude.rateLimits?.sevenDay?.resetsIn ?? "—"}`
            : claude?.rateLimits?.sevenDay?.resetsIn ? `nulstilles ${claude.rateLimits.sevenDay.resetsIn}` : ""
        }
        bar={sevenDay}
        accent={accent}
      />

      {/* Token totals */}
      <MetricBlock
        label="Tokens i dag"
        value={fmtTokens(claude?.today?.total)}
        sub={
          claude?.today
            ? `${claude.today.messages ?? 0} beskeder · ind ${fmtTokens(claude.today.in)} · ud ${fmtTokens(claude.today.out)}`
            : ""
        }
        accent={accent}
      />
      <MetricBlock
        label="Tokens · uge"
        value={fmtTokens(claude?.week?.total)}
        sub={claude?.week?.messages !== undefined ? `${claude.week.messages} beskeder` : ""}
        accent={accent}
      />
      <MetricBlock
        label="Tokens · total"
        value={fmtTokens(claude?.total?.total)}
        sub={claude?.total?.messages !== undefined ? `${claude.total.messages.toLocaleString("da-DK")} beskeder all-time` : ""}
        accent={accent}
      />

      {/* Daily totals as bars */}
      {claude?.dailyTotals && claude.dailyTotals.length > 0 && (
        <div className="mt-10">
          <div className="text-[10px] uppercase tracking-[0.3em] mb-4" style={{ color: "var(--dim)" }}>Daglig brug · seneste 7 dage</div>
          <DailyBars data={claude.dailyTotals} accent={accent} />
        </div>
      )}

      {/* Recent sessions */}
      {claude?.recent && claude.recent.length > 0 && (
        <div className="mt-10">
          <div className="text-[10px] uppercase tracking-[0.3em] mb-4" style={{ color: "var(--dim)" }}>Seneste sessions</div>
          <div className="space-y-2 text-sm">
            {claude.recent.slice(0, 6).map((s) => (
              <div
                key={s.sessionId}
                className="flex items-baseline justify-between py-2 gap-3"
                style={{ borderBottom: `1px solid var(--faint)` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ color: "var(--ink)" }}>{s.project}</div>
                  <div className="text-[10px]" style={{ color: "var(--dim)" }}>
                    {new Date(s.startedAt).toLocaleString("da-DK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {" · "}
                    {fmtDuration(s.durationMs)}
                  </div>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <div className="text-sm" style={{ color: "var(--ink)" }}>{s.messageCount} beskeder</div>
                  <div className="text-[10px]" style={{ color: "var(--dim)" }}>{fmtTokens(s.tokensOut)} out</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DeepWrapper>
  );
}

function DailyBars({ data, accent }: { data: Array<{ date: string; tokens: number }>; accent: string }) {
  const max = Math.max(...data.map((d) => d.tokens), 1);
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d) => {
        const heightPct = (d.tokens / max) * 100;
        const day = new Date(d.date).toLocaleDateString("da-DK", { weekday: "short" });
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <div className="w-full flex flex-col items-center" style={{ height: "100%", justifyContent: "flex-end" }}>
              <div
                className="w-full transition-all"
                style={{
                  height: `${heightPct}%`,
                  background: accent,
                  opacity: 0.8,
                  borderRadius: "2px 2px 0 0",
                  minHeight: "2px",
                }}
              />
            </div>
            <div className="text-[9px] tabular-nums" style={{ color: "var(--dim)" }}>{day}</div>
            <div className="text-[10px] tabular-nums truncate w-full text-center" style={{ color: "var(--ink)" }}>
              {fmtTokens(d.tokens)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MediaDeepDive({ jellyfin, sabnzbd }: { jellyfin: JellyfinData | undefined; sabnzbd: SabnzbdData | undefined }) {
  const accent = "#a78bfa";
  const sessions = jellyfin?.sessions ?? [];
  return (
    <DeepWrapper>
      <DeepHeader
        title="Medie"
        sub={jellyfin?.library ? `${jellyfin.library.movies} film · ${jellyfin.library.shows} serier · ${jellyfin.library.episodes} episoder` : "jellyfin · sabnzbd"}
        accent={accent}
      />
      <MetricBlock
        label="Jellyfin"
        value={jellyfin?.online ? `${sessions.length}` : "ikke online"}
        sub={
          jellyfin?.online
            ? sessions.length > 0
              ? `${sessions[0].user} · ${sessions[0].title}`
              : "ingen aktive sessions"
            : "konfigurer i settings"
        }
        accent={accent}
      />

      {sessions.length > 0 && (
        <div className="mt-6 mb-10">
          <div className="text-[10px] uppercase tracking-[0.3em] mb-4" style={{ color: "var(--dim)" }}>Now playing</div>
          <div className="space-y-4">
            {sessions.map((s, i) => (
              <div key={i} className="py-3" style={{ borderBottom: `1px solid var(--faint)` }}>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span style={{ color: "var(--ink)" }} className="truncate text-base">{s.title}</span>
                  <span style={{ color: "var(--dim)" }} className="shrink-0 text-[11px]">
                    {s.user} · {s.player}
                    {s.paused && <span style={{ color: "#e6b450" }} className="ml-2">paused</span>}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5" style={{ background: "var(--faint)" }}>
                    <div className="h-full" style={{ width: `${s.progress}%`, background: accent }} />
                  </div>
                  <span className="tabular-nums text-[11px] shrink-0" style={{ color: "var(--dim)" }}>
                    {s.progress}% · {s.remainingMinutes}m tilbage
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <MetricBlock
        label="SABnzbd"
        value={sabnzbd?.online ? `${sabnzbd?.totalQueue ?? 0}` : "ikke online"}
        sub={
          sabnzbd?.online
            ? sabnzbd.paused
              ? "paused"
              : sabnzbd.totalQueue
                ? `${((sabnzbd.speedKbps ?? 0) / 1024).toFixed(1)} MB/s`
                : "queue tom"
            : "konfigurer i settings"
        }
        accent={accent}
      />
      {sabnzbd?.diskFreeGb !== undefined && sabnzbd.diskFreeGb !== null && (
        <MetricBlock label="Download-disk" value={`${sabnzbd.diskFreeGb.toFixed(0)} GB`} sub="ledig" accent={accent} />
      )}

      {jellyfin?.library && (
        <>
          <MetricBlock label="Bibliotek · film" value={`${jellyfin.library.movies}`} sub="i Jellyfin" accent={accent} />
          <MetricBlock label="Bibliotek · serier" value={`${jellyfin.library.shows}`} sub={`${jellyfin.library.episodes} episoder`} accent={accent} />
        </>
      )}
    </DeepWrapper>
  );
}

function FirewallDeepDive() {
  const accent = "#fb7185";
  return (
    <DeepWrapper>
      <DeepHeader title="Firewall" sub="lulu · domain-blocklists · per-app profiler" accent={accent} />
      <div className="text-sm font-light leading-relaxed" style={{ color: "var(--dim)" }}>
        Firewall-deep-dive er på sin egen fulde side. Klik nedenfor for at åbne den.
      </div>
      <a
        href="/firewall"
        className="inline-flex items-center gap-2 mt-6 text-sm hover:underline"
        style={{ color: accent }}
      >
        Åbn /firewall ↗
      </a>
      <div className="mt-12 text-[11px]" style={{ color: "var(--dim)" }}>
        Konsolideret oversigt over firewall-status er bevidst skubbet til en dedikeret side fordi den har mange interaktive tabs (live · regler · profiler · stats · apps · events).
      </div>
    </DeepWrapper>
  );
}

function AmbientDeepDive({ weather, energy }: { weather: WeatherData | undefined; energy: EnergyData | undefined }) {
  const accent = "#e6b450";
  return (
    <DeepWrapper>
      <DeepHeader title="Verden" sub={weather?.location ?? "—"} accent={accent} />
      <MetricBlock label="Temperatur" value={weather?.current?.temp !== undefined ? `${weather.current.temp}°` : "—"} sub={weather?.current?.feelsLike !== undefined ? `føles ${weather.current.feelsLike}° · vind ${weather.current.windSpeed ?? "—"} m/s` : ""} accent={accent} />
      <MetricBlock label="Fugt" value={weather?.current?.humidity !== undefined ? `${weather.current.humidity}%` : "—"} accent={accent} />
      <MetricBlock label="Sol" value={weather?.sun?.sunrise ?? "—"} sub={weather?.sun?.sunset ? `→ ${weather.sun.sunset} · ${Math.floor((weather.sun.dayLengthMinutes ?? 0) / 60)}t ${(weather.sun.dayLengthMinutes ?? 0) % 60}m dagslys` : ""} accent={accent} />
      <MetricBlock label="Elpris" value={energy?.priceDK2Kr !== undefined ? `${energy.priceDK2Kr.toFixed(2)} kr/kWh` : "—"} sub={energy?.greenPct !== undefined ? `grøn ${energy.greenPct}% · CO₂ ${energy?.co2GPerKwh ?? "—"} g/kWh` : ""} accent={accent} />
      <MetricBlock label="Region" value={energy?.region ?? "DK2"} sub="elnet-zone" accent={accent} />
    </DeepWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Apps
// ─────────────────────────────────────────────────────────────────────

interface AppHealthRecord {
  id: string;
  status: "ok" | "down" | "unknown";
  latencyMs?: number;
}

function useAppHealth() {
  const { data } = usePoll<{ apps: AppHealthRecord[] }>("/api/apps/health", 60_000);
  return useMemo(() => {
    const m = new Map<string, AppHealthRecord>();
    for (const h of data?.apps ?? []) m.set(h.id, h);
    return m;
  }, [data]);
}

function AppsRow({ limit }: { limit: number }) {
  const health = useAppHealth();
  const [hostHint, setHostHint] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") setHostHint(window.location.hostname);
  }, []);

  const visible = DEFAULT_APPS
    .filter((a) => a.kind === "web" || a.kind === "native-mac" || (a.kind === "external" && a.id === "sparkhub"))
    .slice(0, limit);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {visible.map((app) => (
        <AppTile key={app.id} app={app} health={health.get(app.id)} hostHint={hostHint} compact />
      ))}
    </div>
  );
}

function AppsGrid() {
  const accent = "#22d3ee";
  const health = useAppHealth();
  const [hostHint, setHostHint] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") setHostHint(window.location.hostname);
  }, []);

  const groups = useMemo(() => {
    return {
      egne: DEFAULT_APPS.filter((a) => a.kind === "web"),
      tailscale: DEFAULT_APPS.filter((a) => a.kind === "external" && a.id === "sparkhub"),
      eksterne: DEFAULT_APPS.filter((a) => a.kind === "external" && a.id !== "sparkhub"),
      native: DEFAULT_APPS.filter((a) => a.kind === "native-mac" || a.kind === "native-ios"),
      daemons: DEFAULT_APPS.filter((a) => a.kind === "daemon"),
    };
  }, []);

  return (
    <DeepWrapper>
      <DeepHeader title="Apps" sub="genvej til alle dine apps" accent={accent} />

      <Group title="Egne web-services" count={groups.egne.length} accent={accent}>
        <Grid>
          {groups.egne.map((a) => (
            <AppTile key={a.id} app={a} health={health.get(a.id)} hostHint={hostHint} />
          ))}
        </Grid>
      </Group>

      <Group title="Tailscale noder" count={groups.tailscale.length} accent={accent}>
        <Grid>
          {groups.tailscale.map((a) => (
            <AppTile key={a.id} app={a} health={health.get(a.id)} hostHint={hostHint} />
          ))}
        </Grid>
      </Group>

      <Group title="Eksterne tjenester" count={groups.eksterne.length} accent={accent}>
        <Grid>
          {groups.eksterne.map((a) => (
            <AppTile key={a.id} app={a} health={health.get(a.id)} hostHint={hostHint} />
          ))}
        </Grid>
      </Group>

      <Group title="Native apps" count={groups.native.length} accent={accent}>
        <Grid>
          {groups.native.map((a) => (
            <AppTile key={a.id} app={a} health={health.get(a.id)} hostHint={hostHint} />
          ))}
        </Grid>
      </Group>

      {groups.daemons.length > 0 && (
        <Group title="Daemons" count={groups.daemons.length} accent={accent}>
          <Grid>
            {groups.daemons.map((a) => (
              <AppTile key={a.id} app={a} health={health.get(a.id)} hostHint={hostHint} />
            ))}
          </Grid>
        </Group>
      )}
    </DeepWrapper>
  );
}

function Group({ title, count, accent, children }: { title: string; count: number; accent: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-xl font-light" style={{ color: "var(--ink)", fontFamily: SERIF }}>{title}</h3>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--dim)" }}>
          {count} <span style={{ color: accent }}>·</span> tilgængelige
        </span>
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      {children}
    </div>
  );
}

function AppTile({ app, health, hostHint, compact }: { app: AppEntry; health?: AppHealthRecord; hostHint: string; compact?: boolean }) {
  const url = pickAppUrl(app, hostHint);
  const isClickable = app.kind === "native-mac" || app.kind === "native-ios" || !!url;
  const status = health?.status ?? (app.kind === "external" ? "unknown" : "unknown");
  const statusColor = status === "ok" ? "var(--online)" : status === "down" ? "#d87373" : "var(--dim-more)";

  const onClick = async () => {
    if (!isClickable) return;
    if (app.kind === "native-mac") {
      try {
        const res = await fetch(`/api/apps/launch?id=${app.id}`, { method: "POST" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          alert(`Kunne ikke åbne ${app.name}: ${j.error ?? res.status}`);
        }
      } catch (err) {
        alert(`Fejl: ${String(err)}`);
      }
      return;
    }
    if (app.kind === "native-ios") {
      alert(`${app.name} er en iOS-app. ${app.iosNote ?? "Åbn den på din iPhone."}`);
      return;
    }
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className="group text-left transition-colors hover:bg-[var(--paper-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: "var(--paper-elev)",
        border: `1px solid var(--faint)`,
        borderRadius: 8,
        padding: compact ? "10px 12px" : "14px 16px",
      }}
    >
      <div className="flex items-start justify-between mb-1">
        <span className="text-xl" style={{ color: "var(--ink)" }}>{app.icon}</span>
        <span className="w-1.5 h-1.5 rounded-full mt-1.5" style={{ background: statusColor }} />
      </div>
      <div className="text-sm font-light truncate" style={{ color: "var(--ink)" }}>{app.name}</div>
      {!compact && (
        <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--dim)" }}>
          {app.description}
        </div>
      )}
    </button>
  );
}
