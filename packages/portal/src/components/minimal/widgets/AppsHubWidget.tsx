"use client";

import { useEffect, useMemo, useState } from "react";
import { Section, Dot } from "../primitives";
import { usePoll } from "@/hooks/usePoll";
import { DEFAULT_APPS, type AppEntry, pickAppUrl } from "@/lib/apps";
import type { AppHealth } from "@/app/api/apps/health/route";

/**
 * Cockpit-widget: oversigt over alle apps i hub'en med status-prikker.
 *
 * En kompakt række med ikon + navn + status pr. app. Klik åbner i ny tab
 * (eller kalder /api/apps/launch for native Mac-apps). Komplementerer
 * ServicesWidget (porte) — denne er højere abstraktion (apps).
 */

interface HealthResponse {
  apps: AppHealth[];
  cached: boolean;
}

interface AppsResponse {
  apps: AppEntry[];
}

function tone(status: AppHealth["status"] | undefined): "ok" | "warn" | "bad" | "dim" {
  if (status === "ok") return "ok";
  if (status === "down") return "bad";
  return "dim";
}

export function AppsHubWidget() {
  const { data: healthData } = usePoll<HealthResponse>("/api/apps/health", 60_000);
  const [apps, setApps] = useState<AppEntry[]>(DEFAULT_APPS);
  const [hostHint, setHostHint] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setHostHint(window.location.hostname);
    fetch("/api/apps/list")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AppsResponse | null) => {
        if (d?.apps) setApps(d.apps);
      })
      .catch(() => {});
  }, []);

  const healthById = useMemo(() => {
    const map = new Map<string, AppHealth>();
    for (const h of healthData?.apps ?? []) map.set(h.id, h);
    return map;
  }, [healthData]);

  const total = apps.length;
  const okCount = apps.filter((a) => healthById.get(a.id)?.status === "ok").length;
  const downCount = apps.filter((a) => healthById.get(a.id)?.status === "down").length;

  const right = (
    <span className="font-mono">
      <span className="text-[#7dd67d]">
        <Dot tone="ok" />
        {okCount}/{total}
      </span>
      {downCount > 0 && (
        <>
          <span className="text-neutral-700 mx-2">·</span>
          <span className="text-[#d87373]">{downCount} nede</span>
        </>
      )}
      <span className="text-neutral-700 mx-2">·</span>
      <a href="/apps" className="text-sky-400 hover:text-sky-300">
        → apps
      </a>
    </span>
  );

  const handleClick = async (app: AppEntry) => {
    if (app.kind === "native-mac") {
      try {
        await fetch(`/api/apps/launch?id=${app.id}`, { method: "POST" });
      } catch {
        /* ignore */
      }
      return;
    }
    if (app.kind === "native-ios" || app.kind === "daemon") {
      window.location.href = "/apps";
      return;
    }
    const url = pickAppUrl(app, hostHint);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Section title="apps · hub" right={right} className="col-span-12">
      <div className="flex flex-wrap gap-2">
        {apps.map((app) => {
          const health = healthById.get(app.id);
          return (
            <button
              key={app.id}
              onClick={() => handleClick(app)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-neutral-900 hover:border-neutral-800 hover:bg-neutral-900/40 transition-colors"
              style={{ background: "#0d0d0d" }}
              title={app.description}
            >
              <span className="text-[14px] text-neutral-300 leading-none">{app.icon}</span>
              <span className="font-mono text-[11px] text-neutral-200 lowercase">{app.name}</span>
              <Dot tone={tone(health?.status)} />
            </button>
          );
        })}
      </div>
    </Section>
  );
}
