import type { ApodData } from "@/lib/types";

// NASA APOD — DEMO_KEY works but is rate-limited (30/hour, 50/day per IP).
// User can set NASA_API_KEY in env for a higher limit.

interface ApodRaw {
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: "image" | "video";
  date: string;
  copyright?: string;
}

export async function collect(): Promise<ApodData> {
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  try {
    const res = await fetch(
      `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(9000), next: { revalidate: 3600 } }
    );
    if (!res.ok) throw new Error(`NASA HTTP ${res.status}`);
    const d = (await res.json()) as ApodRaw;
    return {
      title: d.title,
      explanation: d.explanation,
      imageUrl: d.url,
      hdUrl: d.hdurl ?? null,
      mediaType: d.media_type,
      date: d.date,
      copyright: d.copyright?.trim() ?? null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      title: "APOD ikke tilgængelig",
      explanation: "",
      imageUrl: "",
      hdUrl: null,
      mediaType: "image",
      date: new Date().toISOString().slice(0, 10),
      copyright: null,
      fetchedAt: new Date().toISOString(),
      error: (err as Error).message,
    };
  }
}
