import type { LightningData } from "@/lib/types";
import { getLocation } from "@/lib/settings";

// Best-effort lightning: Open-Meteo doesn't expose real strike count,
// but weather_code 95/96/99 indicates thunderstorm activity at that hour.
// We use weather_code over a coarse lat/lng grid to estimate "nearby thunder".

// True strike-count source (blitzortung) requires websocket auth — skipped.

interface OMResponse {
  hourly: {
    time: string[];
    weather_code: number[];
  };
}

function isThunder(code: number): boolean {
  return code >= 95 && code <= 99;
}

function bearingLabel(deg: number): string {
  const dirs = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"];
  return dirs[Math.round(deg / 45) % 8];
}

export async function collect(): Promise<LightningData> {
  const loc = getLocation();
  try {
    // Sample 8 points in a ring ~80km around location for thunder activity.
    const points: Array<{ lat: number; lng: number; dir: number; distKm: number }> = [];
    const radiusKm = 80;
    for (let i = 0; i < 8; i++) {
      const bearing = i * 45;
      const rad = (bearing * Math.PI) / 180;
      const dLat = (radiusKm / 111) * Math.cos(rad);
      const dLng =
        (radiusKm / (111 * Math.cos((loc.lat * Math.PI) / 180))) * Math.sin(rad);
      points.push({
        lat: loc.lat + dLat,
        lng: loc.lng + dLng,
        dir: bearing,
        distKm: radiusKm,
      });
    }
    points.push({ lat: loc.lat, lng: loc.lng, dir: 0, distKm: 0 });

    const now = new Date();
    const since = new Date(now.getTime() - 24 * 3600 * 1000);

    const results = await Promise.allSettled(
      points.map((p) =>
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(2)}` +
            `&longitude=${p.lng.toFixed(2)}&hourly=weather_code&timezone=auto&past_hours=24&forecast_hours=1`,
          { signal: AbortSignal.timeout(6000), cache: "no-store" }
        ).then((r) => r.json() as Promise<OMResponse>)
      )
    );

    const hourlyCounts = new Array(24).fill(0);
    let totalToday = 0;
    let nearestKm: number | null = null;
    let nearestDir: string | null = null;
    let last1h = 0;

    results.forEach((r, idx) => {
      if (r.status !== "fulfilled") return;
      const { time, weather_code } = r.value.hourly;
      const p = points[idx];
      for (let j = 0; j < time.length; j++) {
        const t = new Date(time[j]);
        if (t < since || t > now) continue;
        if (!isThunder(weather_code[j])) continue;
        const hoursAgo = Math.floor((now.getTime() - t.getTime()) / 3600_000);
        if (hoursAgo >= 0 && hoursAgo < 24) hourlyCounts[23 - hoursAgo]++;
        totalToday++;
        if (hoursAgo === 0) last1h++;
        if (nearestKm == null || p.distKm < nearestKm) {
          nearestKm = p.distKm;
          nearestDir = p.distKm === 0 ? "her" : bearingLabel(p.dir);
        }
      }
    });

    return {
      last1h,
      nearestKm,
      nearestDirection: nearestDir,
      totalToday,
      hourly: hourlyCounts,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      last1h: 0,
      nearestKm: null,
      nearestDirection: null,
      totalToday: 0,
      hourly: new Array(24).fill(0),
      fetchedAt: new Date().toISOString(),
      error: (err as Error).message,
    };
  }
}
