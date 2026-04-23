import SunCalc from "suncalc";
import type { MoonData } from "@/lib/types";

// Moon phase: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter.
function phaseName(phase: number): string {
  if (phase < 0.03 || phase > 0.97) return "Nymåne";
  if (phase < 0.22) return "Voksende månesegl";
  if (phase < 0.28) return "Første kvartal";
  if (phase < 0.47) return "Voksende måne";
  if (phase < 0.53) return "Fuldmåne";
  if (phase < 0.72) return "Aftagende måne";
  if (phase < 0.78) return "Sidste kvartal";
  return "Aftagende månesegl";
}

function nextEvent(target: number, after: Date = new Date()): Date {
  // Search day-by-day up to 45 days for phase transition.
  let prev = SunCalc.getMoonIllumination(after).phase;
  for (let i = 1; i < 45; i++) {
    const d = new Date(after.getTime() + i * 86_400_000);
    const p = SunCalc.getMoonIllumination(d).phase;
    const prevDelta = Math.abs(((prev - target + 1) % 1) - 0.5);
    const delta = Math.abs(((p - target + 1) % 1) - 0.5);
    // Detect crossing: when phase passes target (considering wrap)
    const crossed =
      (prev <= target && p >= target) ||
      (prev > p && (prev <= target || p >= target)); // wrap-around
    if (crossed) return d;
    if (delta > prevDelta) prev = p;
    else prev = p;
  }
  return new Date(after.getTime() + 30 * 86_400_000);
}

export async function collect(): Promise<MoonData> {
  const now = new Date();
  const m = SunCalc.getMoonIllumination(now);
  return {
    phase: Math.round(m.phase * 1000) / 1000,
    illumination: Math.round(m.fraction * 1000) / 1000,
    name: phaseName(m.phase),
    nextFullMoon: nextEvent(0.5).toISOString(),
    nextNewMoon: nextEvent(0, now).toISOString(),
  };
}
