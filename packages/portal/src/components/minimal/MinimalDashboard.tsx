"use client";
import { useEffect, useState } from "react";
import { getWidgets } from "./widgets/index";
import { Pulse, Sep } from "./primitives";
import { MobileNav } from "./MobileNav";

// Bento-grid: 4 cols på desktop, 2 cols på tablet, 1 col på mobil.
// Widgets specifierer cols (1-4) + optional rows (1-2). Auto-rows holder
// minimumshøjden ensartet så grid'et ser organiseret ud uanset indhold.
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
        subtitle="cockpit · bento"
        rightSlot={
          <div className="flex items-center text-neutral-500">
            <Pulse />
            online<Sep />sampling ≤2/sec<Sep />
            {now ? now.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
          </div>
        }
      />

      {/* Bento grid: 1 col mobil → 2 col tablet → 4 col desktop.
          Hver 1-col widget har min-height 360px + stretch så naboer i samme
          række får uniform højde. Tall content scroller inde i sit card;
          short content får intentionelt luft (bento-æstetik). Hero + ribbon
          + services (cols=4) udelader min-height og vokser organisk. */}
      <main
        className="mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 px-3 pt-3 pb-10 sm:px-5 sm:py-5 lg:px-6 lg:py-6"
        style={{ maxWidth: 1400 }}
      >
        {widgets.map((w) => {
          const cat = w.category ?? "system";
          const tintBg = `rgba(var(--cat-${cat}-rgb), 0.025)`;
          const tintBorder = `rgba(var(--cat-${cat}-rgb), 0.18)`;
          const tintBorderHover = `rgba(var(--cat-${cat}-rgb), 0.40)`;
          // HeroWidget opter ud af card-chrome — har sit eget visual treatment
          const isHero = w.category === "hero" || w.id === "hero";
          // Full-width widgets (cols=4) vokser organisk; 1-col widgets får
          // uniform min-height 360px så bento-rytmen er ensartet på tværs
          // af rækker (kort content centerer naturligt, langt scroller).
          const isFullWidth = w.cols >= 4;
          const cardCls = isHero
            ? ""
            : "group relative rounded-2xl border p-3 sm:p-4 transition-all duration-250 hover:border-[color:var(--card-hover-border)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.32)] overflow-y-auto";
          const cardStyle: React.CSSProperties = isHero
            ? {}
            : {
                backgroundColor: tintBg,
                borderColor: tintBorder,
                ["--card-hover-border" as string]: tintBorderHover,
                ...(isFullWidth ? {} : { minHeight: 360, maxHeight: 440 }),
              };
          return (
            <div
              key={w.id}
              className={`${COL_CLASS[w.cols] ?? COL_CLASS[1]} ${cardCls}`}
              style={{
                ...cardStyle,
                ...(w.rows && w.rows > 1 ? { gridRow: `span ${w.rows}` } : {}),
              }}
              data-widget-cat={cat}
            >
              <w.Component />
            </div>
          );
        })}

        <footer
          className="col-span-1 sm:col-span-2 lg:col-span-4 mt-2 pt-4 flex justify-between text-[11px] flex-wrap gap-2"
          style={{ borderTop: "1px solid #1c1c1c", color: "#6b6b6b" }}
        >
          <span>skynet · mac server · dashboard · mobile pwa · ntfy</span>
          <span>
            v0.5.0 · bento<Sep />running 24/7 via launchd
            <Sep />add widgets in{" "}
            <code className="text-neutral-400">components/minimal/widgets/</code>
          </span>
        </footer>
      </main>
    </div>
  );
}
