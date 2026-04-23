import type { DiscoverData, DiscoverSlide } from "@/lib/types";

interface ApodRaw {
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: "image" | "video";
  date: string;
  copyright?: string;
}

interface UselessFact {
  id: string;
  text: string;
  source_url?: string;
  language?: string;
}

interface WikiFeatured {
  image?: {
    title?: string;
    description?: { text?: string };
    image?: { source?: string };
    file_page?: string;
  };
  onthisday?: Array<{
    text: string;
    year: number;
    pages?: Array<{
      titles?: { normalized?: string };
      thumbnail?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
    }>;
  }>;
  tfa?: {
    titles?: { normalized?: string };
    extract?: string;
    thumbnail?: { source?: string };
    content_urls?: { desktop?: { page?: string } };
  };
}

async function fetchJson<T>(url: string, timeoutMs = 6000, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchApodSlides(): Promise<DiscoverSlide[]> {
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const base = `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}`;

  // Prøv først et interval (kræver ofte rigtig nøgle — kan fejle med DEMO_KEY)
  const end = new Date();
  const start = new Date(end.getTime() - 6 * 86400 * 1000);
  const rangeUrl = `${base}&start_date=${fmt(start)}&end_date=${fmt(end)}`;
  const range = await fetchJson<ApodRaw[]>(rangeUrl, 9000);

  let rows: ApodRaw[] = [];
  if (Array.isArray(range) && range.length > 0) {
    rows = range;
  } else {
    // Fallback: bare dagens billede
    const today = await fetchJson<ApodRaw>(base, 7000);
    if (today) rows = [today];
  }

  return rows
    .filter((d) => d.media_type === "image" && d.url)
    .map((d) => ({
      id: `nasa-${d.date}`,
      source: "NASA · APOD",
      title: d.title,
      body: d.explanation,
      imageUrl: d.url,
      date: d.date,
      link: `https://apod.nasa.gov/apod/ap${d.date.slice(2).replace(/-/g, "")}.html`,
      credit: d.copyright?.trim() || null,
    }));
}

async function fetchUselessFacts(count = 4): Promise<DiscoverSlide[]> {
  const results: DiscoverSlide[] = [];
  // Hent i parallel — API'et tilbyder ikke batch, så vi laver N kald.
  const promises = Array.from({ length: count }, () =>
    fetchJson<UselessFact>(
      "https://uselessfacts.jsph.pl/api/v2/facts/random?language=en",
      4000
    )
  );
  const facts = await Promise.all(promises);
  for (const f of facts) {
    if (!f) continue;
    results.push({
      id: `fact-${f.id}`,
      source: "Vidste du?",
      title: "Sjovt faktum",
      body: f.text,
      imageUrl: null,
      date: null,
      link: f.source_url || null,
      credit: null,
    });
  }
  return results;
}

async function fetchWikiFeatured(): Promise<DiscoverSlide[]> {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const headers = { "User-Agent": "SKYNET-Dashboard/1.0 (personal)" };

  const [en, da] = await Promise.all([
    fetchJson<WikiFeatured>(
      `https://en.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${day}`,
      6000,
      headers
    ),
    fetchJson<WikiFeatured>(
      `https://da.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${day}`,
      6000,
      headers
    ),
  ]);

  const slides: DiscoverSlide[] = [];

  // Billede af dagen (Wikimedia Commons)
  const img = en?.image ?? da?.image;
  if (img?.image?.source) {
    slides.push({
      id: `wiki-img-${y}${m}${day}`,
      source: "Wikipedia · Dagens billede",
      title: img.title?.replace(/^File:/, "").replace(/\.(jpg|jpeg|png|tif|tiff)$/i, "") ?? "Dagens billede",
      body: img.description?.text?.replace(/<[^>]+>/g, "") ?? "",
      imageUrl: img.image.source,
      date: `${y}-${m}-${day}`,
      link: img.file_page ?? null,
      credit: "Wikimedia Commons",
    });
  }

  // Dagens udvalgte artikel
  const tfa = da?.tfa ?? en?.tfa;
  if (tfa?.extract) {
    slides.push({
      id: `wiki-tfa-${y}${m}${day}`,
      source: "Wikipedia · Udvalgt artikel",
      title: tfa.titles?.normalized ?? "Udvalgt",
      body: tfa.extract,
      imageUrl: tfa.thumbnail?.source ?? null,
      date: `${y}-${m}-${day}`,
      link: tfa.content_urls?.desktop?.page ?? null,
      credit: null,
    });
  }

  // På denne dag — op til 3 events
  const otd = en?.onthisday ?? da?.onthisday ?? [];
  otd.slice(0, 3).forEach((ev, i) => {
    const page = ev.pages?.[0];
    slides.push({
      id: `wiki-otd-${y}${m}${day}-${i}`,
      source: `På denne dag · ${ev.year}`,
      title: page?.titles?.normalized ?? "Historisk begivenhed",
      body: ev.text,
      imageUrl: page?.thumbnail?.source ?? null,
      date: `${y}-${m}-${day}`,
      link: page?.content_urls?.desktop?.page ?? null,
      credit: null,
    });
  });

  return slides;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function collect(): Promise<DiscoverData> {
  const [apod, facts, wiki] = await Promise.allSettled([
    fetchApodSlides(),
    fetchUselessFacts(4),
    fetchWikiFeatured(),
  ]);

  const all: DiscoverSlide[] = [
    ...(apod.status === "fulfilled" ? apod.value : []),
    ...(facts.status === "fulfilled" ? facts.value : []),
    ...(wiki.status === "fulfilled" ? wiki.value : []),
  ];

  // Bland kilder så man ikke ser 7 NASA-billeder i træk, men prioriter
  // billed-slides så der er et visuelt element med jævne mellemrum.
  const withImage = shuffle(all.filter((s) => s.imageUrl));
  const textOnly = shuffle(all.filter((s) => !s.imageUrl));
  const slides: DiscoverSlide[] = [];
  // Fletter: billede, billede, tekst, billede, tekst, …
  let imgI = 0;
  let txtI = 0;
  while (imgI < withImage.length || txtI < textOnly.length) {
    if (imgI < withImage.length) slides.push(withImage[imgI++]);
    if (imgI < withImage.length && slides.length % 3 !== 2) slides.push(withImage[imgI++]);
    if (txtI < textOnly.length) slides.push(textOnly[txtI++]);
  }

  return {
    slides,
    fetchedAt: new Date().toISOString(),
    error: slides.length === 0 ? "Ingen kilder tilgængelige" : undefined,
  };
}
