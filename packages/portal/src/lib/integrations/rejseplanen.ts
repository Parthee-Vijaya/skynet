/**
 * Rejseplanen API-integration.
 *
 * Bruger HAFAS-baseret REST API på https://www.rejseplanen.dk/api/.
 * Kræver gratis accessId — registrér på https://help.rejseplanen.dk/.
 *
 * Flow:
 *   1. resolveLocation('Næstved') → { id, name, type } (top hit)
 *   2. findTrips(originId, destId, when?) → [{ origin, dest, legs: [{line, track, departure, arrival}] }]
 *   3. formatTrips(...) → kort dansk SMS-venlig tekst
 */

import { getRejseplanenAccessId } from "@/lib/settings";

const API = "https://www.rejseplanen.dk/api";

export class RejseplanenError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "RejseplanenError";
  }
}

export interface ResolvedLocation {
  id: string;
  name: string;
  type: string;
  lat?: number;
  lon?: number;
}

interface RawLocation {
  StopLocation?: Array<{ id?: string; extId?: string; name?: string; lat?: string; lon?: string }>;
  CoordLocation?: Array<{ id?: string; name?: string; lat?: string; lon?: string; type?: string }>;
}

export async function resolveLocation(input: string, accessId: string): Promise<ResolvedLocation> {
  const url = `${API}/location.name?input=${encodeURIComponent(input)}&accessId=${encodeURIComponent(accessId)}&format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Skynet/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new RejseplanenError(`location.name HTTP ${res.status}`, "HTTP_ERROR");
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) {
    const txt = await res.text();
    if (txt.includes("API_AUTH") || txt.includes("access denied")) {
      throw new RejseplanenError("ugyldig rejseplanen_access_id — registrér en gratis nøgle på https://help.rejseplanen.dk", "API_AUTH");
    }
    throw new RejseplanenError("rejseplanen returnerede ikke JSON", "UNEXPECTED");
  }
  const data = (await res.json()) as RawLocation;
  const stop = data.StopLocation?.[0];
  if (stop) {
    return {
      id: stop.extId ?? stop.id ?? "",
      name: stop.name ?? input,
      type: "stop",
      lat: stop.lat ? parseFloat(stop.lat) : undefined,
      lon: stop.lon ? parseFloat(stop.lon) : undefined,
    };
  }
  const coord = data.CoordLocation?.[0];
  if (coord) {
    return {
      id: coord.id ?? "",
      name: coord.name ?? input,
      type: coord.type ?? "address",
      lat: coord.lat ? parseFloat(coord.lat) : undefined,
      lon: coord.lon ? parseFloat(coord.lon) : undefined,
    };
  }
  throw new RejseplanenError(`ingen lokation fundet for "${input}"`, "NOT_FOUND");
}

export interface Leg {
  line: string;
  category: string;
  direction?: string;
  track?: string;
  fromName: string;
  toName: string;
  departure: string; // ISO
  arrival: string;
  durationMin: number;
}

export interface Trip {
  legs: Leg[];
  durationMin: number;
  changes: number;
  departure: string;
  arrival: string;
  fromName: string;
  toName: string;
}

interface RawTrip {
  LegList?: { Leg?: RawLeg[] };
  Origin?: { name?: string; date?: string; time?: string };
  Destination?: { name?: string; date?: string; time?: string };
  duration?: string;
}

interface RawLeg {
  name?: string;
  category?: string;
  direction?: string;
  Origin?: { name?: string; date?: string; time?: string; track?: string; rtTrack?: string; rtDate?: string; rtTime?: string };
  Destination?: { name?: string; date?: string; time?: string; track?: string; rtTrack?: string; rtDate?: string; rtTime?: string };
  Product?: Array<{ catOutS?: string; name?: string }>;
}

interface TripResponse {
  Trip?: RawTrip[];
  errorCode?: string;
  errorText?: string;
}

function isoFromDateTime(date?: string, time?: string): string {
  if (!date || !time) return "";
  // Rejseplanen returnerer date='2026-04-28' og time='15:32:00' eller '15:32'
  const t = time.length === 5 ? `${time}:00` : time;
  return `${date}T${t}`;
}

function parseIsoDuration(d?: string): number {
  // PT1H23M format
  if (!d) return 0;
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  return parseInt(m[1] ?? "0", 10) * 60 + parseInt(m[2] ?? "0", 10);
}

export async function findTrips(
  originId: string,
  destId: string,
  accessId: string,
  opts: { when?: Date; isArrival?: boolean } = {},
): Promise<Trip[]> {
  const params = new URLSearchParams({
    accessId,
    format: "json",
    originId,
    destId,
    numF: "3",
  });
  if (opts.when) {
    const yyyy = opts.when.getFullYear();
    const mm = String(opts.when.getMonth() + 1).padStart(2, "0");
    const dd = String(opts.when.getDate()).padStart(2, "0");
    const hh = String(opts.when.getHours()).padStart(2, "0");
    const mi = String(opts.when.getMinutes()).padStart(2, "0");
    params.set("date", `${yyyy}-${mm}-${dd}`);
    params.set("time", `${hh}:${mi}`);
    if (opts.isArrival) params.set("searchForArrival", "1");
  }
  const url = `${API}/trip?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Skynet/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new RejseplanenError(`trip HTTP ${res.status}`, "HTTP_ERROR");
  }
  const data = (await res.json()) as TripResponse;
  if (data.errorCode) {
    throw new RejseplanenError(`${data.errorCode}: ${data.errorText ?? ""}`, data.errorCode);
  }
  const rawTrips = data.Trip ?? [];
  return rawTrips.map((t) => rawToTrip(t));
}

function rawToTrip(raw: RawTrip): Trip {
  const legs: Leg[] = (raw.LegList?.Leg ?? []).map((l) => {
    const dep = l.Origin?.rtTime ?? l.Origin?.time;
    const depDate = l.Origin?.rtDate ?? l.Origin?.date;
    const arr = l.Destination?.rtTime ?? l.Destination?.time;
    const arrDate = l.Destination?.rtDate ?? l.Destination?.date;
    const departure = isoFromDateTime(depDate, dep);
    const arrival = isoFromDateTime(arrDate, arr);
    const durationMin = departure && arrival
      ? Math.max(0, Math.round((Date.parse(arrival) - Date.parse(departure)) / 60_000))
      : 0;
    return {
      line: l.name ?? l.Product?.[0]?.name ?? "",
      category: l.category ?? l.Product?.[0]?.catOutS ?? "",
      direction: l.direction,
      track: l.Origin?.rtTrack ?? l.Origin?.track,
      fromName: l.Origin?.name ?? "",
      toName: l.Destination?.name ?? "",
      departure,
      arrival,
      durationMin,
    };
  });
  const departure = legs[0]?.departure ?? isoFromDateTime(raw.Origin?.date, raw.Origin?.time);
  const arrival = legs[legs.length - 1]?.arrival ?? isoFromDateTime(raw.Destination?.date, raw.Destination?.time);
  return {
    legs,
    durationMin: parseIsoDuration(raw.duration) || (legs[0] && legs[legs.length - 1]
      ? Math.round((Date.parse(arrival) - Date.parse(departure)) / 60_000)
      : 0),
    changes: Math.max(0, legs.filter((l) => l.category !== "WALK").length - 1),
    departure,
    arrival,
    fromName: raw.Origin?.name ?? legs[0]?.fromName ?? "",
    toName: raw.Destination?.name ?? legs[legs.length - 1]?.toName ?? "",
  };
}

/** Wrapper: navne → IDs → trips → trip-data. Smider RejseplanenError ved fejl. */
export async function findTrainRoute(
  fromInput: string,
  toInput: string,
  opts: { when?: Date; isArrival?: boolean } = {},
): Promise<{ from: ResolvedLocation; to: ResolvedLocation; trips: Trip[] }> {
  const accessId = getRejseplanenAccessId();
  if (!accessId) {
    throw new RejseplanenError(
      "rejseplanen_access_id ikke konfigureret. Registrér en gratis nøgle på https://help.rejseplanen.dk og indsæt den i Skynet under /automations → setup → 'rejseplanen access id'",
      "NOT_CONFIGURED",
    );
  }
  const [from, to] = await Promise.all([
    resolveLocation(fromInput, accessId),
    resolveLocation(toInput, accessId),
  ]);
  const trips = await findTrips(from.id, to.id, accessId, opts);
  return { from, to, trips };
}
