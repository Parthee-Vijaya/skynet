"use client";
import { useEffect, useRef, useState } from "react";

function useTween(target: number, duration = 600): number {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    const start = performance.now();
    let raf = 0;
    const animate = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (target - from) * eased;
      setV(next);
      if (p < 1) raf = requestAnimationFrame(animate);
      else prev.current = target;
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

interface GaugeProps {
  value: number;
  max?: number;
  label: string;
  unit?: string;
  color?: string;
  size?: number;
  /** Show decimals, default = integer rendering */
  decimals?: number;
}

export function Gauge({ value, max = 100, label, unit = "%", color = "#00d9ff", size = 110, decimals = 0 }: GaugeProps) {
  const tweened = useTween(value);
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, tweened / max));
  const gradId = `gauge-${label.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a1f22" strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)`, transition: "stroke-dashoffset 600ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-0.5">
        <span className="text-[clamp(1.25rem,calc(0.8rem+0.9vw),1.75rem)] font-thin tabular-nums text-neutral-100 leading-none">
          {tweened.toFixed(decimals)}
        </span>
        <span className="text-[9px] text-neutral-500 mt-0.5 uppercase tracking-widest">{unit}</span>
      </div>
      <div className="text-[9px] uppercase tracking-[0.2em] text-cyan-400/60 mt-1">{label}</div>
    </div>
  );
}
