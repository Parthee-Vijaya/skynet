"use client";
import type { ReactNode } from "react";

// ──────────────────────────────────────────────────────────────────────────
// Starquake-minimal primitives: monospace, no borders, grey/off-white palette
// ──────────────────────────────────────────────────────────────────────────

export function Section({
  title,
  right,
  children,
  className = "",
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // Mobile: dashed bottom-border + lidt padding så sektioner er tydeligt
  // adskilte i stack-layout. Desktop: ingen border — grid-gap gør jobbet.
  return (
    <section
      className={`border-b border-dashed border-neutral-900 pb-4 mb-1 lg:border-b-0 lg:pb-0 lg:mb-0 ${className}`}
    >
      <h2 className="font-mono text-[11px] sm:text-[11px] text-neutral-500 mb-2 lowercase tracking-wide flex justify-between items-baseline gap-2">
        <span>
          <span className="mr-1">#</span>
          {title}
        </span>
        {right ? <span className="text-neutral-700 font-normal text-right truncate">{right}</span> : null}
      </h2>
      {children}
    </section>
  );
}

export function Dot({ tone = "ok" }: { tone?: "ok" | "warn" | "bad" | "dim" }) {
  const color =
    tone === "ok" ? "#7dd67d" : tone === "warn" ? "#e6b450" : tone === "bad" ? "#d87373" : "#6b6b6b";
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        marginRight: 6,
      }}
    />
  );
}

export function Pulse() {
  return (
    <span
      aria-hidden
      className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle"
      style={{
        background: "#7dd67d",
        animation: "pulseDot 1.8s ease-in-out infinite",
      }}
    />
  );
}

export function Sep() {
  return <span className="px-1.5 text-neutral-800">·</span>;
}

/** Thin flat bar — takes a percent 0-100. */
export function Bar({
  pct,
  tone = "fg",
  width = 80,
}: {
  pct: number;
  tone?: "fg" | "ok" | "warn" | "bad";
  width?: number;
}) {
  const color =
    tone === "ok"
      ? "#7dd67d"
      : tone === "warn"
      ? "#e6b450"
      : tone === "bad"
      ? "#d87373"
      : "#e5e5e5";
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span
      className="inline-block align-middle ml-2"
      style={{ width, height: 4, background: "#262626" }}
    >
      <span style={{ display: "block", height: "100%", width: `${clamped}%`, background: color }} />
    </span>
  );
}

/** Minimal starquake-style ring gauge. Thin stroke, no glow. */
export function Ring({
  value,
  label,
  size = 88,
  tone = "fg",
}: {
  value: number; // 0-100
  label?: string;
  size?: number;
  tone?: "fg" | "cyan" | "violet" | "lime";
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const off = c - (clamped / 100) * c;
  const color =
    tone === "cyan" ? "#9bd0ff" : tone === "violet" ? "#c4b5fd" : tone === "lime" ? "#a3e635" : "#f5f5f5";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }}
      >
        <circle cx="50" cy="50" r={r} fill="none" stroke="#262626" strokeWidth={3} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="butt"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
        <div className="text-[22px] font-light text-neutral-100 leading-none tracking-tight tabular-nums">
          {Math.round(clamped)}%
        </div>
        {label && (
          <div className="text-[9px] text-neutral-500 tracking-widest mt-0.5 lowercase">{label}</div>
        )}
      </div>
    </div>
  );
}

/** Minimal sparkline. */
export function MiniSpark({
  points,
  height = 22,
}: {
  points: Array<{ value: number }>;
  height?: number;
}) {
  if (!points || points.length < 2) {
    return <div style={{ height }} className="text-[10px] text-neutral-700 font-mono">—</div>;
  }
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 200;
  const pts = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = height - 2 - ((v - min) / range) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <polyline points={pts} fill="none" stroke="#e5e5e5" strokeWidth={1} opacity={0.75} />
    </svg>
  );
}

/** Dashed divider used between rows */
export function Divider() {
  return <hr className="my-6 border-0 border-t border-dashed border-neutral-800" />;
}

export function OkLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[#7dd67d]">
      <Dot tone="ok" />
      {children}
    </span>
  );
}
export function WarnLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[#e6b450]">
      <Dot tone="warn" />
      {children}
    </span>
  );
}
export function BadLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[#d87373]">
      <Dot tone="bad" />
      {children}
    </span>
  );
}
