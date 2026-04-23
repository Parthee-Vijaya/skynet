import type { EarthquakesData, EarthquakeItem } from "@/lib/types";

// USGS GeoJSON — no key required.
// Past day, significant (M4.5+).

interface GeoFeature {
  properties: {
    mag: number;
    place: string;
    time: number;
    tsunami: number;
    url: string;
  };
  geometry: { coordinates: [number, number, number] };
}

interface GeoResponse {
  features: GeoFeature[];
}

export async function collect(): Promise<EarthquakesData> {
  try {
    const res = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
      { signal: AbortSignal.timeout(9000), cache: "no-store" }
    );
    if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
    const data = (await res.json()) as GeoResponse;

    const items: EarthquakeItem[] = data.features
      .map((f) => ({
        magnitude: Math.round(f.properties.mag * 10) / 10,
        place: f.properties.place,
        depthKm: Math.round(f.geometry.coordinates[2] * 10) / 10,
        timeMs: f.properties.time,
        tsunami: Boolean(f.properties.tsunami),
        url: f.properties.url,
      }))
      .sort((a, b) => b.timeMs - a.timeMs);

    const largest =
      items.length > 0
        ? [...items].sort((a, b) => b.magnitude - a.magnitude)[0]
        : null;

    return {
      count: items.length,
      largest,
      items: items.slice(0, 8),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      count: 0,
      largest: null,
      items: [],
      fetchedAt: new Date().toISOString(),
      error: (err as Error).message,
    };
  }
}
