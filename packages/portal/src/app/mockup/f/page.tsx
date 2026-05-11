import { FAKE } from "../_fakes";

/** F — Editorial Magazine
 * Æstetisk hverdag. NYT digital / Apple News+ / Vercel v0.
 * Stor centreret klokke som "cover", 4 sektioner separeret af typografi.
 * Ingen card-borders, hierarki via skala + whitespace.
 */

const PAPER = "#e8e3d8";
const INK = "#181613";
const DIM = "#6b6258";
const FAINT = "#bdb6a8";

function MetricLine({ label, value, bar, sub }: { label: string; value: string; bar?: number; sub?: string }) {
  return (
    <div className="flex items-baseline gap-4 py-2 border-b border-current/10">
      <span className="w-24 text-sm font-light" style={{ color: DIM }}>{label}</span>
      {typeof bar === "number" && (
        <span className="font-mono text-xs select-none" style={{ color: INK }}>
          {"▓".repeat(Math.round(bar / 10))}
          <span style={{ color: FAINT }}>{"░".repeat(10 - Math.round(bar / 10))}</span>
        </span>
      )}
      <span className="text-base tabular-nums" style={{ color: INK }}>{value}</span>
      {sub && <span className="text-xs ml-auto font-light" style={{ color: DIM }}>{sub}</span>}
    </div>
  );
}

export default function Page() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: PAPER,
        color: INK,
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <div className="max-w-5xl mx-auto px-10 py-16">
        {/* Masthead */}
        <header className="flex items-baseline justify-between mb-24 text-[10px] uppercase tracking-[0.4em]" style={{ color: DIM }}>
          <span>skynet · personlig intelligens</span>
          <span>nr. 247 · {FAKE.date.toLowerCase()}</span>
        </header>

        {/* Cover: stor klokke */}
        <section className="text-center mb-24">
          <div className="text-[10px] uppercase tracking-[0.5em] mb-8" style={{ color: DIM }}>
            denne time
          </div>
          <h1
            className="text-[200px] leading-[0.85] font-light tracking-[-0.04em] tabular-nums"
            style={{ color: INK, fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {FAKE.time}
          </h1>
          <div className="mt-10 text-lg font-light" style={{ color: INK }}>
            {FAKE.date} · uge 17 · {FAKE.weather.city}
          </div>
          <div className="mt-3 text-sm font-light" style={{ color: DIM }}>
            god aften, Parthee — solen står op {FAKE.weather.sunrise}, ned {FAKE.weather.sunset}
            <span className="mx-3">·</span>
            ♉ Tyren
          </div>

          {/* Quote pull-out */}
          <blockquote
            className="mt-16 max-w-2xl mx-auto text-2xl font-light italic leading-snug"
            style={{ color: INK, fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            &ldquo;{FAKE.quote}&rdquo;
          </blockquote>
        </section>

        {/* Section divider */}
        <div className="flex items-center gap-6 mb-16">
          <span className="flex-1 h-px" style={{ background: FAINT }} />
          <span className="text-[10px] uppercase tracking-[0.5em]" style={{ color: DIM }}>tilstand</span>
          <span className="flex-1 h-px" style={{ background: FAINT }} />
        </div>

        {/* 4 sektioner i 2×2 */}
        <section className="grid grid-cols-2 gap-x-20 gap-y-16">
          {/* System */}
          <article>
            <header className="mb-5">
              <h2 className="text-3xl font-light tracking-tight" style={{ color: INK, fontFamily: "Georgia, serif" }}>System</h2>
              <div className="text-[10px] uppercase tracking-[0.3em] mt-1" style={{ color: DIM }}>
                {FAKE.cpu.brand} · {FAKE.status.uptime} oppe
              </div>
            </header>
            <MetricLine label="cpu" value={`${FAKE.cpu.load}%`} bar={FAKE.cpu.load} sub={`${FAKE.cpu.cores} kerner`} />
            <MetricLine label="ram" value={`${FAKE.mem.percent}%`} bar={FAKE.mem.percent} sub={`${FAKE.mem.used} / ${FAKE.mem.total} GB`} />
            <MetricLine label="disk" value={`${FAKE.disk.percent}%`} bar={FAKE.disk.percent} sub={`${FAKE.disk.used} af ${FAKE.disk.total}`} />
            <MetricLine label="net" value={`↓ ${FAKE.status.net.down}`} sub={`↑ ${FAKE.status.net.up}`} />
            <MetricLine label="load" value={FAKE.status.load} sub={`${FAKE.status.procs} processer`} />
          </article>

          {/* Code */}
          <article>
            <header className="mb-5">
              <h2 className="text-3xl font-light tracking-tight" style={{ color: INK, fontFamily: "Georgia, serif" }}>Kode</h2>
              <div className="text-[10px] uppercase tracking-[0.3em] mt-1" style={{ color: DIM }}>
                claude · github · paseo
              </div>
            </header>
            <MetricLine label="claude" value="62%" bar={62} sub={`${FAKE.claude.today} i dag`} />
            <MetricLine label="window" value={FAKE.claude.week} sub="ugentlig brug" />
            <MetricLine label="github" value="17 commits" sub="i dag" />
            <MetricLine label="paseo" value="idle" sub="12 min · ready" />
            <MetricLine label="seneste" value="abc4f7e" sub="feat: 5 nye mockups" />
          </article>

          {/* Media */}
          <article>
            <header className="mb-5">
              <h2 className="text-3xl font-light tracking-tight" style={{ color: INK, fontFamily: "Georgia, serif" }}>Medie</h2>
              <div className="text-[10px] uppercase tracking-[0.3em] mt-1" style={{ color: DIM }}>
                jellyfin · sabnzbd · sonarr · radarr
              </div>
            </header>
            <MetricLine label="jellyfin" value={`${FAKE.plex.nowPlaying} ser nu`} sub={FAKE.plex.sessions} />
            <MetricLine label="sabnzbd" value="tom" sub="13.2 TB ledig" />
            <MetricLine label="sonarr" value="3 i kø" sub="2 underway · 1 venter" />
            <MetricLine label="radarr" value="1 i kø" sub={FAKE.status.uptime} />
            <MetricLine label="streams" value={`${FAKE.plex.streams} aktive`} sub="seneste døgn" />
          </article>

          {/* Ambient */}
          <article>
            <header className="mb-5">
              <h2 className="text-3xl font-light tracking-tight" style={{ color: INK, fontFamily: "Georgia, serif" }}>Verden</h2>
              <div className="text-[10px] uppercase tracking-[0.3em] mt-1" style={{ color: DIM }}>
                vejr · elpris · rum
              </div>
            </header>
            <MetricLine label="vejr" value={`${FAKE.weather.temp}°`} sub={`${FAKE.weather.condition} · føles ${FAKE.weather.feels}°`} />
            <MetricLine label="vind" value={`${FAKE.weather.wind} m/s`} sub={`fugt ${FAKE.weather.humidity}%`} />
            <MetricLine label="elpris" value={`${FAKE.energy.price.toFixed(2)} kr/kWh`} sub={`grøn ${FAKE.energy.green}%`} />
            <MetricLine label="luft" value={`AQI ${FAKE.air.aqi}`} sub={FAKE.air.label} />
            <MetricLine label="kp" value={FAKE.space.kp.toFixed(1)} sub={`aurora: ${FAKE.space.aurora.toLowerCase()}`} />
          </article>
        </section>

        {/* Discover/On-this-day — kompakt */}
        <section className="mt-24 pt-16 border-t" style={{ borderColor: FAINT }}>
          <div className="text-[10px] uppercase tracking-[0.5em] mb-6" style={{ color: DIM }}>
            {FAKE.discover.source}
          </div>
          <h3 className="text-4xl font-light mb-4 tracking-tight" style={{ color: INK, fontFamily: "Georgia, serif" }}>
            {FAKE.discover.title}
          </h3>
          <p className="text-base font-light max-w-3xl leading-relaxed" style={{ color: INK }}>
            {FAKE.discover.body}
          </p>
        </section>

        {/* Footer */}
        <footer className="mt-20 pt-8 text-[10px] uppercase tracking-[0.4em] flex justify-between" style={{ color: DIM, borderTop: `1px solid ${FAINT}` }}>
          <span>editorial · /mockup/f</span>
          <span>{FAKE.date} · {FAKE.time}</span>
        </footer>
      </div>
    </div>
  );
}
