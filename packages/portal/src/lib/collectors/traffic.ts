import type { TrafficData, TrafficIncident } from "@/lib/types";

const URL = "https://storage.googleapis.com/trafikkort-data/geojson/big-screen-events.json";

interface GeoFeature {
  properties?: {
    title?: string;
    header?: string;
    description?: string;
    beginPeriod?: string;
    lastModifiedString?: string;
    layerId?: string;
  };
  geometry?: { coordinates?: [number, number] };
}

interface GeoLayer {
  layerId?: string;
  layerName?: string;
  features?: GeoFeature[];
}

const INTERESTING_PREFIXES = [
  "current-roadblocks",
  "current-blocking-roadwork",
  "current-other-traffic-announcements",
  "current-queue",
  "current-roadwork",
];

function baseLayer(name: string | undefined): string {
  if (!name) return "";
  return name.replace(/\.(point|line|polygon)$/i, "");
}

function priorityFor(layerName: string): number {
  const idx = INTERESTING_PREFIXES.indexOf(layerName);
  return idx === -1 ? 99 : idx;
}

function isInteresting(layerName: string): boolean {
  return INTERESTING_PREFIXES.includes(layerName);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function cleanHeader(s: string): string {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

export async function collect(): Promise<TrafficData> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(URL, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as GeoLayer[];

    const incidents: TrafficIncident[] = [];
    const seen = new Set<string>();
    for (const layer of data) {
      const base = baseLayer(layer.layerName);
      if (!isInteresting(base)) continue;
      for (const f of layer.features ?? []) {
        const p = f.properties ?? {};
        if (!p.header && !p.title) continue;
        const key = `${p.header ?? p.title}|${p.beginPeriod ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        incidents.push({
          title: cleanHeader(p.title ?? ""),
          header: cleanHeader(p.header ?? p.title ?? ""),
          description: p.description ? stripHtml(p.description) : "",
          begin: p.beginPeriod ?? "",
          updated: p.lastModifiedString ?? "",
          layer: base,
          priority: priorityFor(base),
        });
      }
    }

    incidents.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const ta = new Date(a.updated).getTime() || 0;
      const tb = new Date(b.updated).getTime() || 0;
      return tb - ta;
    });

    return {
      total: incidents.length,
      incidents: incidents.slice(0, 6),
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      total: 0,
      incidents: [],
      fetchedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}
