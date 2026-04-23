"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "./ThemeProvider";
import { PRESETS } from "@/lib/theme";

export function ThemeSettings() {
  const { theme, setTheme, resetTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(theme.accent);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setCustom(theme.accent), [theme.accent]);

  // Luk ved klik udenfor
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute bottom-14 right-0 w-72 rounded-xl border border-cyan-400/20 bg-[#0d1518]/95 backdrop-blur-xl shadow-2xl p-4 animate-fade-in"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-400/70 font-medium">
              Tema
            </span>
            <button
              onClick={resetTheme}
              className="text-[10px] text-neutral-500 hover:text-cyan-300 uppercase tracking-wider"
            >
              Nulstil
            </button>
          </div>

          {/* Mode-toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-black/40 border border-white/5 mb-4">
            <button
              onClick={() => setTheme({ ...theme, mode: "single" })}
              className={`text-xs py-2 rounded-md transition-colors ${
                theme.mode === "single"
                  ? "bg-cyan-400/15 text-cyan-200"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Ens farve
            </button>
            <button
              onClick={() => setTheme({ ...theme, mode: "multi" })}
              className={`text-xs py-2 rounded-md transition-colors ${
                theme.mode === "multi"
                  ? "bg-cyan-400/15 text-cyan-200"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Multifarver
            </button>
          </div>

          {/* Beskrivelse */}
          <p className="text-[10px] text-neutral-500 mb-3 leading-relaxed">
            {theme.mode === "single"
              ? "Én accent-farve til hele dashboardet."
              : "Hvid tekst med unik accent-farve pr widget — som mockup A."}
          </p>

          {/* Presets */}
          <div className="mb-4">
            <div className="text-[9px] uppercase tracking-widest text-neutral-500 mb-2">
              Presets
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setTheme({ ...theme, accent: p.hex })}
                  title={p.label}
                  className={`aspect-square rounded-md border transition-all ${
                    theme.accent.toLowerCase() === p.hex.toLowerCase()
                      ? "border-white/80 scale-95"
                      : "border-white/10 hover:border-white/30"
                  }`}
                  style={{ backgroundColor: p.hex }}
                />
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="mb-4 pt-3 border-t border-white/10">
            <div className="text-[9px] uppercase tracking-widest text-neutral-500 mb-2">
              Navigation
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Link
                href="/chat"
                onClick={() => setOpen(false)}
                className="text-center py-2 rounded border border-cyan-400/30 text-xs text-cyan-200 hover:border-cyan-400/60 hover:bg-cyan-400/5 transition-colors"
              >
                💬 Chat
              </Link>
              <Link
                href="/agents"
                onClick={() => setOpen(false)}
                className="text-center py-2 rounded border border-cyan-400/30 text-xs text-cyan-200 hover:border-cyan-400/60 hover:bg-cyan-400/5 transition-colors"
              >
                🧠 Agents
              </Link>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="text-center py-2 rounded border border-cyan-400/30 text-xs text-cyan-200 hover:border-cyan-400/60 hover:bg-cyan-400/5 transition-colors"
              >
                ⚙ Indstillinger
              </Link>
            </div>
          </div>

          {/* Custom hex */}
          <div>
            <div className="text-[9px] uppercase tracking-widest text-neutral-500 mb-2">
              Egen farve
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(custom) ? custom : "#38bdf8"}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setTheme({ ...theme, accent: e.target.value });
                }}
                className="w-10 h-8 rounded border border-white/10 bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                    setTheme({ ...theme, accent: e.target.value });
                  }
                }}
                className="flex-1 px-2 py-1.5 rounded border border-white/10 bg-black/40 text-xs font-mono text-neutral-200 focus:outline-none focus:border-cyan-400/50"
                placeholder="#38bdf8"
              />
            </div>
          </div>
        </div>
      )}

      {/* Floating-knap */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-11 h-11 rounded-full border border-cyan-400/30 bg-[#0d1518]/90 backdrop-blur-xl flex items-center justify-center text-cyan-300 shadow-lg hover:border-cyan-400/60 hover:scale-105 transition-all"
        title="Tema-indstillinger"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}
