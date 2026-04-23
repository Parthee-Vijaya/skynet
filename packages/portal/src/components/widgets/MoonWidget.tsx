"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { MoonData } from "@/lib/types";

// Render a moon disc with a terminator (shadow arc) that matches the phase.
function MoonDisc({ phase, illumination }: { phase: number; illumination: number }) {
  const size = 80;
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;

  // phase: 0=new, 0.25=waxing half, 0.5=full, 0.75=waning half.
  // We draw a full bright disc, then overlay a shadow that covers the dark portion.
  // Approximate shadow using an ellipse clipped to a half-circle.
  const waxing = phase <= 0.5;
  const illum = illumination; // 0..1 visible fraction

  // The terminator is an ellipse with horizontal radius rx.
  // rx = r * |1 - 2*illum| — 0 at full, r at new.
  const rx = r * Math.abs(1 - 2 * illum);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id="moonBright" cx="0.4" cy="0.4" r="0.7">
          <stop offset="0%" stopColor="#f5f3e8" />
          <stop offset="100%" stopColor="#b8b4a0" />
        </radialGradient>
        <clipPath id="moonClip">
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="url(#moonBright)" />
      <g clipPath="url(#moonClip)">
        {illum < 0.999 &&
          (waxing ? (
            // Waxing: shadow on left half, minus ellipse on right
            <>
              <rect x={0} y={0} width={cx} height={size} fill="#0a0d10" />
              <ellipse cx={cx} cy={cy} rx={rx} ry={r} fill={illum < 0.5 ? "#0a0d10" : "url(#moonBright)"} />
            </>
          ) : (
            // Waning: shadow on right half
            <>
              <rect x={cx} y={0} width={cx} height={size} fill="#0a0d10" />
              <ellipse cx={cx} cy={cy} rx={rx} ry={r} fill={illum < 0.5 ? "#0a0d10" : "url(#moonBright)"} />
            </>
          ))}
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#00d9ff" strokeOpacity="0.2" strokeWidth="1" />
    </svg>
  );
}

function daysUntil(iso: string | undefined): string {
  if (!iso) return "—";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "i dag";
  if (days === 1) return "1 dag";
  return `${days} dage`;
}

export function MoonWidget() {
  const { data } = usePoll<MoonData>("/api/moon", 60 * 60_000);

  return (
    <Card title="Måne" className="sm:col-span-1 lg:col-span-3">
      <div className="flex items-center gap-4">
        <MoonDisc phase={data?.phase ?? 0} illumination={data?.illumination ?? 0} />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-neutral-100 mb-1">{data?.name ?? "—"}</div>
          <div className="text-[10px] font-mono text-neutral-500">
            {data ? `${Math.round(data.illumination * 100)}% oplyst` : "—"}
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-cyan-400/10 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[9px] text-neutral-500 uppercase tracking-[0.2em]">Fuldmåne</div>
          <div className="text-cyan-300 font-mono">{daysUntil(data?.nextFullMoon)}</div>
        </div>
        <div>
          <div className="text-[9px] text-neutral-500 uppercase tracking-[0.2em]">Nymåne</div>
          <div className="text-cyan-300 font-mono">{daysUntil(data?.nextNewMoon)}</div>
        </div>
      </div>
    </Card>
  );
}
