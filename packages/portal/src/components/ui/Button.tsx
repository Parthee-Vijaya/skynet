"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Centraliseret knap-primitiv for minimal-UI stilen (dashed border, mono).
 *
 * Tre størrelser:
 *   sm  — kompakte desktop-knapper (fx i tabeller)        · 32×28 (sm) / 32×28 (lg)
 *   md  — standard knap, tap-friendly på mobil (default)  · 44×44 (sm) / 32×32 (lg)
 *   lg  — primære aktioner                                · 48×48 (sm) / 36×36 (lg)
 *
 * Mobile får altid min 44×44 for touch-target (Apple HIG).
 */

type Size = "sm" | "md" | "lg";
type Tone = "default" | "accent" | "danger" | "ghost";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "min-h-[32px] px-3 text-[11px]",
  md: "min-h-[44px] sm:min-h-[32px] px-4 sm:px-3 text-[13px] sm:text-[12px]",
  lg: "min-h-[48px] sm:min-h-[36px] px-5 sm:px-4 text-[14px] sm:text-[13px]",
};

const TONE_CLASSES: Record<Tone, string> = {
  default: "border border-dashed border-neutral-700 text-neutral-200 hover:border-neutral-500 hover:text-neutral-100",
  accent: "border border-dashed border-cyan-400/45 text-cyan-300 hover:border-cyan-400/70 hover:text-cyan-200 bg-cyan-400/5",
  danger: "border border-dashed border-rose-500/45 text-rose-300 hover:border-rose-400/70 hover:text-rose-200",
  ghost: "border border-transparent text-neutral-400 hover:text-neutral-100",
};

export function Button({
  size = "md",
  tone = "default",
  fullWidth = false,
  className = "",
  children,
  ...rest
}: {
  size?: Size;
  tone?: Tone;
  fullWidth?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={[
        "font-mono leading-none",
        "inline-flex items-center justify-center gap-1.5",
        "transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        "active:scale-[0.98]",
        fullWidth ? "w-full" : "",
        SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}

/** Link der ser ud som en Button — samme stil, men <a>-element. */
export function ButtonLink({
  size = "md",
  tone = "default",
  fullWidth = false,
  className = "",
  href,
  children,
  target,
  rel,
}: {
  size?: Size;
  tone?: Tone;
  fullWidth?: boolean;
  className?: string;
  href: string;
  children: ReactNode;
  target?: string;
  rel?: string;
}) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={[
        "font-mono leading-none no-underline",
        "inline-flex items-center justify-center gap-1.5",
        "transition-colors",
        fullWidth ? "w-full" : "",
        SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </a>
  );
}
