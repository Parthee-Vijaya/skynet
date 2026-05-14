"use client";

import { useEffect, useMemo, useState } from "react";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import { Section, Dot } from "@/components/minimal/primitives";
import { usePoll } from "@/hooks/usePoll";
import { DEFAULT_APPS, type AppEntry, pickAppUrl } from "@/lib/apps";
import type { AppHealth } from "../api/apps/health/route";

interface HealthResponse {
  apps: AppHealth[];
  cached: boolean;
}

interface AppsResponse {
  apps: AppEntry[];
}

function statusTone(status: AppHealth["status"] | undefined): "ok" | "warn" | "bad" | "dim" {
  if (status === "ok") return "ok";
  if (status === "down") return "bad";
  return "dim";
}

function statusLabel(app: AppEntry, health: AppHealth | undefined): string {
  if (app.kind === "native-ios") return "iOS";
  if (app.kind === "native-mac") return "native";
  if (app.kind === "external") return "ekstern";
  if (app.kind === "daemon" && !app.healthUrl) return "daemon";
  if (!health) return "checker…";
  if (health.status === "ok") return "kører";
  if (health.status === "down") return "nede";
  return "ukendt";
}

function statusToneFor(app: AppEntry, health: AppHealth | undefined): "ok" | "warn" | "bad" | "dim" {
  if (app.kind === "external") return "dim";
  if (app.kind === "native-mac" || app.kind === "native-ios") return "dim";
  return statusTone(health?.status);
}

function AppCard({ app, health, hostHint }: { app: AppEntry; health: AppHealth | undefined; hostHint: string }) {
  const url = pickAppUrl(app, hostHint);
  const tone = statusToneFor(app, health);
  const label = statusLabel(app, health);

  const open = async () => {
    if (app.kind === "native-mac") {
      try {
        const res = await fetch(`/api/apps/launch?id=${app.id}`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(`Kunne ikke åbne ${app.name}: ${data.error ?? res.status}`);
        }
      } catch (err) {
        alert(`Fejl ved start af ${app.name}: ${String(err)}`);
      }
      return;
    }
    if (app.kind === "native-ios") {
      alert(`${app.name} er en iOS-app. ${app.iosNote ?? "Åbn den på din iPhone."}`);
      return;
    }
    if (!url) {
      alert(`${app.name} har ingen URL konfigureret. Tilføj en i settings.`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const canOpen =
    app.kind === "native-mac" ||
    app.kind === "native-ios" ||
    !!url;

  return (
    <button
      onClick={open}
      disabled={!canOpen}
      className="text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-900/30 rounded-sm p-4 border border-neutral-900 hover:border-neutral-800"
      style={{ background: "#0d0d0d" }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="text-[24px] leading-none text-neutral-300">{app.icon}</div>
        <div className="font-mono text-[10px] text-neutral-500">
          <Dot tone={tone} />
          {label}
        </div>
      </div>
      <div className="font-mono text-[14px] text-neutral-100 lowercase">{app.name}</div>
      <div className="font-mono text-[11px] text-neutral-500 mt-1 leading-relaxed">{app.description}</div>
      {url && (
        <div className="font-mono text-[10px] text-neutral-700 mt-2 truncate">{url.replace(/^https?:\/\//, "")}</div>
      )}
      {app.kind === "native-mac" && (
        <div className="font-mono text-[10px] text-neutral-700 mt-2">native · open -a {app.appName}</div>
      )}
      {app.kind === "native-ios" && (
        <div className="font-mono text-[10px] text-neutral-700 mt-2">{app.iosNote}</div>
      )}
      {app.kind === "daemon" && (
        <div className="font-mono text-[10px] text-neutral-700 mt-2">baggrundsservice</div>
      )}
      {app.kind === "external" && (
        <div className="font-mono text-[10px] text-neutral-700 mt-2">ekstern · åbner i ny tab ↗</div>
      )}
    </button>
  );
}

export default function AppsPage() {
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
      .catch(() => {
        // fald tilbage til DEFAULT_APPS hvis endpoint ikke findes
      });
  }, []);

  const healthById = useMemo(() => {
    const map = new Map<string, AppHealth>();
    for (const h of healthData?.apps ?? []) map.set(h.id, h);
    return map;
  }, [healthData]);

  const total = apps.length;
  const okCount = apps.filter((a) => healthById.get(a.id)?.status === "ok").length;
  const downCount = apps.filter((a) => healthById.get(a.id)?.status === "down").length;

  return (
    <MinimalPageLayout active="apps">
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px 60px" }}>
        <Section
          title="apps · hub"
          right={
            <span className="font-mono">
              <span className="text-[#7dd67d]">
                <Dot tone="ok" />
                {okCount}/{total} oppe
              </span>
              {downCount > 0 && (
                <>
                  <span className="text-neutral-700 mx-2">·</span>
                  <span className="text-[#d87373]">{downCount} nede</span>
                </>
              )}
            </span>
          }
        >
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            }}
          >
            {apps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                health={healthById.get(app.id)}
                hostHint={hostHint}
              />
            ))}
          </div>

          <div className="mt-6 font-mono text-[10px] text-neutral-700 leading-relaxed">
            <div>klik på et kort for at åbne i ny tab.</div>
            <div>
              ret URL'er via{" "}
              <a href="/settings" className="text-neutral-500 hover:text-neutral-300">
                settings → apps
              </a>
              .
            </div>
          </div>
        </Section>
      </main>
    </MinimalPageLayout>
  );
}
