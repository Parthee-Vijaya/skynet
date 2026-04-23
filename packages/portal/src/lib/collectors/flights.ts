import type { FlightItem, FlightsData } from "@/lib/types";
import { getLocation } from "@/lib/settings";

// OpenSky Network public REST API — no key required, rate-limited but free.
// Returns a box of states around user's location.

const RADIUS_KM = 50;

// OpenSky returns an array of arrays. Indexes per docs:
// [0]icao24, [1]callsign, [2]origin_country, [3]time_position, [4]last_contact,
// [5]lon, [6]lat, [7]baro_alt, [8]on_ground, [9]velocity, [10]true_track,
// [11]vertical_rate, ..., [13]geo_altitude
type OpenSkyState = [
  string,
  string | null,
  string | null,
  number | null,
  number,
  number | null,
  number | null,
  number | null,
  boolean,
  number | null,
  number | null,
  number | null,
  number[] | null,
  number | null,
  string | null,
  boolean | null,
  number | null,
];

interface OpenSkyResponse {
  time: number;
  states: OpenSkyState[] | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const λ1 = (lon1 * Math.PI) / 180;
  const λ2 = (lon2 * Math.PI) / 180;
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

// ~1 degree latitude ≈ 111km. Use generous box; we filter by haversine.
function boundingBox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    lamin: lat - dLat,
    lamax: lat + dLat,
    lomin: lng - dLon,
    lomax: lng + dLon,
  };
}

export async function collect(): Promise<FlightsData> {
  const loc = getLocation();
  const box = boundingBox(loc.lat, loc.lng, RADIUS_KM);
  const url =
    `https://opensky-network.org/api/states/all?` +
    `lamin=${box.lamin.toFixed(4)}&lamax=${box.lamax.toFixed(4)}` +
    `&lomin=${box.lomin.toFixed(4)}&lomax=${box.lomax.toFixed(4)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(9000), cache: "no-store" });
    if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);
    const data = (await res.json()) as OpenSkyResponse;
    const states = data.states ?? [];

    const flights: FlightItem[] = states
      .map((s): FlightItem | null => {
        const lon = s[5];
        const lat = s[6];
        if (lat == null || lon == null) return null;
        const distanceKm = haversineKm(loc.lat, loc.lng, lat, lon);
        if (distanceKm > RADIUS_KM) return null;
        const altM = s[13] ?? s[7] ?? 0;
        return {
          callsign: (s[1] ?? "").trim() || s[0],
          origin: s[2],
          altitudeKm: Math.round((altM / 1000) * 10) / 10,
          speedKmh: s[9] != null ? Math.round(s[9] * 3.6) : 0,
          heading: s[10] != null ? Math.round(s[10]) : 0,
          verticalRate: s[11] != null ? Math.round(s[11]) : 0,
          distanceKm: Math.round(distanceKm * 10) / 10,
          bearing: Math.round(bearing(loc.lat, loc.lng, lat, lon)),
          onGround: Boolean(s[8]),
        };
      })
      .filter((f): f is FlightItem => f !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 10);

    return {
      count: flights.length,
      radiusKm: RADIUS_KM,
      flights,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      count: 0,
      radiusKm: RADIUS_KM,
      flights: [],
      fetchedAt: new Date().toISOString(),
      error: (err as Error).message,
    };
  }
}
