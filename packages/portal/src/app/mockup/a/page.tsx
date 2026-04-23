import { FAKE } from "../_fakes";

/** A — Glass Aurora
 * Translucent frosted cards, blurred gradient orbs in background,
 * soft lavender+cyan accent, generous rounded corners.
 * Inspiration: visionOS / Apple Weather / Linear
 */

function Card({
  children,
  className = "",
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`relative rounded-3xl p-5 backdrop-blur-2xl bg-white/[0.03] border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ${className}`}
    >
      {label && (
        <div className="text-[10px] font-medium text-white/50 uppercase tracking-[0.2em] mb-3">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function Ring({ value, size = 80 }: { value: number; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <svg width={size} height={size} className="-rotate-90">
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
      />
    </svg>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0a0f1c] text-white">
      {/* Aurora-orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-500/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[600px] h-[600px] rounded-full bg-cyan-400/15 blur-[140px]" />
        <div className="absolute bottom-0 left-1/3 w-[500px] h-[500px] rounded-full bg-fuchsia-500/10 blur-[140px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <header className="flex items-start justify-between gap-6 mb-8">
          <div>
            <h1 className="text-5xl font-extralight tracking-tight bg-gradient-to-br from-white via-violet-100 to-cyan-200 bg-clip-text text-transparent">
              Skynet
            </h1>
            <p className="text-xs text-white/40 mt-2 font-light capitalize">
              {FAKE.date} · {FAKE.time}
            </p>
            <p className="text-sm text-white/50 italic mt-3 max-w-md font-light">
              {FAKE.quote}
            </p>
          </div>

          <Card className="flex items-center gap-5 px-6 py-4" >
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Claude Code</div>
            {[
              ["I dag", FAKE.claude.today],
              ["Uge", FAKE.claude.week],
              ["Total", FAKE.claude.total],
            ].map(([l, v]) => (
              <div key={l} className="flex flex-col items-end">
                <span className="text-[9px] uppercase tracking-wider text-white/40">{l}</span>
                <span className="text-sm font-light">{v}</span>
              </div>
            ))}
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
          </Card>
        </header>

        <main className="grid grid-cols-6 gap-4 auto-rows-min">
          {/* CPU */}
          <Card label="CPU · Systemkerne" className="col-span-2">
            <div className="flex items-center gap-5">
              <Ring value={FAKE.cpu.load} />
              <div>
                <div className="text-4xl font-extralight">{FAKE.cpu.load}<span className="text-white/30 text-xl">%</span></div>
                <div className="text-[10px] text-white/40 mt-1">{FAKE.cpu.cores} cores · {FAKE.cpu.brand}</div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5">
              {FAKE.cpu.top.map((p) => (
                <div key={p.name} className="flex justify-between text-xs">
                  <span className="text-white/60 truncate">{p.name}</span>
                  <span className="font-mono text-white/80">{p.pct}%</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Memory */}
          <Card label="Hukommelse" className="col-span-2">
            <div className="flex items-center gap-5">
              <Ring value={FAKE.mem.percent} />
              <div>
                <div className="text-4xl font-extralight">{FAKE.mem.percent}<span className="text-white/30 text-xl">%</span></div>
                <div className="text-[10px] text-white/40 mt-1">{FAKE.mem.used} / {FAKE.mem.total} GB</div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5">
              {FAKE.mem.top.map((p) => (
                <div key={p.name} className="flex justify-between text-xs">
                  <span className="text-white/60 truncate">{p.name}</span>
                  <span className="font-mono text-white/80">{p.pct}%</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Status · Net */}
          <Card label="Status · Net" className="col-span-2">
            <div className="space-y-2.5 text-sm">
              <Row k="Oppetid" v={FAKE.status.uptime} />
              <Row k="Load · proc" v={`${FAKE.status.load} · ${FAKE.status.procs}`} />
              <Row k="Strøm · temp" v={`${FAKE.status.power} · ${FAKE.status.temp} · ${FAKE.status.watts}`} />
              <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] text-white/40 uppercase tracking-widest">↓ {FAKE.status.net.down}</span>
                <span className="text-[10px] text-white/40 uppercase tracking-widest">↑ {FAKE.status.net.up}</span>
              </div>
              <div className="pt-2 border-t border-white/5 flex items-center gap-2">
                <span className="text-xl">{FAKE.status.vpn.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {FAKE.status.vpn.country}
                    <span className="text-[10px] text-white/40">Sikker</span>
                  </div>
                  <div className="text-[10px] text-white/40 font-mono">{FAKE.status.vpn.ip}</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Opdag — hero */}
          <Card label="Opdag · Roterende" className="col-span-6 overflow-hidden !p-0">
            <div className="relative aspect-[3/1]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={FAKE.discover.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1c] via-[#0a0f1c]/30 to-transparent" />
              <div className="absolute top-5 left-5">
                <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-[10px] uppercase tracking-widest">
                  {FAKE.discover.source}
                </span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h2 className="text-3xl font-light tracking-tight mb-2">{FAKE.discover.title}</h2>
                <p className="text-white/70 text-sm max-w-2xl">{FAKE.discover.body}</p>
              </div>
              <div className="absolute bottom-5 right-5 flex gap-1">
                {Array.from({ length: FAKE.discover.total }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1 rounded-full transition-all ${i === FAKE.discover.progress ? "w-8 bg-white" : "w-1.5 bg-white/25"}`}
                  />
                ))}
              </div>
            </div>
          </Card>

          {/* Vejr · Måne */}
          <Card label="Vejr · Måne" className="col-span-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">☀</span>
                  <span className="text-6xl font-extralight">{FAKE.weather.temp}<span className="text-2xl text-white/30">°</span></span>
                </div>
                <div className="text-sm text-white/60 mt-1">{FAKE.weather.condition} · føles {FAKE.weather.feels}°</div>
                <div className="text-[10px] text-white/40 mt-0.5 font-mono">vind {FAKE.weather.wind} m/s · fugt {FAKE.weather.humidity}%</div>
              </div>
              <div className="text-center">
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-slate-300 via-slate-500 to-slate-800 overflow-hidden">
                  <div className="absolute top-0 right-0 w-[55%] h-full bg-slate-900" />
                </div>
                <div className="text-[10px] text-white/50 mt-1.5">{FAKE.weather.moonName}</div>
                <div className="text-[9px] text-white/40">{FAKE.weather.moonIllumination}%</div>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-2 mt-5 pt-4 border-t border-white/5">
              {FAKE.weather.forecast.map((f) => (
                <div key={f.h} className="text-center">
                  <div className="text-[10px] text-white/40 font-mono">{f.h}</div>
                  <div className="text-xl my-1">{f.icon}</div>
                  <div className="text-xs font-light">{f.t}°</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-white/5 text-[10px] font-mono text-white/50">
              <MiniStat l="OP" v={FAKE.weather.sunrise} c="text-amber-300" />
              <MiniStat l="NED" v={FAKE.weather.sunset} c="text-indigo-300" />
              <MiniStat l="FULDMÅNE" v={FAKE.weather.fullmoonIn} c="text-cyan-300" />
              <MiniStat l="NYMÅNE" v={FAKE.weather.newmoonIn} c="text-violet-300" />
            </div>
          </Card>

          {/* Trafik */}
          <Card label={`Trafik · ${FAKE.traffic.region}`} className="col-span-3 !p-0 overflow-hidden">
            <div className="p-5 pb-0 flex items-center justify-between">
              <span className="text-[10px] font-medium text-white/50 uppercase tracking-[0.2em]">Trafik · {FAKE.traffic.region}</span>
              <span className="text-xs text-white/60">{FAKE.traffic.active} aktive</span>
            </div>
            <div className="relative mt-3 mx-5 rounded-xl overflow-hidden aspect-[3/1]">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/40 to-sky-800/40" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={FAKE.traffic.imageUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur text-[10px]">{FAKE.traffic.cam}</div>
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/80 text-[9px] uppercase tracking-widest">
                <span className="w-1 h-1 rounded-full bg-white animate-pulse" />Live
              </div>
            </div>
            <div className="px-5 pt-4">
              <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
                {FAKE.traffic.layers.map((l) => (
                  <div key={l.label} style={{ flex: l.n, backgroundColor: l.color }} title={`${l.label}: ${l.n}`} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                {FAKE.traffic.layers.map((l) => (
                  <span key={l.label} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                    <span className="text-white/50">{l.label}</span>
                    <span className="text-white/70">{l.n}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="p-5 pt-3 space-y-1 text-xs text-white/60">
              {FAKE.traffic.incidents.map((inc, i) => (
                <div key={i} className="truncate">{inc.text}</div>
              ))}
            </div>
          </Card>

          {/* Elpris */}
          <Card label="Elpris · DK" className="col-span-3">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-extralight bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent">
                {FAKE.energy.price.toFixed(2)}
              </span>
              <span className="text-sm text-white/40">DKK/kWh</span>
              <span className="ml-auto text-[10px] font-mono text-white/40 uppercase tracking-widest">{FAKE.energy.region}</span>
            </div>
            {/* Trend */}
            <svg viewBox="0 0 100 30" className="w-full h-14 mt-3" preserveAspectRatio="none">
              <defs>
                <linearGradient id="trendA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
                </linearGradient>
              </defs>
              {(() => {
                const vs = FAKE.energy.trend;
                const max = Math.max(...vs);
                const min = Math.min(...vs);
                const norm = (v: number) => 30 - ((v - min) / (max - min || 1)) * 28 - 1;
                const step = 100 / (vs.length - 1);
                const d = vs.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${norm(v)}`).join(" ");
                return (
                  <>
                    <path d={`${d} L100,30 L0,30 Z`} fill="url(#trendA)" />
                    <path d={d} stroke="#67e8f9" strokeWidth="1.2" fill="none" />
                  </>
                );
              })()}
            </svg>
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="flex justify-between text-xs">
                <span className="text-white/50 uppercase tracking-wider text-[10px]">Grøn nu</span>
                <span className="text-emerald-300 font-mono">{FAKE.energy.green}%</span>
              </div>
              <div className="w-full h-1 bg-white/5 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300" style={{ width: `${FAKE.energy.green}%` }} />
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] text-white/40 font-mono">
                <span>vind {FAKE.energy.wind}% · sol {FAKE.energy.solar}%</span>
                <span>{FAKE.energy.co2} g/kWh</span>
              </div>
            </div>
          </Card>

          {/* Rumvejr */}
          <Card label="Rumvejr" className="col-span-3">
            <div className="flex items-center gap-5">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-900 via-slate-900 to-black border border-white/10" />
                <div className="absolute inset-2 rounded-full bg-gradient-radial from-cyan-500/20 to-transparent" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-mono text-white/40">DK</div>
                <div className="absolute inset-0 rounded-full ring-2 ring-violet-400/40 scale-110 animate-pulse" />
              </div>
              <div>
                <div className="text-5xl font-extralight">{FAKE.space.kp.toFixed(1)}</div>
                <div className="text-[10px] text-white/40 uppercase tracking-widest">Kp-indeks</div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 space-y-2 text-sm">
              <Row k="Aurora" v={FAKE.space.aurora} vClass="text-white/70" />
              <Row k="Solvind" v={`${FAKE.space.solarWind} km/s`} vClass="font-mono text-white/70" />
              <Row k="Røntgen" v={FAKE.space.xray} vClass="font-mono text-white/70" />
            </div>
          </Card>

          {/* Flights */}
          <Card label="Fly · 50km" className="col-span-3">
            <div className="flex gap-4">
              <div className="relative w-32 h-32 shrink-0">
                <div className="absolute inset-0 rounded-full border border-white/10" />
                <div className="absolute inset-6 rounded-full border border-white/5" />
                <div className="absolute inset-12 rounded-full border border-white/5" />
                {FAKE.flights.map((f, i) => {
                  const r = (f.km / 50) * 58;
                  const a = ((f.bearing - 90) * Math.PI) / 180;
                  const x = 64 + Math.cos(a) * r;
                  const y = 64 + Math.sin(a) * r;
                  return (
                    <div
                      key={i}
                      className="absolute w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)]"
                      style={{ left: x - 4, top: y - 4 }}
                    />
                  );
                })}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white" />
              </div>
              <div className="flex-1 min-w-0 space-y-1 text-xs">
                {FAKE.flights.slice(0, 4).map((f) => (
                  <div key={f.callsign} className="flex items-center gap-2">
                    <span className="font-mono text-white/80 w-14">{f.callsign}</span>
                    <span className="text-white/40 font-mono w-12 text-right">{f.alt}km</span>
                    <span className="text-white/40 font-mono flex-1 text-right">{f.km}km</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Jordskælv */}
          <Card label="Jordskælv · 24t" className="col-span-3">
            <div className="space-y-2">
              {FAKE.earthquakes.map((q, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div
                    className={`text-2xl font-extralight w-12 ${
                      q.mag >= 5.5 ? "text-rose-300" : q.mag >= 5 ? "text-amber-300" : "text-white/70"
                    }`}
                  >
                    M{q.mag}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate text-white/80">{q.place}</div>
                    <div className="text-[10px] text-white/40 font-mono">{q.depth} km dybde · {q.ago}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}

function Row({ k, v, vClass }: { k: string; v: string; vClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-white/40 uppercase tracking-widest">{k}</span>
      <span className={vClass ?? "text-white/70"}>{v}</span>
    </div>
  );
}

function MiniStat({ l, v, c }: { l: string; v: string; c: string }) {
  return (
    <div>
      <div className="text-white/30 text-[9px]">{l}</div>
      <div className={c}>{v}</div>
    </div>
  );
}
