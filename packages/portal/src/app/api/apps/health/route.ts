import { NextResponse } from "next/server";
import { getAppsWithOverrides } from "@/lib/apps.server";
import { execFileSync } from "node:child_process";

/**
 * Server-side health-ping af alle apps i registry.
 *
 * - `web`-apps: HTTP GET af `healthUrl` med 3s timeout. 2xx = ok, andet = down.
 * - `native-mac`: `pgrep -f "<App>.app"` — running hvis exit-kode 0.
 * - `native-ios`: altid "unknown" (kan ikke pinges fra Mac).
 * - `daemon`: hvis ingen `healthUrl`, "unknown". Ellers samme som web.
 *
 * Cachet 30s for at undgå at hamre apps med pings hvert sekund.
 */

export type AppStatus = "ok" | "down" | "unknown";

export interface AppHealth {
  id: string;
  status: AppStatus;
  latencyMs?: number;
  error?: string;
}

interface CacheEntry {
  ts: number;
  results: AppHealth[];
}

const CACHE_TTL_MS = 30_000;
let cache: CacheEntry | null = null;

async function pingHttp(url: string): Promise<AppHealth> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const latency = Date.now() - started;
    if (res.ok) {
      return { id: "", status: "ok", latencyMs: latency };
    }
    return { id: "", status: "down", latencyMs: latency, error: `HTTP ${res.status}` };
  } catch (err) {
    const latency = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    return { id: "", status: "down", latencyMs: latency, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

function pgrepMacApp(appName: string): AppHealth {
  try {
    execFileSync("/usr/bin/pgrep", ["-f", `${appName}.app`], { stdio: "ignore" });
    return { id: "", status: "ok" };
  } catch {
    return { id: "", status: "down" };
  }
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ apps: cache.results, cached: true });
  }

  const apps = getAppsWithOverrides();
  const results = await Promise.all(
    apps.map(async (app): Promise<AppHealth> => {
      if (app.kind === "native-ios") return { id: app.id, status: "unknown" };
      if (app.kind === "native-mac") {
        if (!app.appName) return { id: app.id, status: "unknown" };
        return { ...pgrepMacApp(app.appName), id: app.id };
      }
      if (app.kind === "daemon") {
        if (!app.healthUrl) return { id: app.id, status: "unknown" };
        return { ...(await pingHttp(app.healthUrl)), id: app.id };
      }
      // web
      if (!app.healthUrl) return { id: app.id, status: "unknown" };
      return { ...(await pingHttp(app.healthUrl)), id: app.id };
    })
  );

  cache = { ts: now, results };
  return NextResponse.json({ apps: results, cached: false });
}
