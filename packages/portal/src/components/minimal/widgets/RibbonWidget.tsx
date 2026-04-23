"use client";
import { useEffect, useState } from "react";
import { usePoll } from "@/hooks/usePoll";
import type { ServicePort } from "@/lib/collectors/services";
import { Dot } from "../primitives";

interface ServicesResponse {
  services: ServicePort[];
  fetchedAt: string;
}

interface NotifyConfig {
  ntfyTopic: string;
  ntfyServer: string;
}

function useNtfyStatus() {
  const [topic, setTopic] = useState<string>("");
  useEffect(() => {
    fetch("/api/automations/notify-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: NotifyConfig) => setTopic(d.ntfyTopic ?? ""))
      .catch(() => {});
  }, []);
  return topic;
}

/** Compact top-strip showing core skynet services status */
export function RibbonWidget() {
  const { data } = usePoll<ServicesResponse>("/api/services", 5_000);
  const services = data?.services ?? [];
  const byPort = Object.fromEntries(services.map((s) => [s.port, s]));
  const ntfyTopic = useNtfyStatus();

  const items = [
    { label: "daemon", port: 6767 },
    { label: "portal", port: 3100 },
    { label: "ntfy", port: 0, custom: ntfyTopic || null },
  ];

  return (
    <div className="col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-2 py-3.5 border-t border-b border-neutral-900 font-mono text-[11px]">
      {items.map((it) => {
        const s = it.port ? byPort[it.port] : null;
        const up = it.port ? s?.listening : it.custom != null;
        const text = it.port ? (up ? `:${it.port}` : "down") : (it.custom ?? "ikke konfigureret");
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
