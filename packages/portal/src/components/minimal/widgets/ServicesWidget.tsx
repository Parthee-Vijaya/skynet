"use client";
import { usePoll } from "@/hooks/usePoll";
import type { ServicePort } from "@/lib/collectors/services";
import { Section } from "../primitives";

interface ServicesResponse {
  services: ServicePort[];
  fetchedAt: string;
}

const CAT_LABEL: Record<ServicePort["category"], string> = {
  skynet: "skynet",
  dev: "dev",
  database: "db",
  media: "media",
  system: "system",
  other: "other",
};

const CAT_COLOR: Record<ServicePort["category"], string> = {
  skynet: "#9bd0ff",
  dev: "#c4b5fd",
  database: "#e6b450",
  media: "#a3e635",
  system: "#6b6b6b",
  other: "#6b6b6b",
};

function statusFor(s: ServicePort): { dot: string; label: string; color: string } {
  if (!s.listening) return { dot: "○", label: "off", color: "#525252" };
  if (s.responsive === false) return { dot: "◐", label: "unresponsive", color: "#e6b450" };
  if (s.responsive === true) return { dot: "●", label: "ok", color: "#7dd67d" };
  return { dot: "●", label: "listen", color: "#7dd67d" };
}

export function ServicesWidget() {
  const { data } = usePoll<ServicesResponse>("/api/services", 5_000);
  const services = data?.services ?? [];
  const up = services.filter((s) => s.listening).length;
  const total = services.length;

  return (
    <Section
      title="services · ports"
      right={
        <span>
          {up}/{total} aktive
        </span>
      }
      className="col-span-12 lg:col-span-6"
    >
      <table className="w-full font-mono text-[11px]">
        <thead>
          <tr className="text-neutral-500 border-b border-dashed border-neutral-800">
            <th className="text-left pb-2 font-normal" style={{ width: "60px" }}>port</th>
            <th className="text-left pb-2 font-normal">service</th>
            <th className="text-left pb-2 font-normal" style={{ width: "60px" }}>kat</th>
            <th className="text-left pb-2 font-normal" style={{ width: "100px" }}>proces</th>
            <th className="text-right pb-2 font-normal" style={{ width: "70px" }}>status</th>
          </tr>
        </thead>
        <tbody>
          {services.length === 0 && (
            <tr>
              <td colSpan={5} className="py-3 text-neutral-700">
                scanner porte…
              </td>
            </tr>
          )}
          {services.map((s) => {
            const st = statusFor(s);
            const content = (
              <>
                <td className="py-1.5 text-neutral-200 tabular-nums align-top">{s.port}</td>
                <td className="py-1.5 align-top">
                  <span className={s.listening ? "text-neutral-50" : "text-neutral-600"}>
                    {s.label}
                  </span>
                  {s.external && (
                    <span className="text-[9px] text-[#e6b450] ml-1.5 align-middle">EXT</span>
                  )}
                </td>
                <td className="py-1.5 align-top" style={{ color: CAT_COLOR[s.category] }}>
                  {CAT_LABEL[s.category]}
                </td>
                <td className="py-1.5 align-top text-neutral-500 truncate max-w-[100px]">
                  {s.listening ? (s.command ?? "—") + (s.pid ? ` ${s.pid}` : "") : "—"}
                </td>
                <td className="py-1.5 align-top text-right" style={{ color: st.color }}>
                  {st.dot} <span className="text-[10px]">{st.label}</span>
                </td>
              </>
            );
            const key = `${s.port}-${s.command ?? "x"}`;
            return s.url && s.listening ? (
              <tr
                key={key}
                className="border-b border-dashed border-neutral-800/50 hover:bg-neutral-900/40 cursor-pointer"
                onClick={() => window.open(s.url, "_blank")}
              >
                {content}
              </tr>
            ) : (
              <tr key={key} className="border-b border-dashed border-neutral-800/50">
                {content}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 text-[10px] text-neutral-600 font-mono">
        scanned via lsof · klik en række for at åbne service · tilføj flere porte i{" "}
        <code className="text-neutral-400">lib/collectors/services.ts</code>
      </div>
    </Section>
  );
}
