"use client";
import type { ReactNode } from "react";
import { MobileNav } from "./MobileNav";

export function MinimalPageLayout({
  children,
  active,
}: {
  children: ReactNode;
  active: string;
}) {
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
      <MobileNav active={active} />
      {children}
    </div>
  );
}
