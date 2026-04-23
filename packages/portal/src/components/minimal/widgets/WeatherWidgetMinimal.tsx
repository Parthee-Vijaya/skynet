"use client";
import { useEffect, useRef, useState } from "react";
import { usePoll } from "@/hooks/usePoll";
import type { WeatherData } from "@/lib/types";
import { weatherEmoji, weatherLabel } from "@/lib/formatters";
import { Section } from "../primitives";

interface LiveGeo {
  /** Browser-geolocation (eller null ved afslag/fejl) */
  coords: { lat: number; lng: number } | null;
  /** Reverse-geokodet stednavn — kan være null hvis reverse-kald fejler */
  label: string | null;
  /** User-friendly fejl-status (til debugging) */
  status: "pending" | "ok" | "denied" | "unavailable";
}

/** Haversine-afstand i km mellem to punkter */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Reverse-geocode via Open-Meteo's tilgængelige geocoding (by-navn fra coords).
 *  Uden API-nøgle. Hvis det fejler: returnér null — vi falder tilbage til coords. */
async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  try {
    // Nominatim (OpenStreetMap) er gratis men kræver User-Agent i back-end kald;
    // fra browseren sender browseren selv en. Rate-limit er 1 req/s/IP.
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=da`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: { city?: string; town?: string; village?: string; municipality?: string; county?: string; state?: string; country?: string };
      display_name?: string;
    };
    const a = data.address ?? {};
    return a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? a.country ?? null;
  } catch {
    return null;
  }
}

export function WeatherWidgetMinimal() {
  const { data } = usePoll<WeatherData>("/api/weather", 10 * 60_000);
  const [live, setLive] = useState<LiveGeo>({ coords: null, label: null, status: "pending" });
  const reverseAbortRef = useRef<AbortController | null>(null);

  // Anmod om live-geolocation én gang på mount
  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setLive({ coords: null, label: null, status: "unavailable" });
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLive({ coords, label: null, status: "ok" });
        // Asynkron reverse-geokod — vi gider ikke blokere UI
        reverseAbortRef.current = new AbortController();
        reverseGeocode(coords.lat, coords.lng, reverseAbortRef.current.signal).then((label) => {
          if (!cancelled) setLive((prev) => (prev.coords ? { ...prev, label } : prev));
        });
      },
      () => {
        if (!cancelled) setLive({ coords: null, label: null, status: "denied" });
      },
      { maximumAge: 5 * 60_000, timeout: 10_000 },
    );
    return () => {
      cancelled = true;
      reverseAbortRef.current?.abort();
    };
  }, []);

  // Hvad skal vises i header-hjørnet?
  const headerRight = (() => {
    if (!data) return undefined;
    const weatherLoc = data.location;
    if (live.coords && data.coords) {
      const d = distanceKm(live.coords, data.coords);
      const liveName = live.label ?? `${live.coords.lat.toFixed(2)}, ${live.coords.lng.toFixed(2)}`;
      if (d < 15) {
        // Live og vejr er stort set samme sted — bare vis vejrets navn + grønt checkmark
        return (
          <span className="text-neutral-600">
            📍 {weatherLoc} <span className="text-emerald-500/70">●</span>
          </span>
        );
      }
      // De er forskellige — vis begge kompakt
      return (
        <span className="text-neutral-600 truncate max-w-[260px]">
          📍 {liveName} <span className="text-neutral-700">·</span> 🌦 fra {weatherLoc}
          <span className="text-neutral-700 ml-1">({Math.round(d)} km)</span>
        </span>
      );
    }
    // Ingen live-lokation endnu / afslået
    return (
      <span className="text-neutral-600">
        🌦 fra {weatherLoc}
        {live.status === "denied" && <span className="text-neutral-700 ml-1 text-[10px]">(lokation afslået)</span>}
        {live.status === "pending" && <span className="text-neutral-700 ml-1 text-[10px]">(finder dig…)</span>}
      </span>
    );
  })();

  return (
    <Section title="vejr" right={headerRight} className="col-span-12 lg:col-span-6">
      {!data ? (
        <div className="text-neutral-700 font-mono text-[12px]">indlæser…</div>
      ) : (
        <div className="font-mono">
          {/* Top row: emoji + temp + label */}
          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-2xl leading-none">{weatherEmoji(data.current.weatherCode)}</span>
            <span className="text-neutral-50 text-[28px] font-extralight tabular-nums leading-none">
              {Math.round(data.current.temp)}°
            </span>
            <span className="text-neutral-500 text-[11px]">
              føles {Math.round(data.current.feelsLike)}° · {weatherLabel(data.current.weatherCode)}
            </span>
          </div>

          {/* Wind + humidity + sun */}
          <div className="flex gap-4 text-[11px] text-neutral-500 mb-3">
            <span>🌬 {Math.round(data.current.windSpeed)} m/s</span>
            <span>💧 {data.current.humidity}%</span>
            <span className="text-amber-500/70">☀ {data.sun.sunrise}</span>
            <span className="text-indigo-400/70">🌙 {data.sun.sunset}</span>
          </div>

          {/* 6-hour sparkline */}
          <div className="flex gap-[6px]">
            {data.hourly.slice(0, 6).map((h) => {
              const hour = new Date(h.time).getHours().toString().padStart(2, "0");
              return (
                <div key={h.time} className="flex flex-col items-center gap-0.5 flex-1">
                  <span className="text-neutral-600 text-[9px]">{hour}</span>
                  <span className="text-[12px]">{weatherEmoji(h.weatherCode)}</span>
                  <span className="text-neutral-400 text-[10px] tabular-nums">{Math.round(h.temp)}°</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}
