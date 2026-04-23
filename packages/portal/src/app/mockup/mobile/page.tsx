"use client";
import { useState } from "react";

/**
 * Mobile navigation mockups — 3 varianter side om side i iPhone-rammer.
 * Brug "brug denne"-knappen for at gemme valget (→ localStorage) og
 * applicere det til MinimalPageLayout efter refaktor.
 */

type NavChoice = "hamburger" | "bottom-tabs" | "inline-large" | null;

const LS_KEY = "skynet.mobileNav";

const LINKS = [
  { href: "/", label: "cockpit", icon: "◉" },
  { href: "/agents", label: "agents", icon: "◆" },
  { href: "/automations", label: "auto", icon: "◈" },
  { href: "/chat", label: "chat", icon: "◇" },
  { href: "/settings", label: "⚙", icon: "⚙" },
];

const BG = "#0a0a0a";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// ── Fake widget-content fælles for alle tre mockups ──────────────────────
function FakeCockpit() {
  return (
    <div className="px-4 py-4 space-y-4" style={{ fontFamily: MONO, fontSize: 12, color: "#e5e5e5" }}>
      {/* Hero */}
      <section className="border-b border-dashed border-neutral-900 pb-4">
        <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-600 mb-2">#hero</div>
        <div className="flex items-baseline gap-3">
          <span className="text-[42px] font-extralight text-neutral-50 leading-none tabular-nums">19:51</span>
        </div>
        <div className="text-[10px] text-neutral-500 mt-1">torsdag · 23 apr</div>
        <div className="text-neutral-300 mt-2">god aften.</div>
      </section>

      {/* CPU row */}
      <section className="border-b border-dashed border-neutral-900 pb-4">
        <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-600 mb-2">#cpu</div>
        <div className="flex items-baseline gap-3">
          <span className="text-[28px] font-extralight text-neutral-50 leading-none tabular-nums">61%</span>
          <span className="text-[10px] text-neutral-500">load · 16 cores</span>
        </div>
        <div className="mt-2 h-[3px] bg-neutral-900 relative">
          <div className="absolute inset-y-0 left-0 bg-neutral-500" style={{ width: "61%" }} />
        </div>
      </section>

      {/* Weather */}
      <section className="border-b border-dashed border-neutral-900 pb-4">
        <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-600 mb-2">
          #vejr <span className="float-right text-neutral-700">📍 København ●</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl">🌤</span>
          <span className="text-[28px] font-extralight text-neutral-50 leading-none tabular-nums">12°</span>
          <span className="text-[10px] text-neutral-500">føles 9°</span>
        </div>
      </section>

      {/* Services */}
      <section>
        <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-600 mb-2">#services</div>
        <div className="text-[11px] text-neutral-500">3/5 aktive · daemon · portal · plex</div>
      </section>

      {/* Spacer så bottom-tab ikke dækker content */}
      <div className="h-20" />
    </div>
  );
}

// ── Variant A: Hamburger ──────────────────────────────────────────────────
function HamburgerMock() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-4"
        style={{ background: BG, borderBottom: "1px solid #1c1c1c", height: 56 }}
      >
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-center"
          style={{ width: 44, height: 44, color: "#e5e5e5", fontSize: 22 }}
          aria-label="Menu"
        >
          ☰
        </button>
        <div style={{ fontFamily: MONO, fontSize: 13, color: "#e5e5e5" }}>
          skynet<span style={{ color: "#6b6b6b" }}>.live</span>
          <span className="mx-2 text-neutral-700">·</span>
          <span className="text-neutral-400">cockpit</span>
        </div>
        <div className="ml-auto text-[10px]" style={{ color: "#7dd67d", fontFamily: MONO }}>
          ●
        </div>
      </header>
      <FakeCockpit />

      {/* Drawer */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex"
        >
          <nav
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#111", borderRight: "1px solid #1c1c1c", width: "75%", maxWidth: 300 }}
            className="h-full flex flex-col"
          >
            <div className="px-5 py-5 border-b border-neutral-900">
              <div style={{ fontFamily: MONO, fontSize: 13, color: "#e5e5e5" }}>
                skynet<span style={{ color: "#6b6b6b" }}>.live</span>
              </div>
              <div className="text-[10px] text-neutral-600 mt-1">personlig cockpit</div>
            </div>
            {LINKS.map((l) => (
              <button
                key={l.href}
                className="flex items-center gap-3 px-5 text-left hover:bg-neutral-900 transition-colors"
                style={{ height: 52, fontFamily: MONO, fontSize: 14, color: "#e5e5e5" }}
              >
                <span className="text-neutral-600 w-5 text-center">{l.icon}</span>
                {l.label === "auto" ? "automations" : l.label === "⚙" ? "settings" : l.label}
              </button>
            ))}
          </nav>
          <div className="flex-1" />
        </div>
      )}
    </>
  );
}

// ── Variant B: Bottom tab bar ─────────────────────────────────────────────
function BottomTabsMock() {
  const [active, setActive] = useState("/");
  return (
    <>
      <header
        className="sticky top-0 z-10 flex items-center px-4"
        style={{ background: BG, borderBottom: "1px solid #1c1c1c", height: 44 }}
      >
        <div style={{ fontFamily: MONO, fontSize: 12, color: "#6b6b6b" }}>
          skynet<span style={{ color: "#3a3a3a" }}>.live</span>
          <span className="mx-2 text-neutral-800">·</span>
          <span className="text-neutral-400">
            {LINKS.find((l) => l.href === active)?.label === "auto"
              ? "automations"
              : LINKS.find((l) => l.href === active)?.label ?? "cockpit"}
          </span>
        </div>
        <div className="ml-auto text-[10px]" style={{ color: "#7dd67d", fontFamily: MONO }}>
          ● 19:51
        </div>
      </header>
      <FakeCockpit />
      <nav
        className="fixed bottom-0 inset-x-0 flex justify-around"
        style={{
          background: "#0a0a0aee",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid #1c1c1c",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {LINKS.map((l) => {
          const isActive = l.href === active;
          return (
            <button
              key={l.href}
              onClick={() => setActive(l.href)}
              className="flex flex-col items-center justify-center gap-1"
              style={{
                flex: 1,
                height: 56,
                color: isActive ? "#e5e5e5" : "#525252",
                fontFamily: MONO,
                fontSize: 10,
              }}
            >
              <span style={{ fontSize: 18 }}>{l.icon}</span>
              <span className="tracking-wider">{l.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

// ── Variant C: Større inline-links (scroll horisontalt) ───────────────────
function InlineLargeMock() {
  const [active, setActive] = useState("/");
  return (
    <>
      <header className="sticky top-0 z-10" style={{ background: BG, borderBottom: "1px solid #1c1c1c" }}>
        <div className="px-4 pt-3 flex items-center justify-between">
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#6b6b6b" }}>
            skynet<span style={{ color: "#3a3a3a" }}>.live</span>
          </div>
          <div className="text-[10px]" style={{ color: "#7dd67d", fontFamily: MONO }}>
            ● online · 19:51
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-none mt-1" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="flex gap-1 px-3 pb-2 min-w-max">
            {LINKS.map((l) => {
              const isActive = l.href === active;
              return (
                <button
                  key={l.href}
                  onClick={() => setActive(l.href)}
                  className="transition-colors"
                  style={{
                    height: 44,
                    minWidth: 72,
                    padding: "0 14px",
                    fontFamily: MONO,
                    fontSize: 13,
                    color: isActive ? "#f5f5f5" : "#6b6b6b",
                    background: isActive ? "#1a1a1a" : "transparent",
                    border: `1px solid ${isActive ? "#333" : "#1c1c1c"}`,
                  }}
                >
                  {l.label === "auto" ? "automations" : l.label === "⚙" ? "settings" : l.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>
      <FakeCockpit />
    </>
  );
}

// ── Mockup-side med 3 iPhones side om side ───────────────────────────────
function Phone({ children, title, badge, onPick, picked }: {
  children: React.ReactNode;
  title: string;
  badge: string;
  onPick: () => void;
  picked: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 text-center">
        <div className="text-sm text-neutral-200 font-medium" style={{ fontFamily: MONO }}>{title}</div>
        <div className="text-[10px] text-neutral-500 mt-0.5">{badge}</div>
      </div>
      <div
        className="relative"
        style={{
          width: 375,
          height: 700,
          borderRadius: 40,
          border: "8px solid #1c1c1c",
          background: BG,
          overflow: "hidden",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div className="absolute inset-0 overflow-y-auto">{children}</div>
        {/* iPhone notch faux */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2"
          style={{ width: 120, height: 22, background: "#000", borderRadius: "0 0 12px 12px", zIndex: 20 }}
        />
      </div>
      <button
        onClick={onPick}
        className="mt-4"
        style={{
          padding: "10px 24px",
          background: picked ? "#7dd67d" : "transparent",
          border: picked ? "1px solid #7dd67d" : "1px dashed #444",
          color: picked ? "#0a0a0a" : "#e5e5e5",
          fontFamily: MONO,
          fontSize: 12,
          cursor: "pointer",
          fontWeight: picked ? 600 : 400,
        }}
      >
        {picked ? "✓ valgt" : "→ brug denne"}
      </button>
    </div>
  );
}

export default function MobileNavMockupPage() {
  const [picked, setPicked] = useState<NavChoice>(() => {
    if (typeof window === "undefined") return null;
    return (localStorage.getItem(LS_KEY) as NavChoice) ?? null;
  });

  const pick = (c: NavChoice) => {
    setPicked(c);
    if (c && typeof window !== "undefined") localStorage.setItem(LS_KEY, c);
  };

  return (
    <div style={{ background: "#050505", minHeight: "100vh", color: "#e5e5e5", fontFamily: MONO }}>
      <header className="px-8 py-8 border-b border-neutral-900">
        <h1 className="text-2xl font-extralight mb-2">Mobile navigation — vælg en variant</h1>
        <p className="text-sm text-neutral-500 max-w-2xl leading-relaxed">
          Tre varianter af mobile-nav. Klik rundt i iPhone-rammerne for at se hvordan de føles.
          Tryk <span className="text-neutral-300">brug denne</span> under den valgte variant. Valget gemmes
          i localStorage og applicerer til <code className="text-neutral-300">MinimalPageLayout</code>{" "}
          når den er refaktoreret.
        </p>
        {picked && (
          <div className="mt-4 inline-block" style={{
            padding: "6px 14px",
            background: "#7dd67d15",
            border: "1px solid #7dd67d",
            color: "#7dd67d",
            fontSize: 12,
          }}>
            valgt: {picked}
          </div>
        )}
      </header>

      <div className="flex gap-10 justify-center flex-wrap p-8 pb-20">
        <Phone
          title="A — Hamburger menu"
          badge="☰ · slide-over drawer · 56px top-bar"
          picked={picked === "hamburger"}
          onPick={() => pick("hamburger")}
        >
          <HamburgerMock />
        </Phone>

        <Phone
          title="B — Bottom tab bar"
          badge="iOS-style tabs · altid synlig · 56px bund"
          picked={picked === "bottom-tabs"}
          onPick={() => pick("bottom-tabs")}
        >
          <BottomTabsMock />
        </Phone>

        <Phone
          title="C — Inline scroll-links"
          badge="store knapper · horisontal scroll"
          picked={picked === "inline-large"}
          onPick={() => pick("inline-large")}
        >
          <InlineLargeMock />
        </Phone>
      </div>

      <footer className="px-8 py-6 border-t border-neutral-900 text-[11px] text-neutral-500">
        <div>
          ← tilbage til <a href="/minimal" className="text-neutral-300 hover:text-white">cockpit</a>
        </div>
      </footer>
    </div>
  );
}
