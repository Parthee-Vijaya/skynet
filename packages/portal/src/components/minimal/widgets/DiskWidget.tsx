"use client";
import { usePoll } from "@/hooks/usePoll";
import type { DiskData } from "@/lib/types";
import { Section } from "../primitives";

function fmtSize(bytes: number): { num: string; unit: string } {
  if (bytes >= 1024 ** 4) return { num: (bytes / 1024 ** 4).toFixed(1), unit: "tb" };
  if (bytes >= 1024 ** 3) return { num: (bytes / 1024 ** 3).toFixed(1), unit: "gb" };
  if (bytes >= 1024 ** 2) return { num: (bytes / 1024 ** 2).toFixed(1), unit: "mb" };
  return { num: String(bytes), unit: "b" };
}

export function DiskWidgetMinimal() {
  const { data } = usePoll<DiskData>("/api/disk", 15_000);
  const devices = data?.devices ?? [];

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
    </Section>
  );
}
