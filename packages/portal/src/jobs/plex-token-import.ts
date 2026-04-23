import { promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import { parseStringPromise } from "xml2js";
import { getSetting, setSetting } from "@/lib/settings";

const execAsync = promisify(exec);

async function fromMacDefaults(): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      "defaults read com.plexapp.plexmediaserver PlexOnlineToken",
      { timeout: 2000 }
    );
    const token = stdout.trim();
    return token && token !== "(null)" ? token : null;
  } catch {
    return null;
  }
}

async function fromPreferencesXml(): Promise<string | null> {
  const candidates = [
    path.join(os.homedir(), "Library/Application Support/Plex Media Server/Preferences.xml"),
    path.join(os.homedir(), "Library/Preferences/com.plexapp.plexmediaserver.plist.xml"),
  ];
  for (const p of candidates) {
    try {
      const xml = await fs.readFile(p, "utf8");
      const parsed = await parseStringPromise(xml, { explicitArray: false });
      const token = parsed?.Preferences?.$?.PlexOnlineToken as string | undefined;
      if (token) return token;
    } catch {
      // skip
    }
  }
  return null;
}

export async function autoImportPlexToken(): Promise<void> {
  if (getSetting("plex_token")) return;

  const token = (await fromMacDefaults()) ?? (await fromPreferencesXml());
  if (token) {
    setSetting("plex_token", token);
    console.log("[plex] Auto-imported token");
  }
}
