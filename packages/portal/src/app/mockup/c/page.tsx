import { FAKE } from "../_fakes";

/** C — Cinema Minimal
 * Deep black, huge thin typography, warm cream accent, extreme whitespace.
 * Editorial layout, everything breathes. No borders — just rhythm and scale.
 * Inspiration: Vercel v0 / Framer / Dieter Rams
 */

const CREAM = "#f5e6c8";
const DIM = "rgba(245,230,200,0.5)";

function Row({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-baseline justify-between py-2 border-b border-white/5 ${className}`}>{children}</div>;
}

export default function Page() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white" style={{ color: CREAM }}>
      <div className="max-w-6xl mx-auto px-10 py-16">
        {/* Header */}
        <header className="mb-24">
          <div className="flex items-start justify-between mb-12">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em]" style={{ color: DIM }}>
                Skynet · Personal Intelligence
              </div>
              <h1
                className="text-[140px] leading-[0.9] font-thin tracking-[-0.04em] mt-6"
                style={{ color: CREAM }}
              >
                {FAKE.time}
              </h1>
              <div className="text-xl font-light mt-4 capitalize" style={{ color: DIM }}>
                {FAKE.date} · {FAKE.weather.city}
              </div>
            </div>
            <div className="text-right text-sm max-w-xs space-y-6 pt-8">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: DIM }}>
                  Claude Code
                </div>
                <div className="flex justify-end gap-6 mt-2 font-light">
                  <div>
                    <div className="text-[10px]" style={{ color: DIM }}>I DAG</div>
                    <div className="text-lg">{FAKE.claude.today}</div>
                  </div>
                  <div>
                    <div className="text-[10px]" style={{ color: DIM }}>UGE</div>
                    <div className="text-lg">{FAKE.claude.week}</div>
                  </div>
                  <div>
                    <div className="text-[10px]" style={{ color: DIM }}>TOTAL</div>
                    <div className="text-lg">{FAKE.claude.total}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-2xl font-extralight italic max-w-2xl leading-snug" style={{ color: DIM }}>
            &ldquo;{FAKE.quote}&rdquo;
          </p>
        </header>

        {/* Discover hero — full bleed dark image */}
        <section className="mb-24 -mx-10">
          <div className="relative aspect-[21/9] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FAKE.discover.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
            <div className="absolute inset-0 flex flex-col justify-end p-12">
              <div className="text-[10px] uppercase tracking-[0.4em] mb-6" style={{ color: DIM }}>
                {FAKE.discover.source}
              </div>
              <h2 className="text-6xl font-thin tracking-tight mb-4" style={{ color: CREAM }}>
                {FAKE.discover.title}
              </h2>
              <p className="text-lg font-light max-w-2xl leading-relaxed" style={{ color: DIM }}>
                {FAKE.discover.body}
              </p>
              <div className="flex gap-1 mt-8">
                {Array.from({ length: FAKE.discover.total }).map((_, i) => (
                  <span
                    key={i}
                    className="h-px transition-all"
                    style={{
                      width: i === FAKE.discover.progress ? 40 : 12,
                      backgroundColor: i === FAKE.discover.progress ? CREAM : "rgba(245,230,200,0.15)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Weather — editorial spread */}
        <section className="mb-24 grid grid-cols-12 gap-8">
          <div className="col-span-8">
            <div className="text-[10px] uppercase tracking-[0.4em] mb-6" style={{ color: DIM }}>
              Vejr · Måne
            </div>
            <div className="flex items-start gap-6">
              <div
                className="text-[180px] leading-[0.85] font-thin tracking-[-0.06em]"
                style={{ color: CREAM }}
              >
                {FAKE.weather.temp}°
              </div>
              <div className="pt-4 space-y-2">
                <div className="text-2xl font-light" style={{ color: CREAM }}>{FAKE.weather.condition}</div>
                <div className="text-sm font-light" style={{ color: DIM }}>
                  Føles {FAKE.weather.feels}°
                </div>
                <div className="text-sm font-light" style={{ color: DIM }}>
                  Vind {FAKE.weather.wind} m/s
                </div>
                <div className="text-sm font-light" style={{ color: DIM }}>
                  Fugtighed {FAKE.weather.humidity}%
                </div>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-4 mt-10">
              {FAKE.weather.forecast.map((f) => (
                <div key={f.h} className="text-center">
                  <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: DIM }}>{f.h}</div>
                  <div className="text-2xl my-2 opacity-60">{f.icon}</div>
                  <div className="text-lg font-thin" style={{ color: CREAM }}>{f.t}°</div>
                </div>
              ))}
            </div>
          </div>
          <div className="col-span-4 flex flex-col items-center justify-center">
            <div className="relative w-48 h-48 rounded-full overflow-hidden" style={{
              background: `radial-gradient(circle at 35% 35%, ${CREAM}30, transparent 60%), linear-gradient(135deg, #2a2a2a, #0a0a0a)`
            }}>
              <div className="absolute top-0 right-0 w-[55%] h-full bg-[#0a0a0a]" />
            </div>
            <div className="text-center mt-6">
              <div className="text-xs uppercase tracking-[0.3em] font-light" style={{ color: DIM }}>
                {FAKE.weather.moonName}
              </div>
              <div className="text-4xl font-thin mt-2" style={{ color: CREAM }}>
                {FAKE.weather.moonIllumination}%
              </div>
            </div>
            <div className="mt-8 w-full text-xs font-light space-y-2">
              <Row>
                <span style={{ color: DIM }}>Solopgang</span>
                <span>{FAKE.weather.sunrise}</span>
              </Row>
              <Row>
                <span style={{ color: DIM }}>Solnedgang</span>
                <span>{FAKE.weather.sunset}</span>
              </Row>
              <Row>
                <span style={{ color: DIM }}>Fuldmåne</span>
                <span>{FAKE.weather.fullmoonIn}</span>
              </Row>
            </div>
          </div>
        </section>

        {/* System — three columns of breath */}
        <section className="mb-24 grid grid-cols-3 gap-12">
          {[
            { label: "CPU", big: `${FAKE.cpu.load}`, unit: "%", sub: `${FAKE.cpu.cores} cores`, list: FAKE.cpu.top },
            { label: "Hukommelse", big: `${FAKE.mem.percent}`, unit: "%", sub: `${FAKE.mem.used} af ${FAKE.mem.total} GB`, list: FAKE.mem.top },
            { label: "Status · Net", big: `${FAKE.status.cpuPulse}`, unit: "W", sub: FAKE.status.uptime, list: null },
          ].map((col, i) => (
            <div key={i}>
              <div className="text-[10px] uppercase tracking-[0.4em] mb-6" style={{ color: DIM }}>
                {col.label}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-8xl font-thin leading-none" style={{ color: CREAM }}>
                  {col.big}
                </span>
                <span className="text-2xl font-thin" style={{ color: DIM }}>{col.unit}</span>
              </div>
              <div className="text-sm mt-3 font-light" style={{ color: DIM }}>{col.sub}</div>
              {col.list ? (
                <div className="mt-8 space-y-1 text-sm font-light">
                  {col.list.map((p) => (
                    <Row key={p.name}>
                      <span className="truncate" style={{ color: DIM }}>{p.name}</span>
                      <span>{p.pct}%</span>
                    </Row>
                  ))}
                </div>
              ) : (
                <div className="mt-8 space-y-1 text-sm font-light">
                  <Row><span style={{ color: DIM }}>Load</span><span>{FAKE.status.load}</span></Row>
                  <Row><span style={{ color: DIM }}>Processer</span><span>{FAKE.status.procs}</span></Row>
                  <Row><span style={{ color: DIM }}>Downstream</span><span>{FAKE.status.net.down}</span></Row>
                  <Row><span style={{ color: DIM }}>Upstream</span><span>{FAKE.status.net.up}</span></Row>
                  <Row><span style={{ color: DIM }}>VPN</span><span>{FAKE.status.vpn.country}</span></Row>
                  <Row><span style={{ color: DIM }}>IP</span><span className="font-mono text-[11px]">{FAKE.status.vpn.ip}</span></Row>
                </div>
              )}
            </div>
          ))}
        </section>

        {/* Elpris — hero number */}
        <section className="mb-24">
          <div className="text-[10px] uppercase tracking-[0.4em] mb-6" style={{ color: DIM }}>
            Elpris · {FAKE.energy.region}
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-baseline gap-4">
                <span className="text-[220px] font-thin leading-[0.85] tracking-[-0.06em]" style={{ color: CREAM }}>
                  {FAKE.energy.price.toFixed(2)}
                </span>
                <span className="text-xl font-thin" style={{ color: DIM }}>DKK/kWh</span>
              </div>
            </div>
            <div className="pb-8 text-right space-y-4 min-w-[200px]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: DIM }}>Grøn nu</div>
                <div className="text-4xl font-thin mt-1" style={{ color: CREAM }}>{FAKE.energy.green}%</div>
                <div className="w-full h-px mt-3 relative overflow-hidden" style={{ backgroundColor: "rgba(245,230,200,0.1)" }}>
                  <div className="absolute inset-y-0 left-0" style={{ backgroundColor: CREAM, width: `${FAKE.energy.green}%` }} />
                </div>
              </div>
              <div className="text-xs font-light space-y-1" style={{ color: DIM }}>
                <div>Vind {FAKE.energy.wind}%</div>
                <div>Sol {FAKE.energy.solar}%</div>
                <div>CO₂ {FAKE.energy.co2} g/kWh</div>
              </div>
            </div>
          </div>
          <svg viewBox="0 0 100 20" className="w-full h-20 mt-8" preserveAspectRatio="none">
            <defs>
              <linearGradient id="eGradC" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CREAM} stopOpacity="0.4" />
                <stop offset="100%" stopColor={CREAM} stopOpacity="0" />
              </linearGradient>
            </defs>
            {(() => {
              const vs = FAKE.energy.trend;
              const max = Math.max(...vs);
              const min = Math.min(...vs);
              const norm = (v: number) => 20 - ((v - min) / (max - min || 1)) * 18 - 1;
              const step = 100 / (vs.length - 1);
              const d = vs.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${norm(v)}`).join(" ");
              return (
                <>
                  <path d={`${d} L100,20 L0,20 Z`} fill="url(#eGradC)" />
                  <path d={d} stroke={CREAM} strokeWidth="0.3" fill="none" />
                </>
              );
            })()}
          </svg>
        </section>

        {/* Trafik + Rumvejr + Fly */}
        <section className="mb-24 grid grid-cols-12 gap-8">
          <div className="col-span-7">
            <div className="text-[10px] uppercase tracking-[0.4em] mb-6" style={{ color: DIM }}>
              Trafik · {FAKE.traffic.region}
            </div>
            <div className="relative aspect-[16/9] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={FAKE.traffic.imageUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/80 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: DIM }}>{FAKE.traffic.cam}</div>
                  <div className="text-2xl font-thin mt-1" style={{ color: CREAM }}>{FAKE.traffic.active} aktive</div>
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em]" style={{ color: CREAM }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: CREAM }} />
                  Live
                </div>
              </div>
            </div>
            <div className="mt-6 flex h-1" style={{ backgroundColor: "rgba(245,230,200,0.08)" }}>
              {FAKE.traffic.layers.map((l) => (
                <div key={l.label} style={{ flex: l.n, backgroundColor: l.color }} />
              ))}
            </div>
            <div className="mt-4 space-y-1 text-sm font-light" style={{ color: DIM }}>
              {FAKE.traffic.incidents.map((inc, i) => (
                <div key={i} className="truncate">{inc.text}</div>
              ))}
            </div>
          </div>
          <div className="col-span-5 space-y-12">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] mb-6" style={{ color: DIM }}>
                Rumvejr
              </div>
              <div className="flex items-baseline gap-4">
                <span className="text-8xl font-thin leading-none" style={{ color: CREAM }}>
                  {FAKE.space.kp.toFixed(1)}
                </span>
                <span className="text-xs uppercase tracking-[0.3em]" style={{ color: DIM }}>Kp-indeks</span>
              </div>
              <div className="mt-6 space-y-1 text-sm font-light">
                <Row><span style={{ color: DIM }}>Aurora</span><span>{FAKE.space.aurora}</span></Row>
                <Row><span style={{ color: DIM }}>Solvind</span><span>{FAKE.space.solarWind} km/s</span></Row>
                <Row><span style={{ color: DIM }}>Røntgen</span><span>{FAKE.space.xray}</span></Row>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] mb-6" style={{ color: DIM }}>
                Fly · 50km
              </div>
              <div className="space-y-2 text-sm font-light">
                {FAKE.flights.map((f) => (
                  <div key={f.callsign} className="flex items-baseline justify-between border-b border-white/5 py-2">
                    <span style={{ color: CREAM }}>{f.callsign}</span>
                    <span className="flex-1 mx-4 border-b border-dotted opacity-20 translate-y-[-4px]" />
                    <span style={{ color: DIM }}>{f.alt} km · {f.km} km væk</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Jordskælv — list */}
        <section className="mb-16">
          <div className="text-[10px] uppercase tracking-[0.4em] mb-6" style={{ color: DIM }}>
            Jordskælv · seneste 24 timer
          </div>
          <div>
            {FAKE.earthquakes.map((q, i) => (
              <div key={i} className="flex items-baseline justify-between py-6 border-b border-white/10">
                <span
                  className="text-5xl font-thin"
                  style={{ color: q.mag >= 5.5 ? "#fda4af" : q.mag >= 5 ? CREAM : DIM }}
                >
                  M{q.mag}
                </span>
                <span className="text-base font-light flex-1 mx-8 truncate" style={{ color: CREAM }}>
                  {q.place}
                </span>
                <span className="text-xs uppercase tracking-[0.2em]" style={{ color: DIM }}>
                  {q.depth} km · {q.ago}
                </span>
              </div>
            ))}
          </div>
        </section>

        <footer className="pt-12 border-t border-white/5 text-[10px] uppercase tracking-[0.4em] flex justify-between" style={{ color: DIM }}>
          <span>Skynet Personal Intelligence</span>
          <span>{FAKE.date} · {FAKE.time}</span>
        </footer>
      </div>
    </div>
  );
}
