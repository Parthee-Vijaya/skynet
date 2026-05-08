import { runAgent } from "@/lib/agent/langchain-runner";
import { getDb } from "@/lib/db";
import { listConnections, listEvents, getGeoMany } from "./store";

interface SuspiciousReport {
  hours: number;
  generated_at: number;
  summary: string;
  signals: {
    new_apps: Array<{ process: string; raddr: string | null; ts: number }>;
    high_risk_countries: Array<{ country: string; flow_count: number; processes: string[] }>;
    fanout_processes: Array<{ process: string; unique_remotes: number }>;
    rare_isps: Array<{ isp: string; flow_count: number; processes: string[] }>;
  };
  llm_summary: string;
}

const HIGH_RISK_COUNTRIES = new Set([
  "RU", "CN", "KP", "IR", "BY",
]);

const SYSTEM_PROMPT = `Du er en privatlivs- og sikkerhedsanalytiker.

Brugeren giver dig en JSON-rapport over "usædvanlig" netværksaktivitet fra deres Mac:
- Nye apps der har forbundet
- Forbindelser til high-risk lande
- Processer med usædvanlig mange unique destinations
- Sjældne ISPs

Skriv en kort dansk briefing (max 4-5 linjer):
1. Er der noget bekymrende? Konkret hvilket signal?
2. Hvad er sandsynlig forklaring (fx "Spotify har normalt mange CDN-endpoints")?
3. Hvad bør brugeren gøre — eller "ingenting, det ser normalt ud"?

Vær kortfattet og direkte. Ingen JSON, ingen markdown — bare ren prose.`;

export async function suspiciousTraffic(hours = 24): Promise<SuspiciousReport> {
  const since = Date.now() - hours * 3_600_000;
  const conns = listConnections({ sinceMs: since, limit: 5000, dedup: true });
  const events = listEvents({ kind: "new_app", sinceMs: since, limit: 50 });

  const ips = Array.from(new Set(conns.map((c) => c.raddr).filter((x): x is string => !!x)));
  const geo = getGeoMany(ips);

  // Signal 1: new apps in window
  const new_apps = events.slice(0, 20).map((e) => ({
    process: e.process ?? "?",
    raddr: e.raddr,
    ts: e.ts,
  }));

  // Signal 2: high-risk country flows
  const countryFlows = new Map<string, { count: number; procs: Set<string> }>();
  for (const c of conns) {
    if (!c.raddr) continue;
    const g = geo.get(c.raddr);
    const cc = g?.country_code;
    if (!cc || !HIGH_RISK_COUNTRIES.has(cc)) continue;
    const entry = countryFlows.get(cc) ?? { count: 0, procs: new Set<string>() };
    entry.count += 1;
    entry.procs.add(c.process);
    countryFlows.set(cc, entry);
  }
  const high_risk_countries = [...countryFlows.entries()].map(([country, v]) => ({
    country,
    flow_count: v.count,
    processes: [...v.procs].slice(0, 10),
  }));

  // Signal 3: fanout — processes with > 50 unique remotes
  const procRemotes = new Map<string, Set<string>>();
  for (const c of conns) {
    if (!c.raddr) continue;
    const set = procRemotes.get(c.process) ?? new Set<string>();
    set.add(c.raddr);
    procRemotes.set(c.process, set);
  }
  const fanout_processes = [...procRemotes.entries()]
    .filter(([, remotes]) => remotes.size >= 50)
    .map(([process, remotes]) => ({ process, unique_remotes: remotes.size }))
    .sort((a, b) => b.unique_remotes - a.unique_remotes)
    .slice(0, 10);

  // Signal 4: rare ISPs (those with only 1-2 flows over the window)
  const ispFlows = new Map<string, { count: number; procs: Set<string> }>();
  for (const c of conns) {
    if (!c.raddr) continue;
    const isp = geo.get(c.raddr)?.isp;
    if (!isp) continue;
    const entry = ispFlows.get(isp) ?? { count: 0, procs: new Set<string>() };
    entry.count += 1;
    entry.procs.add(c.process);
    ispFlows.set(isp, entry);
  }
  const rare_isps = [...ispFlows.entries()]
    .filter(([, v]) => v.count <= 2)
    .map(([isp, v]) => ({ isp, flow_count: v.count, processes: [...v.procs] }))
    .slice(0, 15);

  const signals = { new_apps, high_risk_countries, fanout_processes, rare_isps };

  const sigCount =
    new_apps.length +
    high_risk_countries.length +
    fanout_processes.length +
    rare_isps.length;
  const summary = sigCount === 0
    ? "Ingen usædvanlig aktivitet detekteret i tidsvinduet."
    : `${sigCount} signaler: ${new_apps.length} nye apps, ${high_risk_countries.length} high-risk lande, ${fanout_processes.length} fanout-processes, ${rare_isps.length} sjældne ISPs.`;

  // LLM briefing
  let llm_summary = "";
  try {
    const out = await runAgent({
      userMessage: JSON.stringify(signals, null, 2),
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: 2,
      forceFirstTool: false,
      logTag: "firewall-suspicious",
      timeoutMs: 30_000,
    });
    llm_summary = out.text.trim();
  } catch (e) {
    llm_summary = `(LLM utilgængelig: ${e instanceof Error ? e.message : String(e)})`;
  }

  // Cache the latest report so /firewall page can read it
  getDb()
    .prepare(
      "INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at"
    )
    .run(
      "firewall_suspicious_latest",
      JSON.stringify({ hours, summary, llm_summary, signals, generated_at: Date.now() }),
      Date.now() + 60 * 60_000
    );

  return {
    hours,
    generated_at: Date.now(),
    summary,
    signals,
    llm_summary,
  };
}
