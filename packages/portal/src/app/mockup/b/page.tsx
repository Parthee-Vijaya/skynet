import { FAKE } from "../_fakes";

/** B — Terminal Brutalist (v2: cinema header + blue accent)
 * Pure black, mono uppercase, electric BLUE accent, grid lines.
 * Header now an editorial spread with huge clock + Claude Code stats.
 */

const ACC = "#38bdf8"; // sky-400 / electric blue

function Cell({
  children,
  className = "",
  label,
  right,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={`border border-white/15 bg-black relative ${className}`}>
      {label && (
        <div className="flex items-center justify-between border-b border-white/15 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em]">
          <span style={{ color: ACC }}>▌ {label}</span>
          {right && <span className="text-white/40">{right}</span>}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

function Bar({ value, color = ACC }: { value: number; color?: string }) {
  return (
    <div className="flex h-2 w-full items-center gap-px">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-full"
          style={{
            backgroundColor: i < Math.round(value / 5) ? color : "rgba(255,255,255,0.08)",
          }}
        />
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-black text-white font-mono">
      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04] z-10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 2px, white 2px 3px)",
        }}
      />

      <div className="max-w-[1440px] mx-auto px-10 py-12">
        {/* Editorial header — stor klokke + claude-code + citat */}
        <header className="mb-10 border border-white/15 bg-black p-10">
          <div className="flex items-start justify-between gap-10">
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-[0.4em]" style={{ color: ACC }}>
                ▌ SKYNET · PERSONAL INTELLIGENCE
              </div>
              <h1
                className="text-[160px] leading-[0.9] tracking-[-0.04em] mt-4 font-mono"
                style={{ color: ACC }}
              >
                {FAKE.time}
              </h1>
              <div className="text-sm uppercase tracking-[0.2em] mt-4 text-white/60">
                {FAKE.date} · {FAKE.weather.city} · UPTIME {FAKE.status.uptime}
              </div>
            </div>
            <div className="text-right space-y-4 pt-2 min-w-[280px]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">
                  ▌ CLAUDE CODE
                </div>
                <div className="flex justify-end gap-6 mt-3">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-white/40">I DAG</div>
                    <div className="text-lg" style={{ color: ACC }}>{FAKE.claude.today}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-white/40">UGE</div>
                    <div className="text-lg" style={{ color: ACC }}>{FAKE.claude.week}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-white/40">TOTAL</div>
                    <div className="text-lg" style={{ color: ACC }}>{FAKE.claude.total}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 text-[10px] uppercase tracking-[0.2em]" style={{ color: ACC }}>
                <span className="w-1.5 h-1.5 animate-pulse" style={{ backgroundColor: ACC }} />
                ONLINE · {FAKE.status.hostname}
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-white/10 text-sm italic text-white/50 normal-case">
            &ldquo;{FAKE.quote}&rdquo;
          </div>
        </header>

        <main className="grid grid-cols-12 gap-0 [&>*]:-ml-px [&>*]:-mt-px">
          {/* CPU */}
          <Cell label="CPU" right={`${FAKE.cpu.cores}C`} className="col-span-4">
            <div className="flex items-end justify-between">
              <div className="text-6xl leading-none" style={{ color: ACC }}>
                {String(FAKE.cpu.load).padStart(2, "0")}
                <span className="text-xl text-white/50">%</span>
              </div>
              <div className="text-[10px] text-white/50 uppercase text-right">
                <div>{FAKE.cpu.brand}</div>
                <div>LOAD {FAKE.status.load}</div>
              </div>
            </div>
            <div className="mt-3">
              <Bar value={FAKE.cpu.load} />
            </div>
            <table className="w-full mt-3 text-[11px]">
              <tbody>
                {FAKE.cpu.top.map((p) => (
                  <tr key={p.name} className="border-t border-white/5">
                    <td className="py-1 text-white/70 uppercase truncate max-w-[200px]">{p.name}</td>
                    <td className="py-1 text-right" style={{ color: ACC }}>{p.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cell>

          {/* Memory */}
          <Cell label="MEM" right={`${FAKE.mem.used}/${FAKE.mem.total}G`} className="col-span-4">
            <div className="flex items-end justify-between">
              <div className="text-6xl leading-none" style={{ color: ACC }}>
                {FAKE.mem.percent}
                <span className="text-xl text-white/50">%</span>
              </div>
              <div className="text-[10px] text-white/50 uppercase text-right">
                <div>USED {FAKE.mem.used} GB</div>
                <div>FREE {(FAKE.mem.total - FAKE.mem.used).toFixed(1)} GB</div>
              </div>
            </div>
            <div className="mt-3">
              <Bar value={FAKE.mem.percent} />
            </div>
            <table className="w-full mt-3 text-[11px]">
              <tbody>
                {FAKE.mem.top.map((p) => (
                  <tr key={p.name} className="border-t border-white/5">
                    <td className="py-1 text-white/70 uppercase truncate max-w-[200px]">{p.name}</td>
                    <td className="py-1 text-right" style={{ color: ACC }}>{p.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cell>

          {/* Status · Net */}
          <Cell label="STATUS · NET" right="SECURE" className="col-span-4">
            <table className="w-full text-[11px]">
              <tbody>
                <tr className="border-b border-white/5"><td className="py-1 text-white/50 uppercase">HOST</td><td className="py-1 text-right">{FAKE.status.hostname}</td></tr>
                <tr className="border-b border-white/5"><td className="py-1 text-white/50 uppercase">UPTIME</td><td className="py-1 text-right">{FAKE.status.uptime}</td></tr>
                <tr className="border-b border-white/5"><td className="py-1 text-white/50 uppercase">LOAD · PROC</td><td className="py-1 text-right">{FAKE.status.load} · {FAKE.status.procs}</td></tr>
                <tr className="border-b border-white/5"><td className="py-1 text-white/50 uppercase">POWER</td><td className="py-1 text-right">{FAKE.status.power} · {FAKE.status.temp} · {FAKE.status.watts}</td></tr>
                <tr className="border-b border-white/5"><td className="py-1 text-white/50 uppercase">↓ RX</td><td className="py-1 text-right" style={{ color: ACC }}>{FAKE.status.net.down}</td></tr>
                <tr className="border-b border-white/5"><td className="py-1 text-white/50 uppercase">↑ TX</td><td className="py-1 text-right" style={{ color: ACC }}>{FAKE.status.net.up}</td></tr>
                <tr className="border-b border-white/5"><td className="py-1 text-white/50 uppercase">VPN</td><td className="py-1 text-right">{FAKE.status.vpn.country} · {FAKE.status.vpn.interface}</td></tr>
                <tr><td className="py-1 text-white/50 uppercase">IP</td><td className="py-1 text-right">{FAKE.status.vpn.ip}</td></tr>
              </tbody>
            </table>
          </Cell>

          {/* Discover */}
          <Cell label="OPDAG · ROTERENDE" right={`${FAKE.discover.progress + 1}/${FAKE.discover.total}`} className="col-span-12">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-5 border border-white/15">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={FAKE.discover.imageUrl} alt="" className="w-full h-48 object-cover grayscale contrast-125" />
              </div>
              <div className="col-span-7">
                <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: ACC }}>
                  {FAKE.discover.source}
                </div>
                <h2 className="text-2xl uppercase mt-2 tracking-tight">{FAKE.discover.title}</h2>
                <p className="text-white/70 text-sm mt-2 leading-relaxed">{FAKE.discover.body}</p>
                <div className="mt-4 flex gap-0.5">
                  {Array.from({ length: FAKE.discover.total }).map((_, i) => (
                    <span
                      key={i}
                      className="h-1 flex-1"
                      style={{ backgroundColor: i === FAKE.discover.progress ? ACC : "rgba(255,255,255,0.1)" }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Cell>

          {/* Weather · Moon */}
          <Cell label={`VEJR · ${FAKE.weather.city.toUpperCase()}`} right="CLR" className="col-span-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-7xl leading-none" style={{ color: ACC }}>
                  {FAKE.weather.temp}°
                </div>
                <div className="text-xs text-white/60 uppercase mt-2">{FAKE.weather.condition} · FEELS {FAKE.weather.feels}°</div>
                <div className="text-[10px] text-white/40 uppercase mt-0.5">WIND {FAKE.weather.wind} M/S · HUM {FAKE.weather.humidity}%</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-white/50 uppercase">MOON</div>
                <div className="text-lg" style={{ color: ACC }}>{FAKE.weather.moonIllumination}%</div>
                <div className="text-[9px] text-white/50 uppercase">{FAKE.weather.moonName}</div>
                <div className="text-[9px] text-white/50 uppercase mt-1">FULD {FAKE.weather.fullmoonIn} · NY {FAKE.weather.newmoonIn}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-6 border-t border-white/15 text-center">
              {FAKE.weather.forecast.map((f) => (
                <div key={f.h} className="py-2 border-r border-white/10 last:border-r-0">
                  <div className="text-[10px] text-white/40">{f.h}</div>
                  <div className="text-sm">{f.icon}</div>
                  <div className="text-xs" style={{ color: ACC }}>{f.t}°</div>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 text-[10px] text-white/50 uppercase">
              <div>SUNRISE {FAKE.weather.sunrise}</div>
              <div className="text-right">SUNSET {FAKE.weather.sunset}</div>
            </div>
          </Cell>

          {/* Trafik */}
          <Cell label={`TRAFIK · ${FAKE.traffic.region}`} right={`${FAKE.traffic.active} ACTIVE`} className="col-span-6">
            <div className="relative border border-white/15 aspect-[3/1] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={FAKE.traffic.imageUrl} alt="" className="w-full h-full object-cover grayscale contrast-125" />
              <div className="absolute top-2 left-2 px-2 py-0.5 bg-black border border-white/30 text-[10px] uppercase">
                {FAKE.traffic.cam}
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-black border text-[10px] uppercase" style={{ borderColor: ACC, color: ACC }}>
                <span className="w-1 h-1 animate-pulse" style={{ backgroundColor: ACC }} />LIVE
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-[11px]">
              {FAKE.traffic.layers.map((l) => (
                <div key={l.label} className="flex items-center gap-2">
                  <span className="w-2 h-2" style={{ backgroundColor: l.color }} />
                  <span className="text-white/60 uppercase flex-1">{l.label}</span>
                  <span className="text-white/90">{l.n}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t border-white/10 text-[10px] text-white/50 space-y-0.5">
              {FAKE.traffic.incidents.map((inc, i) => (
                <div key={i} className="uppercase truncate">› {inc.text}</div>
              ))}
            </div>
          </Cell>

          {/* Elpris */}
          <Cell label={`ELPRIS · ${FAKE.energy.region}`} right="DKK/KWH" className="col-span-4">
            <div className="flex items-end justify-between">
              <div className="text-6xl leading-none" style={{ color: ACC }}>
                {FAKE.energy.price.toFixed(2)}
              </div>
              <div className="text-[10px] text-white/50 uppercase text-right">
                <div>GREEN {FAKE.energy.green}%</div>
                <div>CO₂ {FAKE.energy.co2} G</div>
              </div>
            </div>
            <svg viewBox="0 0 100 30" className="w-full h-14 mt-3" preserveAspectRatio="none">
              {(() => {
                const vs = FAKE.energy.trend;
                const max = Math.max(...vs);
                const min = Math.min(...vs);
                const step = 100 / (vs.length - 1);
                const barW = step * 0.8;
                return vs.map((v, i) => {
                  const h = ((v - min) / (max - min || 1)) * 28;
                  return (
                    <rect
                      key={i}
                      x={i * step}
                      y={30 - h}
                      width={barW}
                      height={h}
                      fill={ACC}
                      opacity={0.3 + (v / max) * 0.7}
                    />
                  );
                });
              })()}
            </svg>
            <div className="mt-2 flex justify-between text-[10px] text-white/50 uppercase">
              <span>WIND {FAKE.energy.wind}% · SOL {FAKE.energy.solar}%</span>
            </div>
          </Cell>

          {/* Rumvejr */}
          <Cell label="RUMVEJR" right={FAKE.space.aurora.toUpperCase()} className="col-span-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-white/50 uppercase">KP</div>
                <div className="text-6xl leading-none" style={{ color: ACC }}>{FAKE.space.kp.toFixed(1)}</div>
              </div>
              <svg width="90" height="90" viewBox="-50 -50 100 100">
                <circle r="48" fill="none" stroke="rgba(255,255,255,0.1)" />
                <circle r="32" fill="none" stroke="rgba(255,255,255,0.05)" />
                <circle r="16" fill="none" stroke="rgba(255,255,255,0.05)" />
                <path
                  d={`M 0 -42 A 42 42 0 0 1 42 0 L 32 0 A 32 32 0 0 0 0 -32 Z`}
                  fill={ACC}
                  opacity="0.4"
                />
                <circle cx="0" cy="-22" r="2" fill={ACC} />
                <text x="0" y="-25" textAnchor="middle" fill="white" fontSize="6" opacity="0.5">DK</text>
              </svg>
            </div>
            <table className="w-full mt-3 text-[11px]">
              <tbody>
                <tr className="border-t border-white/5"><td className="py-1 text-white/50 uppercase">AURORA</td><td className="py-1 text-right">{FAKE.space.aurora}</td></tr>
                <tr className="border-t border-white/5"><td className="py-1 text-white/50 uppercase">SOLVIND</td><td className="py-1 text-right" style={{ color: ACC }}>{FAKE.space.solarWind} km/s</td></tr>
                <tr className="border-t border-white/5"><td className="py-1 text-white/50 uppercase">X-RAY</td><td className="py-1 text-right">{FAKE.space.xray}</td></tr>
              </tbody>
            </table>
          </Cell>

          {/* Flights */}
          <Cell label="FLY · 50KM" right={`${FAKE.flights.length} TRKS`} className="col-span-4">
            <div className="flex gap-3">
              <svg width="100" height="100" viewBox="-50 -50 100 100" className="shrink-0">
                <circle r="48" fill="none" stroke="rgba(255,255,255,0.15)" />
                <circle r="32" fill="none" stroke="rgba(255,255,255,0.08)" />
                <circle r="16" fill="none" stroke="rgba(255,255,255,0.08)" />
                <line x1="-48" y1="0" x2="48" y2="0" stroke="rgba(255,255,255,0.08)" />
                <line x1="0" y1="-48" x2="0" y2="48" stroke="rgba(255,255,255,0.08)" />
                {FAKE.flights.map((f, i) => {
                  const r = (f.km / 50) * 46;
                  const a = ((f.bearing - 90) * Math.PI) / 180;
                  const x = Math.cos(a) * r;
                  const y = Math.sin(a) * r;
                  return (
                    <g key={i}>
                      <rect x={x - 2} y={y - 2} width="4" height="4" fill={ACC} />
                      <text x={x + 4} y={y + 2} fontSize="5" fill="white" opacity="0.7">{f.callsign}</text>
                    </g>
                  );
                })}
                <circle r="1" fill="white" />
              </svg>
              <table className="flex-1 text-[10px]">
                <thead>
                  <tr className="text-white/40 border-b border-white/10">
                    <th className="text-left py-1">ID</th>
                    <th className="text-right py-1">ALT</th>
                    <th className="text-right py-1">KM</th>
                  </tr>
                </thead>
                <tbody>
                  {FAKE.flights.slice(0, 4).map((f) => (
                    <tr key={f.callsign} className="border-b border-white/5">
                      <td className="py-1" style={{ color: ACC }}>{f.callsign}</td>
                      <td className="py-1 text-right text-white/70">{f.alt}</td>
                      <td className="py-1 text-right text-white/70">{f.km}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cell>

          {/* Jordskælv */}
          <Cell label="JORDSKÆLV · 24T" right="USGS" className="col-span-12">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-white/40 border-b border-white/10 uppercase">
                  <th className="text-left py-1.5">MAG</th>
                  <th className="text-left py-1.5">PLACE</th>
                  <th className="text-right py-1.5">DEPTH</th>
                  <th className="text-right py-1.5">AGO</th>
                </tr>
              </thead>
              <tbody>
                {FAKE.earthquakes.map((q, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-1.5" style={{ color: q.mag >= 5.5 ? "#fb7185" : q.mag >= 5 ? ACC : "rgba(255,255,255,0.7)" }}>
                      M{q.mag.toFixed(1)}
                    </td>
                    <td className="py-1.5 text-white/80 uppercase">{q.place}</td>
                    <td className="py-1.5 text-right text-white/60">{q.depth} KM</td>
                    <td className="py-1.5 text-right text-white/60">{q.ago}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cell>
        </main>

        <footer className="mt-4 border border-white/15 bg-black px-4 py-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-white/40">
          <span>│ SYS OK │ NET OK │ VPN OK │</span>
          <span>Q: {FAKE.quote.slice(0, 60)}...</span>
          <span style={{ color: ACC }}>█ READY</span>
        </footer>
      </div>
    </div>
  );
}
