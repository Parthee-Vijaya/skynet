import { FAKE } from "../_fakes";

/** H — Glanceable Tiles
 * 1-sek overblik. Apple Watch Modular face / iOS Home Screen widgets.
 * 4×3 grid med 12 store firkanter — ÉT primært tal + label per tile.
 * Klik for detail (placeholder i mockup).
 */

const BG = "#0a0a0a";
const DIM = "rgba(229,229,229,0.5)";
const FAINT = "rgba(229,229,229,0.10)";

type Tone = "ok" | "warn" | "bad" | "info";

const TONE_COLORS: Record<Tone, string> = {
  ok: "#7dd67d",
  warn: "#e6b450",
  bad: "#d87373",
  info: "#38bdf8",
};

interface Tile {
  big: string;
  unit?: string;
  label: string;
  sub?: string;
  tone: Tone;
  category: "system" | "code" | "media" | "agents" | "ambient";
}

const TILES: Tile[] = [
  { big: `${FAKE.cpu.load}`, unit: "%", label: "CPU", sub: `${FAKE.cpu.cores} cores`, tone: "ok", category: "system" },
  { big: `${FAKE.mem.percent}`, unit: "%", label: "RAM", sub: `${FAKE.mem.used}/${FAKE.mem.total} GB`, tone: "ok", category: "system" },
  { big: `${FAKE.disk.percent}`, unit: "%", label: "DISK", sub: FAKE.disk.used, tone: "warn", category: "system" },
  { big: "↓120", label: "NET", sub: `↑${FAKE.status.net.up}`, tone: "info", category: "system" },

  { big: "17", label: "COMMITS", sub: "i dag", tone: "ok", category: "code" },
  { big: "62", unit: "%", label: "CLAUDE", sub: "5h window", tone: "ok", category: "code" },
  { big: "IDLE", label: "PASEO", sub: "12m", tone: "info", category: "agents" },
  { big: `${FAKE.traffic.active}`, unit: "%", label: "FIREWALL", sub: "alle grade A", tone: "ok", category: "system" },

  { big: `▶${FAKE.plex.nowPlaying}`, label: "JELLYFIN", sub: "ser nu", tone: "ok", category: "media" },
  { big: "TOM", label: "SABNZBD", sub: "queue", tone: "info", category: "media" },
  { big: `${FAKE.weather.temp}°`, label: "VEJR", sub: FAKE.weather.condition.toLowerCase(), tone: "info", category: "ambient" },
  { big: "♉", label: "TYREN", sub: "→ ♊ om 10d", tone: "info", category: "ambient" },
];

function Tile({ tile }: { tile: Tile }) {
  const c = TONE_COLORS[tile.tone];
  return (
    <button
      className="group relative aspect-square flex flex-col justify-between p-5 transition-all hover:scale-[1.02]"
      style={{
        background: "#101010",
        border: `1px solid ${FAINT}`,
        borderRadius: 18,
      }}
    >
      {/* Tone dot top-left */}
      <div className="flex items-center justify-between">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: c, boxShadow: `0 0 8px ${c}` }}
        />
        <span className="text-[9px] uppercase tracking-wider" style={{ color: DIM }}>
          {tile.category}
        </span>
      </div>

      {/* Big number */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-baseline gap-1">
          <span
            className="font-extralight leading-none tabular-nums"
            style={{
              color: "#f5f5f5",
              fontSize: tile.big.length > 3 ? "2.5rem" : "3.5rem",
            }}
          >
            {tile.big}
          </span>
          {tile.unit && (
            <span className="text-lg font-light" style={{ color: DIM }}>
              {tile.unit}
            </span>
          )}
        </div>
      </div>

      {/* Label + sub */}
      <div className="text-left">
        <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: c }}>
          {tile.label}
        </div>
        {tile.sub && (
          <div className="text-[10px] mt-0.5 truncate" style={{ color: DIM }}>
            {tile.sub}
          </div>
        )}
      </div>

      {/* Hover indicator */}
      <span
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-60 transition-opacity text-xs"
        style={{ color: DIM }}
      >
        ↗
      </span>
    </button>
  );
}

export default function Page() {
  return (
    <div
      className="min-h-screen"
      style={{ background: BG, fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      {/* Top */}
      <header
        className="flex items-center justify-between px-8 py-5"
        style={{ borderBottom: `1px solid ${FAINT}` }}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-neutral-100 text-lg font-light">skynet</span>
          <span className="text-neutral-600 text-sm">·</span>
          <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: DIM }}>tiles</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]" style={{ color: DIM }}>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#7dd67d", boxShadow: "0 0 8px #7dd67d" }} />
            online
          </span>
          <span>·</span>
          <span>{FAKE.status.uptime} up</span>
          <span>·</span>
          <span className="text-neutral-100 tabular-nums">{FAKE.time}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-10">
        {/* Mini-hero: bare dato + hilsen */}
        <div className="mb-10 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-light" style={{ color: "#f5f5f5" }}>
              god aften, Parthee
            </h1>
            <div className="text-[11px] uppercase tracking-[0.2em] mt-1" style={{ color: DIM }}>
              {FAKE.date.toLowerCase()} · uge 17 · {FAKE.weather.city}
            </div>
          </div>
          <div className="text-right text-[11px]" style={{ color: DIM }}>
            <div>scroll for detaljer · klik tile for fokus</div>
          </div>
        </div>

        {/* 4×3 tile grid */}
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          }}
        >
          {TILES.map((t, i) => (
            <Tile key={i} tile={t} />
          ))}
        </div>

        {/* Sub-row: kort tekst-summary under */}
        <section className="mt-12 grid grid-cols-3 gap-6 text-sm font-light">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] mb-3" style={{ color: DIM }}>
              Top CPU
            </div>
            <div className="space-y-1 text-xs" style={{ color: DIM }}>
              {FAKE.cpu.top.slice(0, 3).map((p) => (
                <div key={p.name} className="flex justify-between gap-3">
                  <span className="truncate" style={{ color: "#e5e5e5" }}>{p.name}</span>
                  <span className="tabular-nums">{p.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] mb-3" style={{ color: DIM }}>
              Top RAM
            </div>
            <div className="space-y-1 text-xs" style={{ color: DIM }}>
              {FAKE.mem.top.slice(0, 3).map((p) => (
                <div key={p.name} className="flex justify-between gap-3">
                  <span className="truncate" style={{ color: "#e5e5e5" }}>{p.name}</span>
                  <span className="tabular-nums">{p.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] mb-3" style={{ color: DIM }}>
              Aktuelle hændelser
            </div>
            <div className="space-y-1 text-xs" style={{ color: DIM }}>
              <div><span style={{ color: "#e5e5e5" }}>21:42</span> · git push · skynet/main</div>
              <div><span style={{ color: "#e5e5e5" }}>21:35</span> · paseo agent idle</div>
              <div><span style={{ color: "#e5e5e5" }}>20:42</span> · sabnzbd færdig · Star.Wars</div>
            </div>
          </div>
        </section>

        <footer className="mt-16 pt-6 text-[10px] uppercase tracking-[0.3em] flex justify-between" style={{ color: DIM, borderTop: `1px solid ${FAINT}` }}>
          <span>glanceable · /mockup/h</span>
          <span>{FAKE.date} · {FAKE.time}</span>
        </footer>
      </main>
    </div>
  );
}
