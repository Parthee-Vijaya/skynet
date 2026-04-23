"use client";
import { usePoll } from "@/hooks/usePoll";
import type { SystemData, VpnData } from "@/lib/types";
import { Section, MiniSpark } from "../primitives";
import { useEffect, useRef, useState } from "react";

function fmtKBps(bytesPerSec: number): string {
  if (!bytesPerSec && bytesPerSec !== 0) return "—";
  const kb = bytesPerSec / 1024;
  if (kb < 1000) return kb.toFixed(1);
  return (kb / 1024).toFixed(1);
}
function fmtKBpsUnit(bytesPerSec: number): string {
  const kb = bytesPerSec / 1024;
  return kb < 1000 ? "kb/s" : "mb/s";
}
function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}t ${m}m`;
}

export function NetWidgetMinimal() {
  const { data } = usePoll<SystemData>("/api/system", 2000);
  const { data: vpn } = usePoll<VpnData>("/api/vpn", 30_000);
  const down = data?.network.rxSec ?? 0;
  const up = data?.network.txSec ?? 0;
  const uptime = data?.host.uptime ?? 0;
  const load = data?.loadAvg ?? [0, 0, 0];
  const procs = data?.processes.total ?? 0;
  const power = data?.power.source ?? "unknown";

  const downHistory = useRef<number[]>([]);
  const upHistory = useRef<number[]>([]);
  const [, force] = useState(0);
  useEffect(() => {
    if (!data) return;
    downHistory.current = [...downHistory.current.slice(-19), down];
    upHistory.current = [...upHistory.current.slice(-19), up];
    force((x) => x + 1);
  }, [data, down, up]);

  return (
    <Section
      title="net"
      right={<span>mac · {vpn?.interface ?? "utun"}</span>}
      className="col-span-12 md:col-span-6 lg:col-span-4"
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] font-mono">
        <div className="flex justify-between border-b border-dotted border-neutral-800 py-1">
          <span className="text-neutral-500">oppetid</span>
          <span className="text-neutral-100 tabular-nums">{fmtUptime(uptime)}</span>
        </div>
        <div className="flex justify-between border-b border-dotted border-neutral-800 py-1">
          <span className="text-neutral-500">strøm</span>
          <span className={power === "ac" ? "text-[#7dd67d]" : "text-neutral-100"}>
            {power.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between border-b border-dotted border-neutral-800 py-1">
          <span className="text-neutral-500">load</span>
          <span className="text-neutral-100 tabular-nums">
            {load[0].toFixed(2)} · {load[1].toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between border-b border-dotted border-neutral-800 py-1">
          <span className="text-neutral-500">proc</span>
          <span className="text-neutral-100 tabular-nums">{procs}</span>
        </div>
        <div className="flex justify-between border-b border-dotted border-neutral-800 py-1">
          <span className="text-neutral-500">ip</span>
          <span className="text-neutral-100 tabular-nums text-right truncate">
            {vpn?.externalIp ?? "—"}
          </span>
        </div>
        <div className="flex justify-between border-b border-dotted border-neutral-800 py-1">
          <span className="text-neutral-500">sikker</span>
          <span className={vpn?.connected ? "text-[#7dd67d]" : "text-neutral-600"}>
            {vpn?.connected ? "vpn up" : "direkte"}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[40px_1fr_auto] gap-2 items-center font-mono text-[11px]">
        <span className="text-neutral-500">↓ ned</span>
        <MiniSpark points={downHistory.current.map((v) => ({ value: v }))} height={18} />
        <span className="text-neutral-100 tabular-nums">
          {fmtKBps(down)}
          <small className="text-neutral-500 ml-1">{fmtKBpsUnit(down)}</small>
        </span>
      </div>
      <div className="grid grid-cols-[40px_1fr_auto] gap-2 items-center font-mono text-[11px] mt-1">
        <span className="text-neutral-500">↑ op</span>
        <MiniSpark points={upHistory.current.map((v) => ({ value: v }))} height={18} />
        <span className="text-neutral-100 tabular-nums">
          {fmtKBps(up)}
          <small className="text-neutral-500 ml-1">{fmtKBpsUnit(up)}</small>
        </span>
      </div>
    </Section>
  );
}
