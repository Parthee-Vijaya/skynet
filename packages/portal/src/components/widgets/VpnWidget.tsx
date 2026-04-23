"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { VpnData } from "@/lib/types";

function flagEmoji(cc: string | undefined): string {
  if (!cc || cc.length !== 2) return "🌐";
  const code = cc.toUpperCase();
  return String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
}

export function VpnWidget() {
  const { data } = usePoll<VpnData>("/api/vpn", 30_000);

  return (
    <Card
      title="VPN"
      className="sm:col-span-1 lg:col-span-2"
      action={
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full pulse-dot ${
              data?.connected ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <span className="text-neutral-400">
            {data?.connected ? "Sikker" : data ? "Off" : "..."}
          </span>
        </span>
      }
    >
      <div className="flex items-center gap-2.5 mt-0.5">
        <span className="text-2xl leading-none">{flagEmoji(data?.countryCode)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm truncate">{data?.country ?? "—"}</div>
          <div className="text-[10px] text-neutral-500 font-mono truncate">
            {data?.interface ?? "ingen tunnel"}
          </div>
        </div>
      </div>
      <div className="mt-2.5 pt-2.5 border-t border-neutral-800">
        <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Ekstern IP</div>
        <div className="font-mono text-xs text-neutral-300 truncate">
          {data?.externalIp ?? "—"}
        </div>
      </div>
    </Card>
  );
}
