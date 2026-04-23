import { parseStringPromise } from "xml2js";
import type { FeedBundle, FeedItem } from "@/lib/types";

interface FeedSource {
  name: string;
  url: string;
  type: "rss" | "atom";
}

const FEEDS: FeedSource[] = [
  { name: "DR", url: "https://www.dr.dk/nyheder/service/feeds/allenyheder", type: "rss" },
  { name: "Politiken", url: "https://politiken.dk/rss/senestenyt.rss", type: "rss" },
  { name: "BBC", url: "https://feeds.bbci.co.uk/news/rss.xml", type: "rss" },
  { name: "Reddit", url: "https://www.reddit.com/r/news/.rss", type: "atom" },
];

const USER_AGENT = "SkynetDashboard/1.0 (+local)";

function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function pickString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length) return pickString(v[0]);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o._ === "string") return o._;
    if (typeof o.$ === "object" && o.$ && typeof (o.$ as Record<string, unknown>).href === "string") {
      return (o.$ as Record<string, string>).href;
    }
  }
  return "";
}

async function fetchText(url: string, timeoutMs = 6000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function parseRss(xml: string, source: string): Promise<FeedItem[]> {
  const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true });
  const items = parsed?.rss?.channel?.item ?? [];
  const list = Array.isArray(items) ? items : [items];
  return list
    .filter(Boolean)
    .map((i: Record<string, unknown>) => ({
      title: stripHtml(pickString(i.title)),
      link: pickString(i.link),
      pubDate: pickString(i.pubDate) || pickString(i["dc:date"]),
      source,
      category: pickString(i.category),
    }))
    .filter((i) => i.title && i.link);
}

async function parseAtom(xml: string, source: string): Promise<FeedItem[]> {
  const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true });
  const entries = parsed?.feed?.entry ?? [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list
    .filter(Boolean)
    .map((e: Record<string, unknown>) => {
      let link = "";
      const l = e.link as unknown;
      if (Array.isArray(l)) {
        const first = l.find(
          (x) => (x as Record<string, unknown>)?.$ && ((x as Record<string, Record<string, string>>).$?.rel ?? "alternate") === "alternate"
        );
        link = (first as Record<string, Record<string, string>>)?.$?.href ?? "";
      } else if (l && typeof l === "object") {
        link = (l as Record<string, Record<string, string>>).$?.href ?? "";
      }
      return {
        title: stripHtml(pickString(e.title)),
        link,
        pubDate: pickString(e.updated) || pickString(e.published),
        source,
        category: pickString(e.category),
      };
    })
    .filter((i) => i.title && i.link);
}

export async function collect(): Promise<FeedBundle> {
  const errors: string[] = [];
  const results = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const xml = await fetchText(f.url);
        const parsed = f.type === "atom" ? await parseAtom(xml, f.name) : await parseRss(xml, f.name);
        return parsed.slice(0, 8);
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : "unknown"}`);
        return [];
      }
    })
  );
  const merged = results.flat();
  merged.sort((a, b) => {
    const ta = new Date(a.pubDate).getTime() || 0;
    const tb = new Date(b.pubDate).getTime() || 0;
    return tb - ta;
  });
  return {
    items: merged.slice(0, 24),
    fetchedAt: new Date().toISOString(),
    errors,
  };
}
