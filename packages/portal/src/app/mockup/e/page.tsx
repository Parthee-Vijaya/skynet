"use client";
import { useState } from "react";
import { FAKE } from "../_fakes";

/** E — Stream
 * Time-narrative over static data. Slack / GitHub events / Linear inbox.
 * Top-strip har kun kritiske gauges. Centralt: kronologisk event-feed med filter-chips.
 */

const ACCENT = "#a78bfa";
const DIM = "rgba(229,229,229,0.5)";
const FAINT = "rgba(229,229,229,0.12)";

type Category = "alle" | "kode" | "medie" | "agents" | "system" | "ambient";

interface FeedEvent {
  time: string;
  category: Exclude<Category, "alle">;
  icon: string;
  color: string;
  title: string;
  detail: string;
}

const EVENTS: FeedEvent[] = [
  { time: "21:47", category: "kode", icon: "◆", color: "#10b981", title: "Claude session afsluttet", detail: "Parthee → \"lav 5 cockpit mockups\" · 1h 23m varighed · 62% af 5h-window brugt" },
  { time: "21:42", category: "kode", icon: "◉", color: "#10b981", title: "Git push · skynet/main", detail: "feat: 5 nye cockpit mockups (+1227 −198) · Parthee-Vijaya/skynet@abc4f7e" },
  { time: "21:35", category: "agents", icon: "▣", color: "#06b6d4", title: "Paseo agent idle", detail: "claude · idle siden 21:23 · 12 min · ready" },
  { time: "21:15", category: "agents", icon: "✉", color: "#06b6d4", title: "Research-agent kørte", detail: "5 emails analyseret · 2 todos oprettet · varighed 47s" },
  { time: "21:00", category: "agents", icon: "◆", color: "#06b6d4", title: "Telegram inbound", detail: "→ Bifrost: \"klar\" · processeret af handle-message" },
  { time: "20:58", category: "medie", icon: "▶", color: "#8b5cf6", title: "Jellyfin startede", detail: `P → ${FAKE.plex.sessions} · Mac · 65.7%` },
  { time: "20:42", category: "medie", icon: "⇣", color: "#8b5cf6", title: "SABnzbd download færdig", detail: "Star.Wars.4K.HDR · 14.2 GB · 8m 12s · gemt til /Volumes/J.A.R.V.I.S/Movies" },
  { time: "20:30", category: "system", icon: "🔥", color: "#fb7185", title: "Firewall · ny app", detail: "Slack.app → slack.com:443 (allowed automatisk via profil 'kontor')" },
  { time: "20:18", category: "system", icon: "▦", color: "#38bdf8", title: "RAM-tærskel ramt", detail: "next-server · 2.8% af 64GB · ingen action" },
  { time: "20:00", category: "ambient", icon: "☁", color: "#e6b450", title: "Vejr-skift", detail: "regn slutter ~14:30 · {FAKE.weather.city} 11° klart" },
  { time: "19:42", category: "system", icon: "⚡", color: "#38bdf8", title: "Daemon health-check", detail: "alle 10 services oppe · longest latency: bifrost 124ms" },
];

function chipBg(cat: Category, active: boolean): { background: string; color: string } {
  if (!active) return { background: "transparent", color: "rgba(229,229,229,0.4)" };
  const map: Record<Category, string> = {
    alle: ACCENT,
    kode: "#10b981",
    medie: "#8b5cf6",
    agents: "#06b6d4",
    system: "#38bdf8",
    ambient: "#e6b450",
  };
  const c = map[cat];
  return { background: `${c}25`, color: c };
}

export default function Page() {
  const [filter, setFilter] = useState<Category>("alle");
  const filtered = filter === "alle" ? EVENTS : EVENTS.filter((e) => e.category === filter);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200" style={{ fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }}>
      {/* Top-strip: kompakt med kritiske gauges */}
      <header
        className="flex items-center justify-between px-6 py-3 text-[11px]"
        style={{ borderBottom: `1px solid ${FAINT}` }}
      >
        <div className="flex items-center gap-5" style={{ color: DIM }}>
          <span className="text-neutral-100">skynet<span className="text-neutral-600">.live</span></span>
          <span className="text-neutral-700">·</span>
          <span>stream</span>
        </div>
        <div className="flex items-center gap-6 text-[11px]" style={{ color: DIM }}>
          <span>cpu <span style={{ color: "#f5f5f5" }} className="tabular-nums">{FAKE.cpu.load}%</span></span>
          <span>ram <span style={{ color: "#f5f5f5" }} className="tabular-nums">{FAKE.mem.percent}%</span></span>
          <span>disk <span style={{ color: "#f5f5f5" }} className="tabular-nums">{FAKE.disk.percent}%</span></span>
          <span className="text-neutral-700">·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#7dd67d" }} />
            online
          </span>
          <span className="text-neutral-700">·</span>
          <span style={{ color: "#f5f5f5" }} className="tabular-nums">{FAKE.time}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Headline + filter-chips */}
        <div className="mb-8">
          <h1 className="text-2xl font-light mb-1" style={{ color: "#f5f5f5" }}>Aktivitet</h1>
          <div className="text-[11px]" style={{ color: DIM }}>
            de seneste 6 timer · {EVENTS.length} hændelser · live opdatering
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-10 text-[11px] uppercase tracking-wider">
          {(["alle", "kode", "medie", "agents", "system", "ambient"] as Category[]).map((c) => {
            const active = filter === c;
            const style = chipBg(c, active);
            return (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className="px-3 py-1.5 rounded-full transition-colors hover:bg-white/5"
                style={{ ...style, border: active ? `1px solid ${style.color}40` : `1px solid ${FAINT}` }}
              >
                {c}
                {c !== "alle" && active && (
                  <span className="ml-2 opacity-60">
                    {EVENTS.filter((e) => e.category === c).length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Feed */}
        <div className="space-y-0">
          {filtered.map((e, i) => (
            <article
              key={`${e.time}-${i}`}
              className="group flex gap-5 py-5 cursor-pointer transition-colors hover:bg-white/[0.02]"
              style={{ borderTop: `1px solid ${FAINT}` }}
            >
              {/* Tid + ikon kolonne */}
              <div className="flex flex-col items-center gap-2 pt-1 shrink-0">
                <span className="text-[11px] tabular-nums" style={{ color: DIM }}>{e.time}</span>
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: `${e.color}18`, color: e.color }}>
                  {e.icon}
                </span>
              </div>

              {/* Indhold */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-normal truncate" style={{ color: "#f5f5f5" }}>
                    {e.title}
                  </h2>
                  <span className="text-[10px] uppercase tracking-wider shrink-0" style={{ color: DIM }}>
                    {e.category}
                  </span>
                </div>
                <p className="text-sm font-light mt-1 leading-relaxed" style={{ color: DIM }}>
                  {e.detail.replace("{FAKE.weather.city}", FAKE.weather.city)}
                </p>
              </div>

              {/* Open-affordance */}
              <span className="opacity-0 group-hover:opacity-50 pt-2 transition-opacity" style={{ color: DIM }}>↗</span>
            </article>
          ))}

          {filtered.length === 0 && (
            <div className="py-16 text-center text-sm font-light" style={{ color: DIM }}>
              Ingen hændelser i kategorien <span style={{ color: "#f5f5f5" }}>{filter}</span> de seneste 6 timer.
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 text-[10px] uppercase tracking-[0.3em] flex justify-between" style={{ color: DIM, borderTop: `1px solid ${FAINT}` }}>
          <span>stream · /mockup/e</span>
          <span>{FAKE.date} · {FAKE.time}</span>
        </footer>
      </main>
    </div>
  );
}
