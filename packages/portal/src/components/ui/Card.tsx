import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Let a card pulse to draw attention (e.g. "system core" / latest update). */
  pulse?: boolean;
  /** Hide the scan-line animation for cards that already have heavy motion (charts, heatmaps). */
  flat?: boolean;
  /** Widget-kategori til multifarve-tema (cpu, memory, weather, flights, ...) */
  widget?: string;
}

function Brackets() {
  const arm = "absolute w-3 h-3 border-cyan-400/50 pointer-events-none transition-all duration-300 group-hover:border-cyan-400/90 group-hover:w-4 group-hover:h-4";
  return (
    <>
      <div className={`${arm} top-1.5 left-1.5 border-t border-l`} />
      <div className={`${arm} top-1.5 right-1.5 border-t border-r`} />
      <div className={`${arm} bottom-1.5 left-1.5 border-b border-l`} />
      <div className={`${arm} bottom-1.5 right-1.5 border-b border-r`} />
    </>
  );
}

export function Card({ children, className = "", title, subtitle, action, pulse, flat, widget }: CardProps) {
  const borderAnim = pulse ? "holo-pulse" : "";
  return (
    <div
      data-widget={widget}
      className={`group relative rounded-lg bg-[#0d1518] border border-cyan-400/15 p-3.5 sm:p-5 animate-fade-in overflow-hidden transition-colors hover:border-cyan-400/45 ${borderAnim} ${className}`}
      style={{
        boxShadow: pulse ? undefined : "0 0 0 1px rgba(var(--j-acc-rgb), 0.04) inset, 0 4px 24px rgba(var(--j-acc-rgb), 0.03)",
      }}
    >
      <Brackets />
      {/* Scan-line fjernet — ingen animeret baggrund */}
      {false && !flat && <div className="holo-scan-line" />}
      {(title || action) && (
        <div className="relative flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
            {title && (
              <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-400/70 font-medium">
                {title}
              </span>
            )}
          </div>
          {action}
        </div>
      )}
      {subtitle && <div className="relative text-xs text-neutral-500 mb-3">{subtitle}</div>}
      <div className="relative">{children}</div>
    </div>
  );
}
