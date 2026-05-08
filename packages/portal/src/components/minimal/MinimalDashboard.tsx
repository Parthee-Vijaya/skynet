"use client";
import { useEffect, useState } from "react";
import { getWidgets } from "./widgets/index";
import { Pulse, Sep } from "./primitives";
import { MobileNav } from "./MobileNav";

// Instrument-panel cockpit: ingen kasser, ingen rounded corners, ingen
// baggrunds-tints. Hver widget er en "sektion" med tynd top-stripe i
// kategori-farven (1-2px) — så øjet kan scanne grupperinger uden at hver
// widget er isoleret i sin egen silo. Ingen indre scroll: content vokser
// organisk, brugeren scroller kun siden selv.
const COL_CLASS: Record<number, string> = {
  1: "col-span-1 sm:col-span-1 lg:col-span-1",
  2: "col-span-1 sm:col-span-2 lg:col-span-2",
  3: "col-span-1 sm:col-span-2 lg:col-span-3",
  4: "col-span-1 sm:col-span-2 lg:col-span-4",
};

export function MinimalDashboard() {
  const widgets = getWidgets();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#0a0a0a",
        color: "#e5e5e5",
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        lineHeight: 1.55,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <MobileNav
        active="cockpit"
        subtitle="cockpit"
        rightSlot={
          <div className="flex items-center text-neutral-500">
            <Pulse />
            online<Sep />sampling ≤2/sec<Sep />
            {now ? now.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
          </div>
        }
      />

      {/* Adaptiv 4-col grid. Widget-spec'en (cols 1-4) bestemmer bredden:
          Hero=4, Code=2, System=1, Media=2 osv. Auto-rows: ingen min/max,
          så hver widget vokser til sit naturlige indhold uden indre scroll. */}
      <main
        className="mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-7 items-start grid-flow-row-dense px-3 pt-3 pb-10 sm:px-5 sm:py-5 lg:px-6 lg:py-6"
        style={{ maxWidth: 1400 }}
      >
        {widgets.map((w) => {
          const cat = w.category ?? "system";
          const isHero = cat === "hero" || w.id === "hero";
          // Instrument-panel: tynd top-stripe i kategori-farve markerer
          // gruppering. Ingen border, ingen rounded, ingen bg-tint, ingen
          // hover-shadow. Hero udelader stripe (han er i forvejen sin egen
          // identitet med globe + clock).
          const stripeColor = `var(--cat-${cat})`;
          return (
            <div
              key={w.id}
              className={`${COL_CLASS[w.cols] ?? COL_CLASS[1]} ${isHero ? "" : "pt-3"}`}
              style={{
                ...(isHero ? {} : { borderTop: `1px solid ${stripeColor}`, opacity: 1 }),
                ...(w.rows && w.rows > 1 ? { gridRow: `span ${w.rows}` } : {}),
              }}
              data-widget-cat={cat}
            >
              <w.Component />
            </div>
          );
        })}

        <footer
          className="col-span-1 sm:col-span-2 lg:col-span-4 mt-4 pt-4 flex justify-between text-[11px] flex-wrap gap-2"
          style={{ borderTop: "1px solid #1c1c1c", color: "#6b6b6b" }}
        >
          <span>skynet · mac server · dashboard · mobile pwa · ntfy</span>
          <span>
            v0.6.0 · cockpit<Sep />running 24/7 via launchd
            <Sep />add widgets in{" "}
            <code className="text-neutral-400">components/minimal/widgets/</code>
          </span>
        </footer>
      </main>
    </div>
  );
}
