interface MetricProps {
  value: string | number;
  unit?: string;
  label: string;
  progress?: number;
  color?: "sky" | "violet" | "amber" | "emerald" | "rose";
}

const progressColors: Record<NonNullable<MetricProps["color"]>, string> = {
  sky: "bg-sky-400",
  violet: "bg-violet-400",
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
};

export function Metric({ value, unit, label, progress, color = "sky" }: MetricProps) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-light tabular-nums">{value}</span>
        {unit && <span className="text-sm text-neutral-500">{unit}</span>}
      </div>
      <div className="text-xs text-neutral-500 mt-0.5">{label}</div>
      {progress !== undefined && (
        <div className="mt-2 h-1 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${progressColors[color]} transition-all duration-500`}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
