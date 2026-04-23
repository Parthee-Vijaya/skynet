interface StatusDotProps {
  status: "ok" | "warn" | "error" | "idle";
  label?: string;
  pulse?: boolean;
}

const colors: Record<StatusDotProps["status"], string> = {
  ok: "bg-emerald-500 text-emerald-500",
  warn: "bg-amber-500 text-amber-500",
  error: "bg-rose-500 text-rose-500",
  idle: "bg-neutral-500 text-neutral-500",
};

export function StatusDot({ status, label, pulse = true }: StatusDotProps) {
  const color = colors[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400">
      <span className={`w-1.5 h-1.5 rounded-full ${color.split(" ")[0]} ${pulse ? "pulse-dot" : ""}`} />
      {label && <span>{label}</span>}
    </span>
  );
}
