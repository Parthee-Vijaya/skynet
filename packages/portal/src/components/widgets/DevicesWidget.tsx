"use client";
import { useState } from "react";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";
import type { DevicesData } from "@/lib/types";

export function DevicesWidget() {
  const { data } = usePoll<DevicesData>("/api/devices", 60_000);
  const [tab, setTab] = useState<"usb" | "bluetooth" | "network">("usb");

  const total = (data?.usb.length ?? 0) + (data?.bluetooth.length ?? 0) + (data?.network.length ?? 0);
  const items = data?.[tab] ?? [];

  return (
    <Card
      widget="news"
      title="Tilsluttede enheder"
      className="sm:col-span-2 lg:col-span-6"
      action={<span className="text-xs text-neutral-500 font-mono">{total} i alt</span>}
    >
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        {(["usb", "bluetooth", "network"] as const).map((t) => {
          const count = data?.[t].length ?? 0;
          const active = tab === t;
          const label = { usb: "USB", bluetooth: "Bluetooth", network: "Netværk" }[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`p-2 rounded-lg border transition-colors ${
                active
                  ? "bg-neutral-800 border-neutral-700 text-neutral-100"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700"
              }`}
            >
              <div className="text-xl font-light tabular-nums">{count}</div>
              <div className="text-[10px] uppercase tracking-wider mt-0.5">{label}</div>
            </button>
          );
        })}
      </div>

      <div className="space-y-1 max-h-32 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-xs text-neutral-500 py-2 text-center">
            Ingen {tab === "usb" ? "USB" : tab === "bluetooth" ? "Bluetooth" : "netværks"}-enheder
          </div>
        ) : (
          items.slice(0, 10).map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className="flex items-center justify-between px-3 py-1.5 rounded bg-neutral-900/50 text-xs"
            >
              <span className="truncate text-neutral-300">{item.name}</span>
              {item.detail && (
                <span className="text-neutral-500 font-mono text-[10px] ml-2 flex-shrink-0">
                  {item.detail}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
