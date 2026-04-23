import SunCalc from "suncalc";
import type { WeatherData } from "@/lib/types";
import { getLocation } from "@/lib/settings";

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
  };
}

export async function collect(): Promise<WeatherData> {
  const loc = getLocation();
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}` +
    `&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m` +
    `&hourly=temperature_2m,weather_code&timezone=auto&forecast_days=2`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const d = (await res.json()) as OpenMeteoResponse;

  const nowIdx = d.hourly.time.findIndex((t) => new Date(t) > new Date()) - 1;
  const start = Math.max(0, nowIdx);
  const hourly = d.hourly.time.slice(start, start + 12).map((time, i) => ({
    time,
    temp: d.hourly.temperature_2m[start + i],
    weatherCode: d.hourly.weather_code[start + i],
  }));

  const now = new Date();
  const times = SunCalc.getTimes(now, loc.lat, loc.lng);
  const dayMs = times.sunset.getTime() - times.sunrise.getTime();
  const progressMs = now.getTime() - times.sunrise.getTime();
  const progressPercent = Math.max(0, Math.min(100, (progressMs / dayMs) * 100));

  return {
    current: {
      temp: d.current.temperature_2m,
      feelsLike: d.current.apparent_temperature,
      weatherCode: d.current.weather_code,
      humidity: d.current.relative_humidity_2m,
      windSpeed: d.current.wind_speed_10m,
    },
    hourly,
    location: loc.label,
    sun: {
      sunrise: fmtTime(times.sunrise),
      sunset: fmtTime(times.sunset),
      dayLengthMinutes: Math.round(dayMs / 60000),
      isDaytime: now >= times.sunrise && now <= times.sunset,
      progressPercent: Math.round(progressPercent),
    },
  };
}

export function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  if (code <= 99) return "⛈️";
  return "🌡️";
}

export function weatherLabel(code: number): string {
  if (code === 0) return "Klart";
  if (code <= 2) return "Delvist skyet";
  if (code === 3) return "Overskyet";
  if (code <= 48) return "Tåge";
  if (code <= 57) return "Støvregn";
  if (code <= 67) return "Regn";
  if (code <= 77) return "Sne";
  if (code <= 82) return "Regnbyger";
  if (code <= 86) return "Snebyger";
  return "Torden";
}
