"use client";
import { useMemo } from "react";
import type { HistoryPoint } from "@/lib/types";

interface Props {
  points: HistoryPoint[];
  color?: string;
  height?: number;
  min?: number;
  max?: number;
}

export function Sparkline({ points, color = "#38bdf8", height = 32, min, max }: Props) {
  const path = useMemo(() => {
    if (points.length < 2) return { line: "", area: "", width: 100 };
    const values = points.map((p) => p.value);
    const lo = min ?? Math.min(...values);
    const hi = max ?? Math.max(...values);
    const range = hi - lo || 1;
    const w = 100;
    const h = height;
    const step = w / (points.length - 1);
    const coords = points.map((p, i) => {
      const x = i * step;
      const y = h - ((p.value - lo) / range) * h;
      return [x, y] as const;
    });
    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const area = `${line} L${w},${h} L0,${h} Z`;
    return { line, area, width: w };
  }, [points, height, min, max]);

  if (points.length < 2) {
    return (
      <div
        className="w-full text-[10px] text-neutral-600 flex items-center"
        style={{ height }}
      >
        <span className="opacity-60">samler data …</span>
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${path.width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#spark-${color.replace("#", "")})`} />
      <path d={path.line} fill="none" stroke={color} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
