"use client";
import { useEffect, useRef, useState } from "react";
import { usePoll } from "@/hooks/usePoll";
import type { DiskData } from "@/lib/types";
import { Section } from "../primitives";
import type { StorageResponse } from "@/app/api/storage/route";

function fmtSize(bytes: number): { num: string; unit: string } {
  if (bytes >= 1024 ** 4) return { num: (bytes / 1024 ** 4).toFixed(1), unit: "tb" };
  if (bytes >= 1024 ** 3) return { num: (bytes / 1024 ** 3).toFixed(1), unit: "gb" };
  if (bytes >= 1024 ** 2) return { num: (bytes / 1024 ** 2).toFixed(1), unit: "mb" };
  return { num: String(bytes), unit: "b" };
}

const SPARK = "▁▂▃▄▅▆▇█";

function sparkline(values: number[]): string {
  if (values.length === 0) return "—";
  const max = Math.max(...values, 0.1);
  return values.map((v) => SPARK[Math.min(SPARK.length - 1, Math.max(0, Math.floor((v / max) * (SPARK.length - 1))))]).join("");
}

/** Hold last N samples af rateMBs per device for sparkline-rendering */
function useIoHistory(devices: DiskData["devices"] | undefined, maxSamples = 24) {
  const [hist, setHist] = useState<Record<string, number[]>>({});
  const lastTotals = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!devices) return;
    setHist((prev) => {
      const next = { ...prev };
      for (const d of devices) {
        const arr = next[d.id] ?? [];
        // rateMBs er allerede momentant — append
        arr.push(d.rateMBs ?? 0);
        if (arr.length > maxSamples) arr.shift();
        next[d.id] = arr;
        lastTotals.current[d.id] = d.totalMB ?? 0;
      }
      return next;
    });
  }, [devices, maxSamples]);

  return hist;
}

export function DiskWidgetMinimal() {
  const { data } = usePoll<DiskData>("/api/disk", 15_000);
  const { data: storage } = usePoll<StorageResponse>("/api/storage", 60 * 60_000);
  const devices = data?.devices ?? [];
  const ioHist = useIoHistory(data?.devices);

  return (
    <Section
      title="disk"
      right={<span>{devices.length} volumes</span>}
      className="col-span-12 lg:col-span-6"
    >
      <table className="w-full font-mono text-[12px]">
        <thead>
          <tr className="text-neutral-500 border-b border-dashed border-neutral-800">
            <th className="text-left pb-2 font-normal" style={{ width: "36%" }}>volume</th>
            <th className="text-left pb-2 font-normal">used / total</th>
            <th className="text-left pb-2 font-normal" style={{ width: "28%" }}>fill</th>
            <th className="text-right pb-2 font-normal" style={{ width: "60px" }}>pct</th>
          </tr>
        </thead>
        <tbody>
          {devices.length === 0 && (
            <tr>
              <td colSpan={4} className="py-3 text-neutral-700">—</td>
            </tr>
          )}
          {devices.map((d) => {
            const used = fmtSize(d.usedBytes);
            const total = fmtSize(d.totalBytes);
            const tone = d.percentUsed > 85 ? "bad" : d.percentUsed > 65 ? "warn" : "ok";
            const barColor = tone === "bad" ? "#d87373" : tone === "warn" ? "#e6b450" : "#7dd67d";
            return (
              <tr key={d.id} className="border-b border-dashed border-neutral-800">
                <td className="py-2.5 align-top">
                  <div className="text-neutral-50">{d.name}</div>
                  <div className="text-[10px] text-neutral-600 mt-0.5">
                    {d.interfaceType.toLowerCase()} · {d.isInternal ? "internal" : "external"}
                  </div>
                </td>
                <td className="py-2.5 align-top text-neutral-200 tabular-nums">
                  <span className="text-neutral-50">{used.num}</span> / {total.num} {total.unit}
                </td>
                <td className="py-2.5 align-top">
                  <span
                    style={{ display: "inline-block", width: "100%", maxWidth: 180, height: 4, background: "#262626" }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        width: `${d.percentUsed}%`,
                        background: barColor,
                      }}
                    />
                  </span>
                </td>
                <td className="py-2.5 align-top text-right font-medium text-neutral-50 tabular-nums">
                  {Math.round(d.percentUsed)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* G · I/O sparkline per device */}
      {devices.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-neutral-900 font-mono text-[11px]">
          <div className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1.5">i/o · ~5 min</div>
          {devices.map((d) => {
            const hist = ioHist[d.id] ?? [];
            const peak = hist.length > 0 ? Math.max(...hist) : 0;
            return (
              <div key={d.id} className="flex items-baseline gap-2 text-neutral-500 leading-tight">
                <span className="text-neutral-400 truncate" style={{ width: 110 }}>{d.isInternal ? "internal" : "external"}</span>
                <span className="text-cyan-400/70 tabular-nums" style={{ minWidth: 90 }}>{sparkline(hist)}</span>
                <span className="tabular-nums text-neutral-300">{(d.rateMBs ?? 0).toFixed(1)}</span>
                <span className="text-neutral-600">mb/s</span>
                <span className="text-neutral-700 ml-auto tabular-nums">peak {peak.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* H · storage breakdown */}
      {storage && storage.items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-neutral-900 font-mono text-[11px]">
          <div className="text-[10px] text-neutral-600 uppercase tracking-wider mb-1.5">hvor pladsen er</div>
          <table className="w-full">
            <tbody>
              {storage.items.map((it) => {
                const sz = fmtSize(it.bytes);
                const isZero = it.bytes === 0;
                const tccHint = isZero && (it.label === "Downloads" || it.label === "Photos Library") ? "TCC?" : "";
                return (
                  <tr key={it.label} className="text-neutral-500 leading-tight">
                    <td className="py-0.5 text-neutral-400" style={{ width: 110 }}>{it.label}</td>
                    <td className="py-0.5 text-right tabular-nums text-neutral-200" style={{ width: 80 }}>
                      {sz.num} <span className="text-neutral-600">{sz.unit}</span>
                    </td>
                    <td className="py-0.5 pl-3 text-neutral-700 text-[10px] truncate" title={tccHint ? "Macs Privatliv & Sikkerhed blokerer adgang — giv Node Full Disk Access" : undefined}>
                      {it.detail ?? tccHint}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
