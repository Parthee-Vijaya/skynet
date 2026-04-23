"use client";
import { useEffect, useState } from "react";
import { getWidgets } from "./widgets/index";
import { Pulse, Sep } from "./primitives";

const SPAN: Record<number, string> = {
  3: "col-span-12 md:col-span-6 lg:col-span-3",
  4: "col-span-12 md:col-span-6 lg:col-span-4",
  5: "col-span-12 lg:col-span-5",
  6: "col-span-12 lg:col-span-6",
  7: "col-span-12 lg:col-span-7",
  8: "col-span-12 lg:col-span-8",
  9: "col-span-12 lg:col-span-9",
  12: "col-span-12",
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
      {/* Top nav / status bar */}
      <nav
        className="flex justify-between items-baseline px-6 py-3.5 text-[11px] flex-wrap gap-y-1"
        style={{ borderBottom: "1px solid #1c1c1c", color: "#6b6b6b" }}
      >
        <div>
          <span className="text-neutral-100">skynet</span>
          <span className="text-neutral-500">.live</span>
          <Sep />
          <span>cockpit · minimal</span>
        </div>
        <div className="flex gap-3 text-[10px]">
          <a href="/" className="hover:text-neutral-100">classic</a>
          <a href="/minimal" className="text-neutral-100">minimal</a>
          <a href="/agents" className="hover:text-neutral-100">agents</a>
          <a href="/automations" className="hover:text-neutral-100">automations</a>
          <a href="/chat" className="hover:text-neutral-100">chat</a>
          <a href="/settings" className="hover:text-neutral-100">settings</a>
        </div>
        <div className="flex items-center">
          <Pulse />
          online<Sep />sampling ≤2/sec<Sep />
          {now ? now.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
        </div>
      </nav>

      {/* Main grid */}
      <main
        className="mx-auto grid gap-x-8 gap-y-7"
        style={{
          maxWidth: 1400,
          padding: "28px 24px 60px",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
        }}
      >
        {widgets.map((w) => (
          <div
            key={w.id}
            className={SPAN[w.colSpan] ?? "col-span-12"}
            style={w.rowSpan && w.rowSpan > 1 ? { gridRow: `span ${w.rowSpan}` } : undefined}
          >
            <w.Component />
          </div>
        ))}

        <footer
          className="col-span-12 mt-5 pt-4 flex justify-between text-[11px] flex-wrap gap-2"
          style={{ borderTop: "1px solid #1c1c1c", color: "#6b6b6b" }}
        >
          <span>skynet · mac server · dashboard · mobile pwa · ntfy</span>
          <span>
            v0.4.0<Sep />running 24/7 via launchd
            <Sep />add widgets in{" "}
            <code className="text-neutral-400">components/minimal/widgets/</code>
          </span>
        </footer>
      </main>
    </div>
  );
}
