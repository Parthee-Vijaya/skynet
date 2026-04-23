"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { FlightsData, FlightItem } from "@/lib/types";

function compassLabel(deg: number): string {
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  return dirs[Math.round(deg / 45) % 8];
}

/** Radar-display: koncentriske cirkler + fly plottet efter pejling+afstand. */
function Radar({
  flights,
  radiusKm,
}: {
  flights: FlightItem[];
  radiusKm: number;
}) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 4;

  // Projiker flight til polar-koordinater i SVG-rum.
  // bearing 0° = nord → -90° i SVG-rum (pga. y-akse vender nedad).
  const project = (f: FlightItem) => {
    const r = Math.min(1, f.distanceKm / radiusKm) * rOuter;
    const angleRad = ((f.bearing - 90) * Math.PI) / 180;
    return {
      x: cx + Math.cos(angleRad) * r,
      y: cy + Math.sin(angleRad) * r,
    };
  };

  // Kompas-ringe
  const rings = [0.33, 0.66, 1.0];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[200px]">
      <defs>
        <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00d9ff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#00d9ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="radarSweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00d9ff" stopOpacity="0" />
          <stop offset="100%" stopColor="#00d9ff" stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* Glow baggrund */}
      <circle cx={cx} cy={cy} r={rOuter} fill="url(#radarBg)" />

      {/* Koncentriske ringe */}
      {rings.map((rel, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={rOuter * rel}
          fill="none"
          stroke="#00d9ff"
          strokeWidth="0.5"
          strokeOpacity={0.2 + i * 0.1}
          strokeDasharray={i < 2 ? "2 3" : ""}
        />
      ))}

      {/* Kors-linjer N/S/Ø/V */}
      <line x1={cx} y1={cy - rOuter} x2={cx} y2={cy + rOuter} stroke="#00d9ff" strokeWidth="0.4" strokeOpacity="0.2" />
      <line x1={cx - rOuter} y1={cy} x2={cx + rOuter} y2={cy} stroke="#00d9ff" strokeWidth="0.4" strokeOpacity="0.2" />

      {/* Roterende scan-arm */}
      <g>
        <line
          x1={cx}
          y1={cy}
          x2={cx + rOuter}
          y2={cy}
          stroke="url(#radarSweep)"
          strokeWidth="2"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${cx} ${cy}`}
            to={`360 ${cx} ${cy}`}
            dur="4s"
            repeatCount="indefinite"
          />
        </line>
      </g>

      {/* Kompas-labels */}
      <text x={cx} y={10} textAnchor="middle" fontSize="8" fill="#00d9ff" opacity="0.6" fontFamily="monospace">N</text>
      <text x={size - 6} y={cy + 3} textAnchor="end" fontSize="8" fill="#00d9ff" opacity="0.6" fontFamily="monospace">Ø</text>
      <text x={cx} y={size - 3} textAnchor="middle" fontSize="8" fill="#00d9ff" opacity="0.6" fontFamily="monospace">S</text>
      <text x={6} y={cy + 3} fontSize="8" fill="#00d9ff" opacity="0.6" fontFamily="monospace">V</text>

      {/* Fly */}
      {flights.map((f, i) => {
        const { x, y } = project(f);
        const alt = f.altitudeKm;
        const color =
          alt < 3 ? "#fbbf24" : alt < 8 ? "#22d3ee" : "#a5f3fc";
        return (
          <g key={`${f.callsign}-${i}`}>
            {/* Position-blip med pulse */}
            <circle cx={x} cy={y} r="3" fill={color} opacity="0.9">
              <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={x} cy={y} r="1.8" fill={color} />
            {/* Lille retnings-linje (heading) */}
            <line
              x1={x}
              y1={y}
              x2={x + Math.cos(((f.heading - 90) * Math.PI) / 180) * 6}
              y2={y + Math.sin(((f.heading - 90) * Math.PI) / 180) * 6}
              stroke={color}
              strokeWidth="1"
              opacity="0.7"
            />
            {/* Callsign-label for de 3 tætteste */}
            {i < 3 && (
              <text
                x={x + 5}
                y={y - 5}
                fontSize="7"
                fill={color}
                fontFamily="monospace"
                opacity="0.8"
              >
                {f.callsign}
              </text>
            )}
          </g>
        );
      })}

      {/* Center-dot (observatørens position) */}
      <circle cx={cx} cy={cy} r="2" fill="#00d9ff" />
      <circle cx={cx} cy={cy} r="4" fill="none" stroke="#00d9ff" strokeWidth="0.5" opacity="0.6" />
    </svg>
  );
}

function FlightRow({ f }: { f: FlightItem }) {
  return (
    <div className="flex items-center gap-2 text-xs py-1">
      <span
        className="text-cyan-300 inline-block transition-transform"
        style={{ transform: `rotate(${f.heading}deg)` }}
        title={`Retning ${f.heading}°`}
      >
        ✈
      </span>
      <span className="font-mono text-neutral-200 w-16 truncate">{f.callsign}</span>
      <span className="font-mono text-neutral-500 tabular-nums w-12 text-right">
        {f.altitudeKm.toFixed(1)}km
      </span>
      <span className="font-mono text-neutral-500 tabular-nums w-12 text-right">
        {f.speedKmh}
      </span>
      <span className="ml-auto text-[10px] font-mono text-cyan-400/70">
        {f.distanceKm.toFixed(0)}km {compassLabel(f.bearing)}
      </span>
    </div>
  );
}

export function FlightsWidget() {
  const { data } = usePoll<FlightsData>("/api/flights", 30_000);
  const flights = data?.flights ?? [];
  const radiusKm = data?.radiusKm ?? 50;

  return (
    <Card
      widget="flights"
      title={`Fly · ${radiusKm}km`}
      className="sm:col-span-2 lg:col-span-6"
      action={
        <span className="text-[10px] font-mono text-cyan-400/60">
          {data?.count ?? 0} over
        </span>
      }
    >
      {data?.error ? (
        <div className="text-xs text-rose-400/70">{data.error}</div>
      ) : (
        <div className="grid grid-cols-[auto_1fr] gap-3 items-start">
          <div className="flex justify-center">
            <Radar flights={flights} radiusKm={radiusKm} />
          </div>
          <div className="min-w-0">
            {flights.length === 0 ? (
              <div className="text-xs text-neutral-500 mt-2">
                Ingen fly inden for radius
              </div>
            ) : (
              <div className="divide-y divide-cyan-400/5">
                {flights.slice(0, 5).map((f, i) => (
                  <FlightRow key={`${f.callsign}-${i}`} f={f} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
