"use client";
import { useEffect, useState } from "react";
import { Sep, Pulse } from "./primitives";

/**
 * Responsive nav-header.
 * - Desktop (≥md): vandret link-row som før
 * - Mobil (<md): hamburger + slide-over drawer fra venstre
 *
 * Brugt af både MinimalPageLayout og MinimalDashboard.
 */

export interface MobileNavLink {
  href: string;
  label: string;
  icon?: string;
}

export const DEFAULT_LINKS: MobileNavLink[] = [
  { href: "/", label: "cockpit", icon: "◉" },
  { href: "/agents", label: "agents", icon: "◆" },
  { href: "/automations", label: "automations", icon: "◈" },
  { href: "/chat", label: "chat", icon: "◇" },
  { href: "/firewall", label: "firewall", icon: "▣" },
  { href: "/settings", label: "settings", icon: "⚙" },
];

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function MobileNav({
  active,
  links = DEFAULT_LINKS,
  rightSlot,
  subtitle,
}: {
  /** Hvilken side er aktiv (matcher .label) */
  active: string;
  links?: MobileNavLink[];
  /** Custom højre-side indhold (fx online + tid) */
  rightSlot?: React.ReactNode;
  /** Sub-label efter skynet.live (fx "cockpit · minimal") */
  subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("");

  // Body scroll-lock når drawer åben
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const defaultRight = (
    <div className="flex items-center text-neutral-500">
      <Pulse />
      online<Sep />{time}
    </div>
  );

  return (
    <>
      {/* ── Desktop nav (≥md) ─────────────────────────────────────────── */}
      <nav
        className="hidden md:flex justify-between items-baseline px-6 py-3.5 flex-wrap gap-y-1"
        style={{ borderBottom: "1px solid #1c1c1c", color: "#6b6b6b", fontSize: 11, fontFamily: MONO }}
      >
        <div>
          <a href="/" className="text-neutral-100 hover:text-white">skynet</a>
          <span className="text-neutral-600">.live</span>
          {subtitle && (<><Sep /><span>{subtitle}</span></>)}
          {!subtitle && (<><Sep /><span>{active}</span></>)}
        </div>
        <div className="flex gap-3">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{ color: l.label === active ? "#f5f5f5" : "#6b6b6b" }}
              className="hover:text-neutral-100"
            >
              {l.label}
            </a>
          ))}
        </div>
        {rightSlot ?? defaultRight}
      </nav>

      {/* ── Mobile top-bar (<md): hamburger + title + status ─────────────
           Bemærk: body har allerede padding-top: env(safe-area-inset-top)
           via globals.css, så vi dobbelt-padder IKKE her. Header-højde
           strammet til 48 for kompakt feel. */}
      <header
        className="md:hidden sticky top-0 z-30 flex items-center gap-1 px-1 pr-3"
        style={{
          background: "#0a0a0a",
          borderBottom: "1px solid #1c1c1c",
          height: 48,
          color: "#e5e5e5",
          fontFamily: MONO,
        }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="Menu"
          data-no-mobile-min
          style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#e5e5e5" }}
        >
          ☰
        </button>
        <div className="flex-1 min-w-0 text-[13px] truncate">
          <a href="/" className="text-neutral-100">skynet</a>
          <span className="text-neutral-600">.live</span>
          <span className="mx-2 text-neutral-700">·</span>
          <span className="text-neutral-300">{active}</span>
        </div>
        <div className="text-[10px]" style={{ color: "#7dd67d" }}>●</div>
        <div className="ml-2 text-[10px] text-neutral-500 tabular-nums">{time}</div>
      </header>

      {/* ── Slide-over drawer ─────────────────────────────────────────── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex"
          style={{ fontFamily: MONO }}
        >
          <nav
            onClick={(e) => e.stopPropagation()}
            className="h-full flex flex-col"
            style={{
              background: "#0d0d0d",
              borderRight: "1px solid #1c1c1c",
              width: "82%",
              maxWidth: 320,
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            <div className="px-5 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid #1c1c1c" }}>
              <div>
                <div className="text-neutral-100 text-[13px]">
                  skynet<span className="text-neutral-600">.live</span>
                </div>
                <div className="text-[10px] text-neutral-500 mt-0.5">personlig cockpit</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Luk"
                style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#6b6b6b" }}
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col py-2">
              {links.map((l) => {
                const isActive = l.label === active;
                return (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-4 px-5 transition-colors hover:bg-neutral-900"
                    style={{
                      height: 56,
                      fontSize: 15,
                      color: isActive ? "#f5f5f5" : "#a3a3a3",
                      background: isActive ? "rgba(125,214,125,0.05)" : "transparent",
                      borderLeft: `3px solid ${isActive ? "#7dd67d" : "transparent"}`,
                    }}
                  >
                    <span className="text-neutral-600 w-5 text-center text-[18px]">{l.icon ?? "·"}</span>
                    <span className="flex-1">{l.label}</span>
                    {isActive && <span className="text-[10px] text-emerald-400">●</span>}
                  </a>
                );
              })}
            </div>

            <div className="mt-auto px-5 py-4 text-[10px] text-neutral-600" style={{ borderTop: "1px solid #1c1c1c" }}>
              <div className="flex items-center gap-1.5">
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#7dd67d" }} />
                online · {time}
              </div>
            </div>
          </nav>
          <div className="flex-1" />
        </div>
      )}
    </>
  );
}
