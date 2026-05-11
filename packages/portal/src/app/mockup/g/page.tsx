"use client";
import { useState } from "react";
import { FAKE } from "../_fakes";

/** G — Sidebar Workspace
 * Én kategori ad gangen. Notion / Linear / macOS Settings.
 * 220px sidebar venstre, deep-dive hovedområde med sparklines + history.
 */

const ACCENT = "#22d3ee";
const DIM = "rgba(229,229,229,0.55)";
const FAINT = "rgba(229,229,229,0.12)";

type CatId = "system" | "code" | "media" | "agents" | "firewall" | "ambient";

const CATEGORIES: { id: CatId; label: string; icon: string; color: string; count?: string }[] = [
  { id: "system", label: "System", icon: "▦", color: "#38bdf8", count: `${FAKE.cpu.load}%` },
  { id: "code", label: "Kode", icon: "◆", color: "#10b981", count: "17 commits" },
  { id: "media", label: "Medie", icon: "▶", color: "#8b5cf6", count: `${FAKE.plex.nowPlaying} ser` },
  { id: "agents", label: "Agents", icon: "◉", color: "#06b6d4", count: "idle" },
  { id: "firewall", label: "Firewall", icon: "🛡", color: "#fb7185", count: "ok" },
  { id: "ambient", label: "Verden", icon: "☁", color: "#e6b450", count: `${FAKE.weather.temp}°` },
];

function Spark({ data, color = ACCENT }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const h = 60;
  const norm = (v: number) => h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
  const step = 100 / (data.length - 1);
  const d = data.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${norm(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }}>
      <defs>
        <linearGradient id={`grad-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L100,${h} L0,${h} Z`} fill={`url(#grad-${color.slice(1)})`} />
      <path d={d} stroke={color} strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function MetricBlock({ label, value, sub, sparkData, color = ACCENT, pct }: { label: string; value: string; sub?: string; sparkData?: number[]; color?: string; pct?: number }) {
  return (
    <div className="py-8" style={{ borderBottom: `1px solid ${FAINT}` }}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs uppercase tracking-[0.3em]" style={{ color: DIM }}>{label}</span>
        <span className="text-4xl font-extralight tabular-nums" style={{ color: "#f5f5f5" }}>{value}</span>
      </div>
      {sub && <div className="text-[11px] mb-3" style={{ color: DIM }}>{sub}</div>}
      {typeof pct === "number" && (
        <div className="h-1 mt-3" style={{ background: FAINT }}>
          <div className="h-full" style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
      {sparkData && (
        <div className="mt-3 opacity-90">
          <Spark data={sparkData} color={color} />
          <div className="flex justify-between text-[10px] mt-1 tabular-nums" style={{ color: DIM }}>
            <span>24t siden</span>
            <span>nu</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const [active, setActive] = useState<CatId>("system");

  return (
    <div
      className="min-h-screen flex bg-[#0a0a0a] text-neutral-200"
      style={{ fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      {/* Sidebar */}
      <nav
        className="w-[220px] shrink-0 flex flex-col"
        style={{ borderRight: `1px solid ${FAINT}`, background: "#0c0c0c" }}
      >
        <div className="px-5 py-5" style={{ borderBottom: `1px solid ${FAINT}` }}>
          <div className="text-neutral-100">skynet<span className="text-neutral-600">.live</span></div>
          <div className="text-[10px] uppercase tracking-[0.3em] mt-1" style={{ color: DIM }}>workspace</div>
        </div>

        <div className="flex flex-col py-3">
          {CATEGORIES.map((cat) => {
            const isActive = active === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActive(cat.id)}
                className="flex items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
                style={{
                  color: isActive ? "#f5f5f5" : DIM,
                  background: isActive ? "rgba(34,211,238,0.05)" : "transparent",
                  borderLeft: `3px solid ${isActive ? cat.color : "transparent"}`,
                }}
              >
                <span className="w-5 text-base" style={{ color: isActive ? cat.color : DIM }}>{cat.icon}</span>
                <span className="flex-1 text-sm">{cat.label}</span>
                {cat.count && (
                  <span className="text-[10px] tabular-nums" style={{ color: isActive ? cat.color : DIM }}>
                    {cat.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-auto px-5 py-4 text-[10px]" style={{ borderTop: `1px solid ${FAINT}`, color: DIM }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#7dd67d" }} />
            <span>online · {FAKE.status.uptime}</span>
          </div>
          <div className="tabular-nums">load {FAKE.status.load} · {FAKE.status.procs} proc</div>
          <div className="tabular-nums mt-1" style={{ color: ACCENT }}>{FAKE.time}</div>
        </div>
      </nav>

      {/* Main area */}
      <main className="flex-1 px-12 py-10 overflow-auto">
        <header className="flex items-baseline justify-between mb-10">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] mb-1" style={{ color: DIM }}>
              workspace · {FAKE.date.toLowerCase()}
            </div>
            <h1 className="text-4xl font-light" style={{ color: "#f5f5f5" }}>
              {CATEGORIES.find((c) => c.id === active)?.label}
            </h1>
          </div>
          <div className="text-right text-[11px]" style={{ color: DIM }}>
            <div>last refresh</div>
            <div className="tabular-nums" style={{ color: "#f5f5f5" }}>{FAKE.time}</div>
          </div>
        </header>

        {active === "system" && (
          <>
            <MetricBlock
              label="CPU"
              value={`${FAKE.cpu.load}%`}
              sub={`${FAKE.cpu.brand} · ${FAKE.cpu.cores} kerner`}
              pct={FAKE.cpu.load}
              color="#38bdf8"
              sparkData={[12, 14, 18, 16, 22, 19, 18, 15, 17, 21, 19, 18]}
            />
            <MetricBlock
              label="Hukommelse"
              value={`${FAKE.mem.percent}%`}
              sub={`${FAKE.mem.used} / ${FAKE.mem.total} GB · ${FAKE.status.procs} processer`}
              pct={FAKE.mem.percent}
              color="#a78bfa"
              sparkData={[38, 40, 42, 41, 43, 44, 42, 41, 42, 41, 42, 42]}
            />
            <MetricBlock
              label="Disk · Macintosh HD"
              value={`${FAKE.disk.percent}%`}
              sub={`${FAKE.disk.used} brugt af ${FAKE.disk.total} · 14.5 TB ledig`}
              pct={FAKE.disk.percent}
              color="#10b981"
            />
            <MetricBlock
              label="Netværk · en0"
              value={`↓ ${FAKE.status.net.down}`}
              sub={`↑ ${FAKE.status.net.up}`}
              color="#e6b450"
              sparkData={[2, 8, 15, 22, 18, 25, 30, 12, 8, 4, 6, 8]}
            />
          </>
        )}

        {active === "code" && (
          <>
            <MetricBlock label="Claude · 5h window" value="62%" pct={62} color="#10b981" sub={`${FAKE.claude.today} tokens i dag · ${FAKE.claude.messages} beskeder`} />
            <MetricBlock label="GitHub events" value="17" sub="commits i dag · seneste: feat: 5 nye mockups" color="#10b981" sparkData={[3, 5, 8, 4, 12, 7, 9, 11, 15, 17, 14, 17]} />
            <MetricBlock label="Paseo agents" value="idle" sub="claude idle siden 21:23 · 12m · ready" color="#10b981" />
            <div className="mt-8">
              <div className="text-[10px] uppercase tracking-[0.3em] mb-4" style={{ color: DIM }}>Top repositories</div>
              <div className="space-y-2 text-sm font-light">
                {["skynet", "heimdall", "bifrost", "saga", "odin"].map((r, i) => (
                  <div key={r} className="flex items-baseline justify-between py-2" style={{ borderBottom: `1px solid ${FAINT}` }}>
                    <span style={{ color: "#f5f5f5" }}>Parthee-Vijaya/{r}</span>
                    <span className="tabular-nums" style={{ color: DIM }}>{17 - i * 3} commits · ★ {42 - i * 5}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {active === "media" && (
          <>
            <MetricBlock label="Jellyfin · F.R.I.D.A.Y" value={`${FAKE.plex.nowPlaying}`} sub={`ser nu · ${FAKE.plex.sessions}`} color="#8b5cf6" />
            <MetricBlock label="SABnzbd" value="tom" sub={`queue tom · ${FAKE.disk.used} brugt af ${FAKE.disk.total}`} color="#8b5cf6" />
            <MetricBlock label="Sonarr v4" value="3" sub="i queue · 2 underway · 1 venter" color="#8b5cf6" />
            <MetricBlock label="Radarr v6" value="1" sub="i queue · uptime 47m" color="#8b5cf6" />
          </>
        )}

        {active === "agents" && (
          <>
            <MetricBlock label="Paseo · claude" value="idle" sub="12 min siden seneste opgave · ready til ny" color="#06b6d4" />
            <MetricBlock label="Research-agent" value="kører" sub="email-research daemon · seneste 21:15" color="#06b6d4" />
            <MetricBlock label="Bifrost auto-mode" value="aktiv" sub="3 betroede intents · 2 i approval-queue" color="#06b6d4" />
            <MetricBlock label="Telegram bot" value="online" sub="@SkySaga_bot · 47 beskeder i dag" color="#06b6d4" />
          </>
        )}

        {active === "firewall" && (
          <>
            <MetricBlock label="LuLu firewall" value={`${FAKE.traffic.active}%`} sub={`${FAKE.cpu.cores * 2} apps tracked over 24t · alle grade A`} pct={FAKE.traffic.active} color="#fb7185" />
            <MetricBlock label="Aktiv profil" value="kontor" sub="Wi-Fi auto-switch · 23 baseline rules" color="#fb7185" />
            <MetricBlock label="High-risk" value="0" sub="ingen high-risk forbindelser sidste time" color="#fb7185" />
            <div className="mt-8">
              <div className="text-[10px] uppercase tracking-[0.3em] mb-4" style={{ color: DIM }}>Domain-blocklists</div>
              <div className="space-y-2 text-sm font-light">
                {[["OISD Small", "56.785 domæner"], ["Steven Black", "~140k"], ["EasyPrivacy", "~12k"]].map(([n, c]) => (
                  <div key={n} className="flex justify-between py-2" style={{ borderBottom: `1px solid ${FAINT}` }}>
                    <span style={{ color: "#f5f5f5" }}>{n}</span>
                    <span style={{ color: DIM }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {active === "ambient" && (
          <>
            <MetricBlock label={`Vejr · ${FAKE.weather.city}`} value={`${FAKE.weather.temp}°`} sub={`${FAKE.weather.condition} · føles ${FAKE.weather.feels}° · vind ${FAKE.weather.wind} m/s`} color="#e6b450" sparkData={[10, 9, 8, 8, 9, 10, 11, 12, 12, 11, 11, 10]} />
            <MetricBlock label="Elpris · DK2" value={`${FAKE.energy.price.toFixed(2)} kr`} sub={`grøn ${FAKE.energy.green}% · CO₂ ${FAKE.energy.co2} g/kWh`} color="#e6b450" />
            <MetricBlock label="Luft · AQI" value={`${FAKE.air.aqi}`} sub={`${FAKE.air.label} · PM2.5 ${FAKE.air.pm25}`} color="#10b981" />
            <MetricBlock label="Måne" value={`${FAKE.weather.moonIllumination}%`} sub={`${FAKE.weather.moonName} · fuldmåne om ${FAKE.weather.fullmoonIn}`} color="#a78bfa" />
            <MetricBlock label="Rumvejr · Kp" value={FAKE.space.kp.toFixed(1)} sub={`aurora: ${FAKE.space.aurora.toLowerCase()} · solvind ${FAKE.space.solarWind} km/s`} color="#06b6d4" />
          </>
        )}

        <footer className="mt-16 pt-6 text-[10px] uppercase tracking-[0.3em] flex justify-between" style={{ color: DIM, borderTop: `1px solid ${FAINT}` }}>
          <span>workspace · /mockup/g</span>
          <span>{FAKE.date} · {FAKE.time}</span>
        </footer>
      </main>
    </div>
  );
}
