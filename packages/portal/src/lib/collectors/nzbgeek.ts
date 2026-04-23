import { parseStringPromise } from "xml2js";
import { getSetting } from "@/lib/settings";
import type { NzbData, NzbItem } from "@/lib/types";

function pick(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length) return pick(v[0]);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o._ === "string") return o._;
  }
  return "";
}

function formatSize(bytes: number): string {
  if (!bytes || isNaN(bytes)) return "";
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export async function collect(): Promise<NzbData> {
  const url = getSetting("nzbgeek_rss_url");
  if (!url) return { configured: false, items: [] };

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(url, {
      headers: { "User-Agent": "SkynetDashboard/1.0", Accept: "application/rss+xml, application/xml" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true });
    const rawItems = parsed?.rss?.channel?.item ?? [];
    const list = Array.isArray(rawItems) ? rawItems : [rawItems];

    const items: NzbItem[] = list
      .filter(Boolean)
      .slice(0, 10)
      .map((i: Record<string, unknown>) => {
        const attrs = (i["newznab:attr"] ?? []) as unknown[];
        const attrList = Array.isArray(attrs) ? attrs : [attrs];
        let sizeBytes = 0;
        let category = "";
        for (const a of attrList) {
          const aObj = a as { $?: { name?: string; value?: string } };
          if (aObj?.$?.name === "size") sizeBytes = Number(aObj.$?.value) || 0;
          if (aObj?.$?.name === "category") category = aObj.$?.value ?? category;
        }
        if (!sizeBytes) {
          const encAny = i.enclosure as unknown;
          const enc = Array.isArray(encAny) ? encAny[0] : encAny;
          const encObj = enc as { $?: { length?: string } } | undefined;
          sizeBytes = Number(encObj?.$?.length) || 0;
        }
        return {
          title: pick(i.title),
          link: pick(i.link),
          size: formatSize(sizeBytes),
          category: category || pick(i.category) || "",
          pubDate: pick(i.pubDate),
        };
      })
      .filter((i) => i.title);

    return { configured: true, items };
  } catch (e) {
    return {
      configured: true,
      items: [],
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}
