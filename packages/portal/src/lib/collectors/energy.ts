import type { EnergyData } from "@/lib/types";

// energinet.dk DataService open API — no key required.
// Uses Elspotprices for price + PowerSystemRightNow for mix.

interface DayAheadRow {
  TimeDK: string;
  TimeUTC: string;
  PriceArea: string;
  DayAheadPriceDKK: number | null;
  DayAheadPriceEUR: number | null;
}

interface PowerSystemRow {
  Minutes1DK: string;
  CO2Emission: number | null;
  ProductionGe100MW: number | null;
  ProductionLt100MW: number | null;
  SolarPower: number | null;
  OffshoreWindPower: number | null;
  OnshoreWindPower: number | null;
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function collect(): Promise<EnergyData> {
  const now = new Date();
  const from = new Date(now.getTime() - 12 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm

  // DayAheadPrices erstatter Elspotprices pr. okt 2025. Priser i DKK/MWh.
  const priceUrl =
    `https://api.energidataservice.dk/dataset/DayAheadPrices?` +
    `start=${fmt(from)}&end=${fmt(new Date(now.getTime() + 2 * 3600 * 1000))}` +
    `&filter=${encodeURIComponent(JSON.stringify({ PriceArea: ["DK1", "DK2"] }))}`;

  const mixUrl =
    `https://api.energidataservice.dk/dataset/PowerSystemRightNow?limit=2` +
    `&sort=Minutes1DK%20DESC`;

  const [priceRes, mixRes] = await Promise.allSettled([
    fetchJson<{ records: DayAheadRow[] }>(priceUrl),
    fetchJson<{ records: PowerSystemRow[] }>(mixUrl),
  ]);

  // Price processing
  let priceDK1Kr: number | null = null;
  let priceDK2Kr: number | null = null;
  let trendDK2: Array<{ hour: string; priceKr: number }> = [];
  if (priceRes.status === "fulfilled") {
    const rows = priceRes.value.records;
    // API'et sorterer DESC som standard — sorter ASC på tid så "latest" er sidst.
    rows.sort((a, b) => a.TimeDK.localeCompare(b.TimeDK));
    const nowIso = now.toISOString();
    // Kun timepunkter fra nu eller før (ignorer day-ahead priser for i morgen)
    const pastOrNow = (r: DayAheadRow) => r.TimeUTC.slice(0, 19) <= nowIso.slice(0, 19);
    const dk1 = rows.filter((r) => r.PriceArea === "DK1" && r.DayAheadPriceDKK != null && pastOrNow(r));
    const dk2 = rows.filter((r) => r.PriceArea === "DK2" && r.DayAheadPriceDKK != null && pastOrNow(r));
    const latestDk1 = dk1[dk1.length - 1];
    const latestDk2 = dk2[dk2.length - 1];
    // Pris i DKK/MWh → DKK/kWh
    if (latestDk1) priceDK1Kr = (latestDk1.DayAheadPriceDKK ?? 0) / 1000;
    if (latestDk2) priceDK2Kr = (latestDk2.DayAheadPriceDKK ?? 0) / 1000;
    // Trend: én værdi per time for de sidste 12 timer (data er 15min-intervaller,
    // tag hver 4. så vi får ~12 punkter).
    const hourly = dk2.filter((_, i) => i % 4 === 0).slice(-12);
    trendDK2 = hourly.map((r) => ({
      hour: r.TimeDK.slice(11, 16),
      priceKr: (r.DayAheadPriceDKK ?? 0) / 1000,
    }));
  }

  // Mix processing — PowerSystemRightNow er ikke længere per-prisområde men
  // indeholder én række per minut med samlet DK-produktion. Vi bruger total
  // produktion som nævner i grøn-andel.
  let windPct = 0;
  let solarPct = 0;
  let greenPct = 0;
  let co2GPerKwh: number | null = null;
  if (mixRes.status === "fulfilled") {
    const latest = mixRes.value.records[0];
    if (latest) {
      const wind = (latest.OffshoreWindPower ?? 0) + (latest.OnshoreWindPower ?? 0);
      const solar = latest.SolarPower ?? 0;
      const thermal = (latest.ProductionGe100MW ?? 0) + (latest.ProductionLt100MW ?? 0);
      const totalProd = wind + solar + thermal;
      if (totalProd > 0) {
        windPct = Math.round((wind / totalProd) * 100);
        solarPct = Math.round((solar / totalProd) * 100);
        greenPct = Math.min(100, windPct + solarPct);
      }
      if (latest.CO2Emission != null) co2GPerKwh = Math.round(latest.CO2Emission);
    }
  }

  return {
    priceDK1Kr,
    priceDK2Kr,
    greenPct,
    windPct,
    solarPct,
    co2GPerKwh,
    region: "DK2", // default — user's region (assume Sjælland unless overridden)
    trend: trendDK2,
    fetchedAt: new Date().toISOString(),
  };
}
