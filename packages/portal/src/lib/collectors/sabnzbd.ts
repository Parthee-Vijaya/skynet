import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SabnzbdData, SabnzbdSlot } from "@/lib/types";
import { getSetting } from "@/lib/settings";

const SABNZBD_CONFIG_PATHS = [
  join(homedir(), "Library", "Application Support", "SABnzbd", "sabnzbd.ini"),
  join(homedir(), ".sabnzbd", "sabnzbd.ini"),
];

/** Læs API-key fra SABnzbd's config-file (eller fra settings-DB hvis bruger har sat den manuelt) */
async function resolveApiKey(): Promise<string | null> {
  const setting = getSetting("sabnzbd_api_key");
  if (setting) return setting;
  for (const p of SABNZBD_CONFIG_PATHS) {
    try {
      const content = await fs.readFile(p, "utf8");
      const match = content.match(/^\s*api_key\s*=\s*([a-f0-9]{16,})/mi);
      if (match) return match[1];
    } catch { /* fil findes ikke — fortsæt */ }
  }
  return null;
}

function resolveBaseUrl(): string {
  return (getSetting("sabnzbd_url") || "http://127.0.0.1:8080").replace(/\/+$/, "");
}

interface SabApiQueue {
  queue?: {
    status?: string;
    speedlimit?: string;
    speedlimit_abs?: string;
    paused?: boolean;
    noofslots_total?: number;
    noofslots?: number;
    limit?: number;
    start?: number;
    timeleft?: string;
    size?: string;
    sizeleft?: string;
    mb?: string;
    mbleft?: string;
    kbpersec?: string;
    speed?: string;
    eta?: string;
    diskspace1?: string;
    diskspace2?: string;
    diskspacetotal1?: string;
    diskspacetotal2?: string;
    slots?: Array<{
      index?: number;
      nzo_id?: string;
      filename?: string;
      cat?: string;
      status?: string;
      priority?: string;
      percentage?: string;
      timeleft?: string;
      size?: string;
      sizeleft?: string;
      mb?: string;
      mbleft?: string;
    }>;
  };
}

interface SabApiHistory {
  history?: {
    total_size?: string;
    month_size?: string;
    week_size?: string;
    day_size?: string;
    noofslots?: number;
    slots?: Array<{
      name?: string;
      size?: string;
      status?: string;
      completed?: number;
      category?: string;
    }>;
  };
}

async function sabFetch<T>(base: string, key: string, mode: string): Promise<T | null> {
  try {
    const url = `${base}/api?mode=${mode}&output=json&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

/** "123.45" → 123.45 · "  " → 0 */
function parseNum(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export async function collect(): Promise<SabnzbdData> {
  const key = await resolveApiKey();
  const base = resolveBaseUrl();

  if (!key) {
    return {
      online: false,
      configured: false,
      reason: "api-key ikke fundet",
      slots: [],
      stats: { totalMb: 0, freeMb: 0, kbpersec: 0, paused: false, etaSeconds: 0 },
      history: { totalGb: 0, monthGb: 0, weekGb: 0, dayGb: 0 },
    };
  }

  const [queue, history] = await Promise.all([
    sabFetch<SabApiQueue>(base, key, "queue"),
    sabFetch<SabApiHistory>(base, key, "history"),
  ]);

  if (!queue?.queue) {
    return {
      online: false,
      configured: true,
      reason: "SABnzbd svarede ikke",
      slots: [],
      stats: { totalMb: 0, freeMb: 0, kbpersec: 0, paused: false, etaSeconds: 0 },
      history: { totalGb: 0, monthGb: 0, weekGb: 0, dayGb: 0 },
    };
  }

  const q = queue.queue;
  const slots: SabnzbdSlot[] = (q.slots ?? []).slice(0, 5).map((s) => ({
    id: s.nzo_id ?? "",
    name: (s.filename ?? "").slice(0, 80),
    category: s.cat ?? null,
    status: s.status ?? "unknown",
    percent: parseNum(s.percentage),
    sizeMb: parseNum(s.mb),
    sizeLeftMb: parseNum(s.mbleft),
    timeLeft: s.timeleft ?? "",
  }));

  // Parse "HH:MM:SS" til sekunder for widget
  const etaSeconds = (() => {
    const t = q.timeleft ?? "";
    const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (!m) return 0;
    const h = parseInt(m[1] ?? "0", 10);
    const mm = parseInt(m[2], 10);
    const ss = parseInt(m[3], 10);
    return h * 3600 + mm * 60 + ss;
  })();

  const h = history?.history;

  return {
    online: true,
    configured: true,
    slots,
    stats: {
      totalMb: parseNum(q.mb),
      leftMb: parseNum(q.mbleft),
      freeMb: parseNum(q.diskspace1) * 1024, // diskspace1 er i GB i SABnzbd JSON
      kbpersec: parseNum(q.kbpersec),
      paused: !!q.paused,
      etaSeconds,
      timeLeftRaw: q.timeleft ?? "",
    },
    history: {
      totalGb: parseNum(h?.total_size?.replace(/[^0-9.]/g, "") ?? "0"),
      monthGb: parseNum(h?.month_size?.replace(/[^0-9.]/g, "") ?? "0"),
      weekGb: parseNum(h?.week_size?.replace(/[^0-9.]/g, "") ?? "0"),
      dayGb: parseNum(h?.day_size?.replace(/[^0-9.]/g, "") ?? "0"),
    },
    queueCount: q.noofslots ?? slots.length,
  };
}
