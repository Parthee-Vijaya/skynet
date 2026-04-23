import type { MarketsData, MarketAsset, CurrencyRate } from "@/lib/types";

// Ingen API-nøgle nødvendig:
//  - Råvarer (guld/sølv/olie): Yahoo Finance v8 chart endpoint
//  - Valuta: Frankfurter (ECB-data)

interface YahooChart {
  chart: {
    result?: Array<{
      meta: { regularMarketPrice: number; previousClose?: number };
      timestamp?: number[];
      indicators: { quote: Array<{ close: (number | null)[] }> };
    }>;
    error?: { code: string; description: string };
  };
}

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

const COMMODITIES = [
  { symbol: "XAU", yahoo: "GC=F", name: "Guld", unit: "oz" },
  { symbol: "XAG", yahoo: "SI=F", name: "Sølv", unit: "oz" },
  { symbol: "OIL", yahoo: "BZ=F", name: "Brent-olie", unit: "tønde" },
] as const;

async function fetchYahooChart(symbol: string): Promise<YahooChart | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=1mo`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(9000),
    cache: "no-store",
    headers: {
      // Yahoo blokerer uden UA
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      accept: "application/json,text/plain,*/*",
    },
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);
  return (await res.json()) as YahooChart;
}

async function fetchUsdToDkk(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=DKK",
      { signal: AbortSignal.timeout(9000), cache: "no-store" }
    );
    const json = (await res.json()) as FrankfurterResponse;
    return json.rates.DKK ?? 6.9;
  } catch {
    return 6.9;
  }
}

async function fetchCommodities(): Promise<MarketAsset[]> {
  const [usdToDkk, ...charts] = await Promise.all([
    fetchUsdToDkk(),
    ...COMMODITIES.map((c) =>
      fetchYahooChart(c.yahoo).catch((e) => {
        console.warn(`[markets] ${c.symbol} fetch failed:`, e);
        return null;
      })
    ),
  ]);

  const out: MarketAsset[] = [];
  COMMODITIES.forEach((c, i) => {
    const result = charts[i]?.chart.result?.[0];
    if (!result) return;

    const rawCloses = result.indicators.quote[0]?.close ?? [];
    const closes = rawCloses.filter((v): v is number => v != null);
    if (closes.length < 2) return;

    const latestUsd = result.meta.regularMarketPrice ?? closes[closes.length - 1];
    const prevUsd = closes[closes.length - 2];
    const change24h = ((latestUsd - prevUsd) / prevUsd) * 100;

    const firstUsd = closes[0];
    const change30d = ((latestUsd - firstUsd) / firstUsd) * 100;

    // Sample til ~30 sparkline-punkter i DKK
    const spark = closes.map((v) => Math.round(v * usdToDkk * 100) / 100);

    out.push({
      symbol: c.symbol,
      name: c.name,
      unit: c.unit,
      priceDkk: Math.round(latestUsd * usdToDkk * 100) / 100,
      change24h: Math.round(change24h * 100) / 100,
      change7d: Math.round(change30d * 100) / 100,
      spark,
    });
  });

  return out;
}

async function fetchCurrencies(): Promise<CurrencyRate[]> {
  const symbols = ["USD", "EUR", "SEK", "NOK", "GBP"];
  const toStr = symbols.join(",");
  const todayUrl = `https://api.frankfurter.app/latest?from=DKK&to=${toStr}`;

  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.toISOString().slice(0, 10);
  const yesterdayUrl = `https://api.frankfurter.app/${y}?from=DKK&to=${toStr}`;

  const [nowRes, yRes] = await Promise.all([
    fetch(todayUrl, { signal: AbortSignal.timeout(9000), cache: "no-store" }),
    fetch(yesterdayUrl, { signal: AbortSignal.timeout(9000), cache: "no-store" }),
  ]);

  if (!nowRes.ok) throw new Error(`Frankfurter HTTP ${nowRes.status}`);
  const nowJson = (await nowRes.json()) as FrankfurterResponse;
  const yJson = yRes.ok ? ((await yRes.json()) as FrankfurterResponse) : null;

  const labels: Record<string, string> = {
    USD: "Dollar",
    EUR: "Euro",
    SEK: "Svensk krone",
    NOK: "Norsk krone",
    GBP: "Britisk pund",
  };

  return symbols.flatMap<CurrencyRate>((code) => {
    const per = nowJson.rates[code];
    if (per == null) return [];
    const yPer = yJson?.rates?.[code];
    const dkkPerUnit = 1 / per;
    const yDkkPerUnit = yPer != null ? 1 / yPer : undefined;
    const change24h =
      yDkkPerUnit != null
        ? Math.round(((dkkPerUnit - yDkkPerUnit) / yDkkPerUnit) * 10000) / 100
        : undefined;
    return [
      {
        code,
        label: labels[code] ?? code,
        perDkk: Math.round(per * 10000) / 10000,
        dkkPerUnit: Math.round(dkkPerUnit * 10000) / 10000,
        change24h,
      },
    ];
  });
}

export async function collect(): Promise<MarketsData> {
  try {
    const [commodities, currencies] = await Promise.all([
      fetchCommodities().catch((e) => {
        console.warn("[markets] commodities fetch failed:", e);
        return [] as MarketAsset[];
      }),
      fetchCurrencies().catch((e) => {
        console.warn("[markets] fx fetch failed:", e);
        return [] as CurrencyRate[];
      }),
    ]);

    return {
      commodities,
      currencies,
      fetchedAt: new Date().toISOString(),
      error:
        commodities.length === 0 && currencies.length === 0
          ? "Ingen markedsdata"
          : undefined,
    };
  } catch (err) {
    return {
      commodities: [],
      currencies: [],
      fetchedAt: new Date().toISOString(),
      error: (err as Error).message,
    };
  }
}
