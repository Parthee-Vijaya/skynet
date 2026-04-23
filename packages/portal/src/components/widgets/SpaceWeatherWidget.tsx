"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { SpaceWeatherData } from "@/lib/types";

const AURORA_COLOR: Record<SpaceWeatherData["auroraChance"], string> = {
  low: "text-neutral-400",
  moderate: "text-cyan-300",
  high: "text-emerald-300",
  severe: "text-fuchsia-400",
};

const AURORA_LABEL: Record<SpaceWeatherData["auroraChance"], string> = {
  low: "Lav",
  moderate: "Moderat",
  high: "Høj",
  severe: "Meget høj",
};

/** Polar-projektion af den nordlige halvkugle med auroral oval der vokser
 *  baseret på Kp-indeks. Jo højere Kp, jo længere syd når nordlyset. */
function AuroraOval({ kp }: { kp: number | null }) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const rEarth = size / 2 - 6;
  const k = kp ?? 0;

  // Aurora-ovalets indre og ydre radius (relativt til pol).
  // Kp=0 → band tæt på polen. Kp=9 → band helt ude mod 60° nord.
  // Approksimation: indre = (Kp × 4) grader fra pol, ydre +6°
  const innerDeg = Math.max(6, 18 - k * 1.8);
  const outerDeg = innerDeg + 8;
  // Konverter "grader fra pol" til radius (90° = kanten).
  const degToR = (d: number) => (d / 90) * rEarth;
  const rInner = degToR(innerDeg);
  const rOuter = degToR(outerDeg);

  // Aurora-intensitet
  const intensity = Math.min(1, k / 7);
  const auroraColor =
    k < 3 ? "#22d3ee" : k < 5 ? "#10b981" : k < 7 ? "#a855f7" : "#f43f5e";

  // Danmark sidder ca. på 56° N → 34° fra pol → lige i udkanten ved Kp~5
  const dkRadius = degToR(34);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[180px]">
      <defs>
        <radialGradient id="earthGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0c4a6e" />
          <stop offset="70%" stopColor="#0a1f2e" />
          <stop offset="100%" stopColor="#050a10" />
        </radialGradient>
        <radialGradient
          id="auroraGrad"
          cx="50%"
          cy="50%"
          r="50%"
          fx="50%"
          fy="50%"
        >
          <stop offset="0%" stopColor={auroraColor} stopOpacity="0" />
          <stop offset={`${(rInner / rEarth) * 100}%`} stopColor={auroraColor} stopOpacity="0" />
          <stop offset={`${((rInner + rOuter) / 2 / rEarth) * 100}%`} stopColor={auroraColor} stopOpacity={0.3 + intensity * 0.5} />
          <stop offset={`${(rOuter / rEarth) * 100}%`} stopColor={auroraColor} stopOpacity="0" />
          <stop offset="100%" stopColor={auroraColor} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Jord (polar projektion) */}
      <circle cx={cx} cy={cy} r={rEarth} fill="url(#earthGrad)" stroke="#00d9ff" strokeOpacity="0.3" strokeWidth="0.6" />

      {/* Breddegrads-ringe (60°, 45°, 30°) */}
      {[60, 45, 30].map((lat) => {
        const r = degToR(90 - lat);
        return (
          <circle
            key={lat}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#00d9ff"
            strokeWidth="0.4"
            strokeOpacity="0.15"
            strokeDasharray="2 3"
          />
        );
      })}

      {/* Længdegrads-linjer (hver 30°). Afrundet så SSR- og client-float matcher */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const x2 = Math.round((cx + Math.cos(a) * rEarth) * 1000) / 1000;
        const y2 = Math.round((cy + Math.sin(a) * rEarth) * 1000) / 1000;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x2}
            y2={y2}
            stroke="#00d9ff"
            strokeWidth="0.3"
            strokeOpacity="0.1"
          />
        );
      })}

      {/* Auroral oval (ring) */}
      <circle cx={cx} cy={cy} r={rEarth} fill="url(#auroraGrad)" opacity={0.7 + intensity * 0.3}>
        <animate
          attributeName="opacity"
          values={`${0.5 + intensity * 0.2};${0.9 + intensity * 0.1};${0.5 + intensity * 0.2}`}
          dur="3s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Markér Danmark ca. 56°N (punkt i syd) */}
      <circle cx={cx} cy={cy + dkRadius} r="2.5" fill="#fef3c7" />
      <circle cx={cx} cy={cy + dkRadius} r="5" fill="none" stroke="#fef3c7" strokeWidth="0.6" opacity="0.5">
        <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={cx + 5} y={cy + dkRadius + 3} fontSize="7" fill="#fef3c7" fontFamily="monospace" opacity="0.8">DK</text>

      {/* Nordpol i midten */}
      <circle cx={cx} cy={cy} r="1.5" fill="#00d9ff" />

      {/* Kompas */}
      <text x={cx} y={10} textAnchor="middle" fontSize="7" fill="#00d9ff" opacity="0.5" fontFamily="monospace">0°</text>
      <text x={size - 4} y={cy + 2} textAnchor="end" fontSize="7" fill="#00d9ff" opacity="0.5" fontFamily="monospace">90°</text>
    </svg>
  );
}

function KpBadge({ kp }: { kp: number | null }) {
  const color =
    kp == null
      ? "text-neutral-500"
      : kp < 4
      ? "text-cyan-300"
      : kp < 6
      ? "text-amber-300"
      : "text-fuchsia-400";
  return (
    <div>
      <div className={`text-3xl font-light tabular-nums ${color}`}>
        {kp?.toFixed(1) ?? "—"}
      </div>
      <div className="text-[9px] text-neutral-500 uppercase tracking-[0.2em]">Kp-indeks</div>
    </div>
  );
}

export function SpaceWeatherWidget() {
  const { data } = usePoll<SpaceWeatherData>("/api/space", 5 * 60_000);

  return (
    <Card widget="space" title="Rumvejr" className="sm:col-span-2 lg:col-span-3">
      <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
        <AuroraOval kp={data?.kpIndex ?? null} />

        <div className="min-w-0 space-y-2.5">
          <KpBadge kp={data?.kpIndex ?? null} />

          <div className="pt-2 border-t border-cyan-400/10 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Aurora</span>
              <span className={AURORA_COLOR[data?.auroraChance ?? "low"]}>
                {AURORA_LABEL[data?.auroraChance ?? "low"]}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Solvind</span>
              <span className="font-mono tabular-nums text-neutral-300">
                {data?.solarWindKmS != null ? `${data.solarWindKmS} km/s` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Røntgen</span>
              <span className="font-mono text-neutral-300">{data?.xrayClass ?? "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
