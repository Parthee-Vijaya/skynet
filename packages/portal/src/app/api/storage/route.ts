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
import { stat } from "fs/promises";
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

async function trashLastEmptied(trashPath: string): Promise<string | null> {
  // Brug mtime på .Trash som proxy — ændrer sig når trash er tømt eller ny fil placeret
  // Detail er "ikke tømt nyligt" hvis trash har indhold
  try {
    const s = await stat(trashPath);
    return fmtRelative(Date.now() - s.mtimeMs);
  } catch {
    return null;
  }
}

async function fetchStorage(): Promise<StorageResponse> {
  const home = os.homedir();
  const trash = path.join(home, ".Trash");
  const downloads = path.join(home, "Downloads");
  const icloud = path.join(home, "Library/Mobile Documents/com~apple~CloudDocs");
  const photos = path.join(home, "Pictures/Photos Library.photoslibrary");

  // Kør parallelt — Trash + Downloads er typisk hurtige, iCloud + Photos kan tage tid
  const [trashBytes, downloadsBytes, icloudBytes, photosBytes, trashTouched] = await Promise.all([
    duPath(trash, 5_000),
    duPath(downloads, 10_000),
    duPath(icloud, 60_000),
    duPath(photos, 60_000),
    trashLastEmptied(trash),
  ]);

  const items: StorageItem[] = [
    { label: "Trash", bytes: trashBytes, detail: trashTouched ? `rørt ${trashTouched}` : undefined },
    { label: "Downloads", bytes: downloadsBytes },
    { label: "iCloud Drive", bytes: icloudBytes },
    { label: "Photos Library", bytes: photosBytes },
  ];

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
