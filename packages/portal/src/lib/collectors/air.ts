import type { AirQualityData } from "@/lib/types";
import { getLocation } from "@/lib/settings";

interface AirResponse {
  current: {
    european_aqi: number;
    pm2_5: number;
    pm10: number;
    nitrogen_dioxide: number;
    ozone: number;
    uv_index?: number;
    alder_pollen?: number;
    birch_pollen?: number;
    grass_pollen?: number;
    mugwort_pollen?: number;
    olive_pollen?: number;
    ragweed_pollen?: number;
  };
}

function ratingForAqi(aqi: number): AirQualityData["rating"] {
  if (aqi <= 20) return "good";
  if (aqi <= 40) return "good";
  if (aqi <= 60) return "moderate";
  if (aqi <= 80) return "unhealthy";
  if (aqi <= 100) return "very_unhealthy";
  return "hazardous";
}

function num(v: number | undefined): number | null {
  return typeof v === "number" && !isNaN(v) ? Math.round(v * 10) / 10 : null;
}

export async function collect(): Promise<AirQualityData> {
  const loc = getLocation();
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.lat}&longitude=${loc.lng}` +
    `&current=european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Air HTTP ${res.status}`);
  const d = (await res.json()) as AirResponse;

  const aqi = Math.round(d.current.european_aqi);

  return {
    aqi,
    pm25: Math.round(d.current.pm2_5),
    pm10: Math.round(d.current.pm10),
    no2: Math.round(d.current.nitrogen_dioxide),
    o3: Math.round(d.current.ozone),
    rating: ratingForAqi(aqi),
    uvIndex: num(d.current.uv_index),
    pollen: {
      birch: num(d.current.birch_pollen),
      grass: num(d.current.grass_pollen),
      alder: num(d.current.alder_pollen),
      ragweed: num(d.current.ragweed_pollen),
      mugwort: num(d.current.mugwort_pollen),
      olive: num(d.current.olive_pollen),
    },
  };
}

export function ratingLabel(r: AirQualityData["rating"]): string {
  return {
    good: "God",
    moderate: "Moderat",
    unhealthy: "Usund",
    very_unhealthy: "Meget usund",
    hazardous: "Farlig",
  }[r];
}

export function ratingColor(r: AirQualityData["rating"]): string {
  return {
    good: "text-emerald-400 bg-emerald-500/10",
    moderate: "text-amber-400 bg-amber-500/10",
    unhealthy: "text-orange-400 bg-orange-500/10",
    very_unhealthy: "text-rose-400 bg-rose-500/10",
    hazardous: "text-fuchsia-400 bg-fuchsia-500/10",
  }[r];
}
