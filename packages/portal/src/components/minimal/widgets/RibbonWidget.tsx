"use client";
import { usePoll } from "@/hooks/usePoll";
import type { ServicePort } from "@/lib/collectors/services";
import { Dot } from "../primitives";

interface ServicesResponse {
  services: ServicePort[];
  fetchedAt: string;
}

/** Compact top-strip showing core skynet services status */
export function RibbonWidget() {
  const { data } = usePoll<ServicesResponse>("/api/services", 5_000);
  const services = data?.services ?? [];
  const byPort = Object.fromEntries(services.map((s) => [s.port, s]));

  const items = [
    { label: "daemon", port: 6767 },
    { label: "portal", port: 3100 },
    { label: "tunnel", port: 0, custom: "skynet.parthee.dev" },
    { label: "ntfy", port: 0, custom: "parthee-skynet" },
  ];

  return (
    <div className="col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-2 py-3.5 border-t border-b border-neutral-900 font-mono text-[11px]">
      {items.map((it) => {
        const s = it.port ? byPort[it.port] : null;
        const up = it.port ? s?.listening : true;
        const text = it.port ? (up ? `:${it.port}` : "down") : it.custom ?? "—";
        return (
          <div key={it.label} className="flex justify-between items-baseline">
            <b className="text-neutral-500 font-normal lowercase">{it.label}</b>
            <span className={up ? "text-[#7dd67d]" : "text-[#d87373]"}>
              <Dot tone={up ? "ok" : "bad"} />
              {text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
