"use client";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Sep, Pulse } from "./primitives";

const LINKS = [
  { href: "/", label: "cockpit" },
  { href: "/agents", label: "agents" },
  { href: "/automations", label: "automations" },
  { href: "/chat", label: "chat" },
  { href: "/settings", label: "settings" },
];

export function MinimalPageLayout({
  children,
  active,
}: {
  children: ReactNode;
  active: string;
}) {
  const [time, setTime] = useState("");
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e5e5e5",
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        lineHeight: 1.55,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <nav
        className="flex justify-between items-baseline px-6 py-3.5 flex-wrap gap-y-1"
        style={{ borderBottom: "1px solid #1c1c1c", color: "#6b6b6b", fontSize: 11 }}
      >
        <div>
          <a href="/" className="text-neutral-100 hover:text-white">skynet</a>
          <span className="text-neutral-600">.live</span>
          <Sep />
          <span>{active}</span>
        </div>
        <div className="flex gap-3">
          {LINKS.map((l) => (
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
        <div className="flex items-center" style={{ color: "#6b6b6b" }}>
          <Pulse />
          online<Sep />{time}
        </div>
      </nav>
      {children}
    </div>
  );
}
