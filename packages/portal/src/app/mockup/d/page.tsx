import { FAKE } from "../_fakes";

/** D — Focus Mode
 * One thing first. Stripe / Linear deployment view.
 * Hero dominates above-the-fold with 4 KPIs + sparklines. Everything else
 * scrolls below. No card-borders, generous whitespace, single accent color.
 */

const ACCENT = "#38bdf8";
const DIM = "rgba(229,229,229,0.5)";
const FAINT = "rgba(229,229,229,0.25)";

// Inline sparkline component
function Spark({ data, height = 28 }: { data: number[]; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const norm = (v: number) => height - ((v - min) / (max - min || 1)) * (height - 2) - 1;
  const step = 100 / (data.length - 1);
  const d = data.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${norm(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <path d={`${d} L100,${height} L0,${height} Z`} fill={`${ACCENT}15`} />
      <path d={d} stroke={ACCENT} strokeWidth="1" fill="none" />
    </svg>
  );
}

const CPU_TREND = [12, 14, 18, 16, 22, 19, 18, 15, 17, 21, 19, 18];
const RAM_TREND = [38, 40, 42, 41, 43, 44, 42, 41, 42, 41, 42, 42];
const DISK_TREND = [39, 39, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40];
const NET_TREND = [2, 8, 15, 22, 18, 25, 30, 12, 8, 4, 6, 8];

export default function Page() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200" style={{ fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }}>
      {/* Compact top-bar */}
      <header
        className="flex items-center justify-between px-8 py-4 text-[11px] uppercase tracking-wider"
        style={{ borderBottom: `1px solid ${FAINT}`, color: DIM }}
      >
        <div>
          skynet<span className="text-neutral-600">.live</span>
          <span className="mx-3 text-neutral-700">·</span>
          <span>cockpit / focus mode</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#7dd67d" }} />
          <span>online · {FAKE.status.uptime}</span>
          <span className="text-neutral-700">·</span>
          <span style={{ color: ACCENT }}>{FAKE.time}</span>
        </div>
      </header>

      {/* HERO — fylder above-the-fold */}
      <main className="max-w-6xl mx-auto px-8 pt-24 pb-16">
        <div className="mb-20">
          <div className="text-[11px] uppercase tracking-[0.3em] mb-4" style={{ color: DIM }}>
            mandag · {FAKE.date.toLowerCase()} · uge 17
          </div>
          <h1
            className="text-[120px] leading-[0.95] font-extralight tracking-tight tabular-nums"
            style={{ color: "#f5f5f5" }}
          >
            {FAKE.time}
          </h1>
          <div className="mt-4 text-xl font-light text-neutral-300">
            god aften, Parthee. <span className="text-neutral-500">☀ {FAKE.weather.sunrise} → 🌙 {FAKE.weather.sunset}</span>
          </div>
          <p className="text-sm font-light italic max-w-xl mt-8" style={{ color: DIM }}>
            &ldquo;{FAKE.quote}&rdquo;
          </p>
        </div>

        {/* 4 KPI'er — primær fokus */}
        <section className="grid grid-cols-4 gap-12 mb-16">
          {[
            { label: "CPU", value: FAKE.cpu.load, unit: "%", sub: FAKE.cpu.brand, data: CPU_TREND },
            { label: "RAM", value: FAKE.mem.percent, unit: "%", sub: `${FAKE.mem.used} / ${FAKE.mem.total} GB`, data: RAM_TREND },
            { label: "DISK", value: FAKE.disk.percent, unit: "%", sub: `${FAKE.disk.used} af ${FAKE.disk.total}`, data: DISK_TREND },
            { label: "NET", value: 8, unit: "Mbps", sub: `↓ ${FAKE.status.net.down}`, data: NET_TREND },
          ].map((k) => (
            <div key={k.label}>
              <div className="text-[10px] uppercase tracking-[0.3em] mb-3" style={{ color: DIM }}>
                {k.label}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-6xl font-extralight leading-none tabular-nums" style={{ color: "#f5f5f5" }}>
                  {k.value}
                </span>
                <span className="text-sm font-light" style={{ color: DIM }}>{k.unit}</span>
              </div>
              <div className="text-[11px] mt-2 truncate" style={{ color: DIM }}>{k.sub}</div>
              <div className="mt-4 opacity-80">
                <Spark data={k.data} />
              </div>
            </div>
          ))}
        </section>

        {/* Sammensatte status — 2 linjer */}
        <section className="space-y-1 text-sm font-light" style={{ borderTop: `1px solid ${FAINT}`, paddingTop: "1.5rem" }}>
          <div className="flex items-center gap-4 py-1">
            <span className="w-1 h-1 rounded-full" style={{ background: ACCENT }} />
            <span className="w-40" style={{ color: DIM }}>Claude</span>
            <span className="flex-1 max-w-md">
              <span className="inline-block h-1 align-middle mr-3" style={{ width: 240, background: FAINT }}>
                <span className="inline-block h-1" style={{ width: 240 * 0.62, background: ACCENT }} />
              </span>
              <span className="tabular-nums" style={{ color: "#f5f5f5" }}>62%</span>
              <span className="ml-2" style={{ color: DIM }}>5h window</span>
            </span>
            <span className="text-neutral-700">·</span>
            <span style={{ color: DIM }}>{FAKE.claude.today} tokens i dag</span>
          </div>

          <div className="flex items-center gap-4 py-1">
            <span className="w-1 h-1 rounded-full" style={{ background: "#10b981" }} />
            <span className="w-40" style={{ color: DIM }}>GitHub</span>
            <span style={{ color: "#f5f5f5" }} className="tabular-nums">17 commits</span>
            <span style={{ color: DIM }}>i dag</span>
            <span className="text-neutral-700">·</span>
            <span style={{ color: DIM }}>seneste: feat: 5 nye cockpit mockups</span>
          </div>

          <div className="flex items-center gap-4 py-1">
            <span className="w-1 h-1 rounded-full" style={{ background: "#7dd67d" }} />
            <span className="w-40" style={{ color: DIM }}>Services</span>
            <span style={{ color: "#f5f5f5" }}>10/10 oppe</span>
            <span className="text-neutral-700">·</span>
            <span style={{ color: DIM }}>firewall {FAKE.traffic.active}% sundt · paseo idle 12m</span>
          </div>

          <div className="flex items-center gap-4 py-1">
            <span className="w-1 h-1 rounded-full" style={{ background: "#8b5cf6" }} />
            <span className="w-40" style={{ color: DIM }}>Medie</span>
            <span style={{ color: "#f5f5f5" }}>{FAKE.plex.nowPlaying} ser nu</span>
            <span style={{ color: DIM }}>·</span>
            <span style={{ color: DIM }}>{FAKE.plex.sessions}</span>
          </div>

          <div className="flex items-center gap-4 py-1">
            <span className="w-1 h-1 rounded-full" style={{ background: "#e6b450" }} />
            <span className="w-40" style={{ color: DIM }}>Vejret</span>
            <span style={{ color: "#f5f5f5" }}>{FAKE.weather.temp}°</span>
            <span style={{ color: DIM }}>{FAKE.weather.condition.toLowerCase()} · {FAKE.weather.city}</span>
          </div>
        </section>

        {/* Under-fold marker */}
        <div className="mt-32 mb-12 flex items-center gap-4 text-[10px] uppercase tracking-[0.4em]" style={{ color: FAINT }}>
          <span className="flex-1 h-px" style={{ background: FAINT }} />
          <span>scroll for detaljer</span>
          <span className="flex-1 h-px" style={{ background: FAINT }} />
        </div>

        {/* Under-fold sektioner */}
        <section className="grid grid-cols-2 gap-12 mb-20">
          {/* Top processes */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] mb-4" style={{ color: DIM }}>
              CPU · top processer
            </div>
            <div className="space-y-1.5">
              {FAKE.cpu.top.map((p) => (
                <div key={p.name} className="flex items-baseline justify-between py-1.5 border-b text-sm font-light" style={{ borderColor: FAINT }}>
                  <span className="truncate" style={{ color: "#e5e5e5" }}>{p.name}</span>
                  <span className="tabular-nums" style={{ color: ACCENT }}>{p.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top memory */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] mb-4" style={{ color: DIM }}>
              Hukommelse · top processer
            </div>
            <div className="space-y-1.5">
              {FAKE.mem.top.map((p) => (
                <div key={p.name} className="flex items-baseline justify-between py-1.5 border-b text-sm font-light" style={{ borderColor: FAINT }}>
                  <span className="truncate" style={{ color: "#e5e5e5" }}>{p.name}</span>
                  <span className="tabular-nums" style={{ color: ACCENT }}>{p.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="pt-8 text-[10px] uppercase tracking-[0.3em] flex justify-between" style={{ color: DIM, borderTop: `1px solid ${FAINT}` }}>
          <span>focus mode · /mockup/d</span>
          <span>{FAKE.date} · {FAKE.time}</span>
        </footer>
      </main>
    </div>
  );
}
