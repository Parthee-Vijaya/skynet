import type { SpaceWeatherData } from "@/lib/types";

// NOAA SWPC open JSON — no key required.
// Kp planetary index + solar wind + GOES X-ray class.

interface KpRow {
  time_tag: string;
  kp_index: number;
  estimated_kp?: number;
}

interface WindRow {
  time_tag: string;
  speed: number | null;
  density: number | null;
}

interface XrayRow {
  time_tag: string;
  satellite: number;
  flux: number;
  energy: string; // "0.1-0.8nm"
}

function auroraBand(kp: number | null): "low" | "moderate" | "high" | "severe" {
  if (kp == null) return "low";
  if (kp < 4) return "low";
  if (kp < 5) return "moderate";
  if (kp < 7) return "high";
  return "severe";
}

function xrayClass(flux: number | null): string | null {
  if (flux == null || flux <= 0) return null;
  // W/m². Class: A 1e-8, B 1e-7, C 1e-6, M 1e-5, X 1e-4.
  if (flux < 1e-7) return `A${(flux / 1e-8).toFixed(1)}`;
  if (flux < 1e-6) return `B${(flux / 1e-7).toFixed(1)}`;
  if (flux < 1e-5) return `C${(flux / 1e-6).toFixed(1)}`;
  if (flux < 1e-4) return `M${(flux / 1e-5).toFixed(1)}`;
  return `X${(flux / 1e-4).toFixed(1)}`;
}

async function fetchJson<T>(url: string, timeout = 8000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function collect(): Promise<SpaceWeatherData> {
  try {
    const [kp, wind, xray] = await Promise.allSettled([
      fetchJson<KpRow[]>("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"),
      fetchJson<WindRow[]>("https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json"),
      fetchJson<XrayRow[]>("https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json"),
    ]);

    let kpIndex: number | null = null;
    let trend: number[] = [];
    if (kp.status === "fulfilled") {
      // NOAA k-index returns [header, ...rows] — first row often column headers.
      const rows = (kp.value as unknown as Array<Array<string | number>>).slice(1);
      const parsed = rows
        .map((r) => Number(r[1]))
        .filter((n) => !isNaN(n));
      if (parsed.length > 0) {
        kpIndex = Math.round(parsed[parsed.length - 1] * 10) / 10;
        trend = parsed.slice(-12);
      }
    }

    let solarWindKmS: number | null = null;
    if (wind.status === "fulfilled") {
      // Also [header, ...rows]. Columns typically: time, density, speed, temp.
      const rows = (wind.value as unknown as Array<Array<string | number>>).slice(1);
      for (let i = rows.length - 1; i >= 0; i--) {
        const speed = Number(rows[i][2]);
        if (!isNaN(speed) && speed > 0) {
          solarWindKmS = Math.round(speed);
          break;
        }
      }
    }

    let xrayCls: string | null = null;
    if (xray.status === "fulfilled") {
      const longWave = (xray.value as XrayRow[]).filter(
        (r) => r.energy === "0.1-0.8nm" && typeof r.flux === "number"
      );
      if (longWave.length > 0) {
        xrayCls = xrayClass(longWave[longWave.length - 1].flux);
      }
    }

    return {
      kpIndex,
      auroraChance: auroraBand(kpIndex),
      solarWindKmS,
      xrayClass: xrayCls,
      trend,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      kpIndex: null,
      auroraChance: "low",
      solarWindKmS: null,
      xrayClass: null,
      trend: [],
      fetchedAt: new Date().toISOString(),
      error: (err as Error).message,
    };
  }
}
