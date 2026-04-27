/**
 * /api/storage — du-baseret storage breakdown for cockpit-disk-widget.
 *
 * Kører `du -sk` på faste paths (Trash, Downloads, iCloud, Photos) med 1h cache
 * fordi det er dyrt på store libraries. Tag højde for at iCloud/Photos kan
 * tage 10-30s første gang.
 */
import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import { readdir, stat } from "fs/promises";
import { getOrRefresh } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

export interface StorageItem {
  label: string;
  bytes: number;
  detail?: string;
}

export interface StorageResponse {
  items: StorageItem[];
  fetchedAt: number;
}

async function duPath(p: string, timeoutMs = 30_000): Promise<number> {
  try {
    const { stdout } = await execAsync(`du -sk "${p}"`, { timeout: timeoutMs });
    const kb = Number(stdout.trim().split(/\s+/)[0] ?? 0);
    return kb * 1024;
  } catch {
    return 0;
  }
}

function fmtRelative(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s siden`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t siden`;
  const d = Math.floor(h / 24);
  return `${d}d siden`;
}

async function findOneDrivePath(home: string): Promise<string | null> {
  // OneDrive på macOS kan ligge:
  //   1. ~/Library/CloudStorage/OneDrive-* (modern File Provider)
  //   2. ~/OneDrive eller ~/OneDrive-* (legacy)
  //   3. Custom location set af brugeren
  const candidates: string[] = [];
  try {
    const cs = await readdir(path.join(home, "Library/CloudStorage"));
    for (const e of cs) if (e.startsWith("OneDrive")) candidates.push(path.join(home, "Library/CloudStorage", e));
  } catch { /* dir mangler eller er tom */ }
  try {
    const homeEntries = await readdir(home);
    for (const e of homeEntries) if (e.startsWith("OneDrive")) candidates.push(path.join(home, e));
  } catch { /* ignorer */ }
  return candidates[0] ?? null;
}

async function fetchStorage(): Promise<StorageResponse> {
  const home = os.homedir();
  const desktop = path.join(home, "Desktop");
  const onedrive = await findOneDrivePath(home);

  const items: StorageItem[] = [];

  // Skrivebord
  const desktopBytes = await duPath(desktop, 15_000);
  items.push({
    label: "Skrivebord",
    bytes: desktopBytes,
    detail: desktopBytes === 0 ? "TCC?" : undefined,
  });

  // OneDrive
  if (onedrive) {
    const odBytes = await duPath(onedrive, 60_000);
    items.push({
      label: "OneDrive",
      bytes: odBytes,
      detail: odBytes === 0 ? "TCC?" : path.basename(onedrive),
    });
  } else {
    items.push({
      label: "OneDrive",
      bytes: 0,
      detail: "ikke synkroniseret",
    });
  }

  // Externe drev — alle mounts under /Volumes undtaget den interne (Macintosh HD)
  try {
    const volEntries = await readdir("/Volumes");
    for (const v of volEntries) {
      if (v.startsWith(".") || v === "Macintosh HD") continue;
      const volPath = path.join("/Volumes", v);
      try {
        const s = await stat(volPath);
        if (!s.isDirectory()) continue;
        // Brug df i stedet for du — meget hurtigere på externe drev
        const { stdout } = await execAsync(`df -k "${volPath}" | tail -1`, { timeout: 3000 });
        const parts = stdout.trim().split(/\s+/);
        const usedKB = Number(parts[2] ?? 0);
        items.push({
          label: v,
          bytes: usedKB * 1024,
          detail: "external",
        });
      } catch { /* skip volume vi ikke kan læse */ }
    }
  } catch { /* /Volumes utilgængeligt */ }

  return { items, fetchedAt: Date.now() };
}

export async function GET() {
  try {
    const data = await getOrRefresh<StorageResponse>("storage-breakdown", 60 * 60_000, fetchStorage);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown", items: [], fetchedAt: 0 },
      { status: 500 },
    );
  }
}
