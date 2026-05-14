"use client";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { WidgetCategory } from "./widget-registry";

// ──────────────────────────────────────────────────────────────────────────
// Bento-card primitives — semantic-category accents, soft shadow, hover-scale
//
// Card erstatter Section som vores primære widget-wrapper. Den støtter:
//   - category-prop → bestemmer accent-farve via --cat-* CSS-vars
//   - icon-prop → Lucide icon erstatter emoji
//   - subtil 3 % category-tint på baggrund + 20 % border
//   - hover: scale 1.01 + shadow-expansion (250ms)
//
// Section bevares for legacy-widgets der ikke er migreret endnu.
// ──────────────────────────────────────────────────────────────────────────

export function Card({
  title,
  right,
  children,
  className = "",
  category,
  icon: Icon,
  href,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Semantic kategori — bestemmer accent + tint + ikon-farve */
  category?: WidgetCategory;
  /** Lucide-ikon der vises før titlen (16px) */
  icon?: LucideIcon;
  /** Hvis sat, hele card'et bliver en klikbar wrapper */
  href?: string;
}) {
  const cat = category ?? "system";
  const tintBg = `rgba(var(--cat-${cat}-rgb), 0.025)`;
  const tintBorder = `rgba(var(--cat-${cat}-rgb), 0.18)`;
  const tintBorderHover = `rgba(var(--cat-${cat}-rgb), 0.40)`;
  const accent = `var(--cat-${cat})`;

  const inner = (
    <>
      <h2 className="font-mono text-[11px] text-neutral-500 mb-2 lowercase tracking-wide flex justify-between items-baseline gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          {Icon ? (
            <Icon
              size={13}
              strokeWidth={1.75}
              style={{ color: accent }}
              className="shrink-0"
              aria-hidden
            />
          ) : (
            <span className="mr-0.5" style={{ color: accent }}>#</span>
          )}
          <span className="truncate">{title}</span>
        </span>
        {right ? <span className="text-neutral-700 font-normal text-right truncate shrink-0">{right}</span> : null}
      </h2>
      {children}
    </>
  );

  const base =
    "group relative h-full rounded-2xl border p-3 sm:p-4 transition-all duration-250";
  const hover =
    "hover:border-[color:var(--card-hover-border)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.32)]";
  const style = {
    backgroundColor: tintBg,
    borderColor: tintBorder,
    "--card-hover-border": tintBorderHover,
  } as React.CSSProperties;

  if (href) {
    return (
      <a href={href} className={`${base} ${hover} block ${className}`} style={style} data-widget-cat={cat}>
        {inner}
      </a>
    );
  }
  return (
    <section className={`${base} ${hover} ${className}`} style={style} data-widget-cat={cat}>
      {inner}
    </section>
  );
}

// Section — title-block der nu sidder INDE i en Card-wrapper (bento-grid).
// Wrapper'en (i MinimalDashboard.tsx) håndterer baggrund, border og rounding,
// så Section behøver kun rendere title + children. Den dashed mobile-border
// fra v1 er fjernet — bento-cards har deres egen visuelle adskillelse.
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
  return (
    <section className={`h-full flex flex-col ${className}`}>
      <h2 className="font-mono text-[11px] sm:text-[11px] mb-2 lowercase tracking-wide flex justify-between items-baseline gap-2">
        <span className="flex items-center gap-1 min-w-0 text-neutral-400">
          <span className="opacity-60">#</span>
          <span className="truncate">{title}</span>
        </span>
        {right ? <span className="text-neutral-600 font-normal text-right truncate shrink-0">{right}</span> : null}
      </h2>
      <div className="flex-1 min-w-0">{children}</div>
    </section>
  );
}

/**
 * EmptyStateCard — vises i widgets der mangler konfiguration. I stedet for
 * en hvisken-tekst i bunden får brugeren et CTA-lignende kort i samme
 * dimensioner som data-state, så layoutet ikke hopper når configurations
 * lander.
 */
export function EmptyStateCard({
  icon: Icon,
  title,
  description,
  ctaLabel,
  ctaHref,
  category,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  category?: WidgetCategory;
}) {
  const cat = category ?? "system";
  const accent = `var(--cat-${cat})`;
  return (
    <div className="flex flex-col items-start justify-center h-full font-mono space-y-2 py-2">
      {Icon && (
        <Icon
          size={18}
          strokeWidth={1.5}
          style={{ color: accent }}
          aria-hidden
        />
      )}
      <div className="text-[12px] text-neutral-300">{title}</div>
      <div className="text-[10.5px] text-neutral-600 leading-relaxed">
        {description}
      </div>
      {ctaLabel && ctaHref && (
        <a
          href={ctaHref}
          className="text-[10px] uppercase tracking-[0.15em] mt-1 hover:underline transition-colors"
          style={{ color: accent }}
        >
          → {ctaLabel}
        </a>
      )}
    </div>
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
