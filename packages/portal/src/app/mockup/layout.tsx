import Link from "next/link";
import type { ReactNode } from "react";

export default function MockupLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-2 text-[11px] font-mono">
          <div className="flex items-center gap-4">
            <Link
              href="/mockup/a"
              className="px-2.5 py-1 rounded text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              A · Glass Aurora
            </Link>
            <Link
              href="/mockup/b"
              className="px-2.5 py-1 rounded text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              B · Terminal Brutalist
            </Link>
            <Link
              href="/mockup/c"
              className="px-2.5 py-1 rounded text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              C · Cinema Minimal
            </Link>
          </div>
          <Link
            href="/"
            className="text-neutral-500 hover:text-white transition-colors"
          >
            ← tilbage til dashboard
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
