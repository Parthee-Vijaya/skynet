import { parseStringPromise } from "xml2js";
import type { PlexData, PlexStream } from "@/lib/types";
import { getSetting } from "@/lib/settings";

const PLEX_URL = "http://localhost:32400";
const TIMEOUT = 5000;

async function plexFetch(path: string, token: string): Promise<string> {
  const url = `${PLEX_URL}${path}${path.includes("?") ? "&" : "?"}X-Plex-Token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`Plex HTTP ${res.status}`);
  return res.text();
}

interface SessionVideo {
  $: {
    title?: string;
    grandparentTitle?: string;
    type?: string;
    duration?: string;
    viewOffset?: string;
  };
  Player?: Array<{ $: { product?: string; title?: string; device?: string } }>;
  Media?: Array<{ $: { videoResolution?: string } }>;
}

interface LibrarySection {
  $: { type?: string };
  Directory?: Array<{ $: { type?: string } }>;
}

export async function collect(): Promise<PlexData> {
  const token = getSetting("plex_token");
  if (!token) {
    return { online: false, sessions: [], library: { movies: 0, shows: 0, sizeBytes: 0 } };
  }

  try {
    const [sessionsXml, librariesXml] = await Promise.all([
      plexFetch("/status/sessions", token),
      plexFetch("/library/sections", token),
    ]);

    const sessionsData = await parseStringPromise(sessionsXml);
    const videos: SessionVideo[] = sessionsData.MediaContainer?.Video ?? [];

    const sessions: PlexStream[] = videos.map((v) => {
      const duration = Number(v.$.duration ?? 0);
      const offset = Number(v.$.viewOffset ?? 0);
      const progress = duration > 0 ? Math.round((offset / duration) * 100) : 0;
      const remainingMinutes = duration > 0 ? Math.round((duration - offset) / 60000) : 0;
      const player = v.Player?.[0]?.$;
      const media = v.Media?.[0]?.$;

      return {
        title: v.$.grandparentTitle ? `${v.$.grandparentTitle} — ${v.$.title}` : v.$.title ?? "—",
        player: player?.product ?? player?.device ?? "Ukendt",
        quality: media?.videoResolution ? media.videoResolution.toUpperCase() : "—",
        progress,
        remainingMinutes,
      };
    });

    const librariesData = await parseStringPromise(librariesXml);
    const directories: NonNullable<LibrarySection["Directory"]> =
      librariesData.MediaContainer?.Directory ?? [];
    let movies = 0;
    let shows = 0;
    for (const d of directories) {
      if (d.$.type === "movie") movies++;
      if (d.$.type === "show") shows++;
    }

    return {
      online: true,
      sessions,
      library: { movies, shows, sizeBytes: 0 },
    };
  } catch {
    return { online: false, sessions: [], library: { movies: 0, shows: 0, sizeBytes: 0 } };
  }
}
