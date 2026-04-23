"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Automation, Trigger, Action, LLMNotifyAction } from "@/lib/agent/types";
import type { LogEntry } from "@/lib/agent/log-buffer";
import { AutomationEditor } from "@/components/automations/AutomationEditor";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import { Section, Sep } from "@/components/minimal/primitives";

interface NotifyCfg {
  macos: boolean;
  ntfyTopic: string;
  ntfyServer: string;
  pushoverConfigured: boolean;
}

interface GmailCfg {
  enabled: boolean;
  user: string;
  hasPassword: boolean;
  pollMinutes: number;
  notifyOnTriage: boolean;
}

const TEMPLATES: Array<{
  name: string;
  description: string;
  trigger: Trigger;
  actions: Action[];
}> = [
  // ── Daglige briefings ──────────────────────────────────────────────────────
  {
    name: "Morgen-ping",
    description: "Simpel besked hver morgen kl 07:30",
    trigger: { type: "cron", expression: "30 7 * * *" },
    actions: [{ type: "notify", title: "Godmorgen ☀️", body: "Skynet er klar til dagen — tjek vejr, energi og nyheder.", priority: "default" }],
  },
  {
    name: "LLM Morgen-briefing",
    description: "AI genererer dansk briefing: vejr + energi + nyheder kl 07:00",
    trigger: { type: "cron", expression: "0 7 * * *" },
    actions: [
      {
        type: "llm_notify",
        prompt: `Skriv en kort dansk morgenbriefing i max 4 linjer. Gør følgende:
1. Kald read_weather → nævn dagens vejr og temperatur
2. Kald read_energy → nævn dagens el-spotpris (øre/kWh)
3. Kald fetch_news med url='https://feeds.dr.dk/dr-nyheder.rss' → nævn den vigtigste nyhed
4. Afslut med en kort opmuntrende sætning
Svar udelukkende på dansk. Vær konkret og præcis.`,
        notifyTitle: "☀️ Morgenbriefing",
        priority: "default",
        useTools: true,
      } as LLMNotifyAction,
    ],
  },
  {
    name: "iMessage Morgen-briefing",
    description: "Sender AI-briefing som iMessage + push kl 07:00",
    trigger: { type: "cron", expression: "0 7 * * *" },
    actions: [
      {
        type: "llm_notify",
        prompt: `Skriv en kort dansk morgenbriefing i max 5 linjer til en iMessage. Gør følgende:
1. Kald read_weather → nævn vejr og temperatur
2. Kald read_energy → nævn el-spotpris (øre/kWh)
3. Kald fetch_news med url='https://feeds.dr.dk/dr-nyheder.rss' → nævn 2 vigtige nyheder med korte titler
4. Afslut kort og venligt
Brug emoji sparsomt. Svar på dansk.`,
        notifyTitle: "☀️ Morgenbriefing",
        priority: "default",
        useTools: true,
        imessageTo: "+4500000000",
      } as LLMNotifyAction,
    ],
  },
  {
    name: "DR Nyheder (daglig)",
    description: "Hent DR-nyheder og send push kl 08:00",
    trigger: { type: "cron", expression: "0 8 * * *" },
    actions: [
      {
        type: "llm_notify",
        prompt: "Kald fetch_news med url='https://feeds.dr.dk/dr-nyheder.rss' og limit=6. Opsummer de 3 vigtigste nyheder på dansk i punktform. Max 5 linjer.",
        notifyTitle: "📰 DR Nyheder",
        priority: "default",
        useTools: true,
      } as LLMNotifyAction,
    ],
  },
  // ── Tærskler & alarmer ──────────────────────────────────────────────────────
  {
    name: "Disk-alarm >90%",
    description: "Advarsel når disken er næsten fuld",
    trigger: { type: "threshold", metric: "disk_percent", op: ">", value: 90, cooldownSec: 3600 },
    actions: [{ type: "notify", title: "Disk næsten fuld", body: "Disken er over 90% — ryd op i Downloads/cache", priority: "high", tag: "warning" }],
  },
  {
    name: "CPU hot >85°C",
    description: "Push når temperaturen er høj i 5 min",
    trigger: { type: "threshold", metric: "temperature", op: ">", value: 85, sustainSec: 300, cooldownSec: 1800 },
    actions: [{ type: "notify", title: "🔥 CPU varm", body: "Processortemperatur over 85°C i 5+ min — tjek aktivitetsmonitor", priority: "high", tag: "fire" }],
  },
  {
    name: "Lav el-pris (<50 øre)",
    description: "Push når el-spotprisen falder under 50 øre/kWh",
    trigger: { type: "threshold", metric: "energy_price", op: "<", value: 50, cooldownSec: 7200 },
    actions: [{ type: "notify", title: "⚡ Lav el-pris", body: "Spotprisen er under 50 øre/kWh — godt tidspunkt at lade op.", priority: "default", tag: "energy" }],
  },
  // ── Proaktive skabeloner ────────────────────────────────────────────────────
  {
    name: "🧠 Proaktiv morgen-scanner",
    description: "AI scanner data hver time 07-09 og foreslår kun handling hvis relevant",
    trigger: { type: "cron", expression: "0 7-9 * * *" },
    actions: [
      {
        type: "llm_notify",
        notifyTitle: "💡 Skynet-forslag",
        prompt: `Du er en proaktiv hjemme-assistent. Scan dagens data og foreslå HØJST ÉN konkret handling jeg kan udføre nu — men kun hvis det er reelt værd at handle på.

Tjek i rækkefølge:
1. Kald read_energy → er el-prisen usædvanligt lav (< 50 øre/kWh)? Foreslå: start vaskemaskine, oplad bil, tør tøj nu.
2. Kald read_weather → er der vindstød > 15 m/s, regn > 5 mm, eller usædvanlig varme/kulde? Foreslå: tag gummistøvler med, tøm altan, luft ud inden varmen.
3. Kald list_calendar_events → er der et møde inden for 30 min jeg burde forberede?
4. Ellers: svar EKSAKT med ordet "NONE" — så jeg ved du ikke spammer mig.

Hvis du finder én god anledning: skriv max 2 linjer dansk. Ingen emoji, ingen "jeg" — bare direkte forslaget. Fx "El-prisen er 18 øre/kWh i næste time. God tid at starte opvasken eller vaskemaskinen."`,
        priority: "default",
        useTools: true,
      } as LLMNotifyAction,
    ],
  },
  {
    name: "🧠 iMessage proaktiv aften-brief",
    description: "Scanner dagens data kl 21 og iMessager kun hvis noget kræver handling før i morgen",
    trigger: { type: "cron", expression: "0 21 * * *" },
    actions: [
      {
        type: "llm_notify",
        notifyTitle: "🌙 Skynet aften",
        prompt: `Du er en diskret aften-assistent. Kig på morgendagen og nævn HØJST 1-2 ting jeg bør forberede nu.

Tjek:
1. Kald list_calendar_events → tidligt møde i morgen? Check lokation/forberedelse.
2. Kald read_weather → morgenvejr der kræver forberedelse (regntøj, is-skrabning, varmt tøj)?
3. Kald read_energy → meget lave priser om natten der betyder at timere kan programmeres?

Hvis INTET er vigtigt: svar EKSAKT "NONE" — så skipper jeg beskeden.
Ellers: max 3 korte linjer på dansk. Direkte, hjælpsom tone.`,
        priority: "low",
        useTools: true,
        imessageTo: "+4500000000",
      } as LLMNotifyAction,
    ],
  },
];

const inputStyle = {
  background: "#111",
  border: "1px dashed #262626",
  padding: "6px 10px",
  color: "#e5e5e5",
  fontFamily: "inherit",
  fontSize: 12,
  outline: "none",
} as const;

const btnStyle = {
  background: "none",
  border: "1px dashed #333",
  color: "#9bd0ff",
  padding: "4px 10px",
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
} as const;

export default function AutomationsPage() {
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifyCfg, setNotifyCfg] = useState<NotifyCfg | null>(null);
  const [gmailCfg, setGmailCfg] = useState<GmailCfg | null>(null);
  const [gmailPassword, setGmailPassword] = useState("");
  const [gmailTesting, setGmailTesting] = useState(false);
  const [gmailMsg, setGmailMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string>("");
  const [editing, setEditing] = useState<Automation | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, n, g] = await Promise.all([
        fetch("/api/automations", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/automations/notify-config", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/automations/gmail-config", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setItems(a.automations ?? []);
      setNotifyCfg(n);
      setGmailCfg(g);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (a: Automation) => {
    await fetch(`/api/automations/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !a.enabled }) });
    load();
  };
  const runNow = async (a: Automation) => { await fetch(`/api/automations/${a.id}/run`, { method: "POST" }); load(); };
  const remove = async (a: Automation) => { if (!confirm(`Slet "${a.name}"?`)) return; await fetch(`/api/automations/${a.id}`, { method: "DELETE" }); load(); };
  const addTemplate = async (t: (typeof TEMPLATES)[number]) => {
    await fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: t.name, description: t.description, trigger: t.trigger, actions: t.actions, enabled: false }) });
    load();
  };

  const sendTest = async () => {
    setTesting(true); setTestMsg("");
    try {
      const res = await fetch("/api/automations/notify-config", { method: "POST" });
      const data = (await res.json()) as { results: Array<{ backend: string; ok: boolean; error?: string }> };
      if (data.results.length === 0) setTestMsg("ingen backends aktive — tænd macOS eller konfigurer ntfy/pushover");
      else setTestMsg(data.results.map((r) => `${r.backend}: ${r.ok ? "✓" : "✗ " + (r.error ?? "")}`).join(" · "));
    } finally { setTesting(false); }
  };

  const saveNotify = async (patch: Partial<NotifyCfg>) => {
    await fetch("/api/automations/notify-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    load();
  };
  const saveGmail = async (patch: Partial<GmailCfg> & { appPassword?: string }) => {
    await fetch("/api/automations/gmail-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    load();
  };
  const testGmail = async () => {
    setGmailTesting(true); setGmailMsg("");
    try {
      if (gmailPassword.trim()) { await saveGmail({ appPassword: gmailPassword.trim() }); setGmailPassword(""); }
      const res = await fetch("/api/automations/gmail-config", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; message: string; total?: number };
      setGmailMsg(data.ok ? `✓ ${data.message}${data.total != null ? ` · ${data.total} mails i INBOX` : ""}` : `✗ ${data.message}`);
    } finally { setGmailTesting(false); }
  };

  return (
    <MinimalPageLayout active="automations">
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 60px", fontFamily: "inherit" }}>

        {/* Notify config */}
        <Section title="notifikations-backends" className="mb-8">
          {notifyCfg ? (
            <div style={{ fontSize: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={notifyCfg.macos} onChange={(e) => saveNotify({ macos: e.target.checked })} />
                <span style={{ color: "#e5e5e5" }}>macOS Notification Center</span>
                <span style={{ color: "#6b6b6b" }}>(lokalt, ingen opsætning)</span>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ color: "#6b6b6b", width: 90 }}>ntfy topic</span>
                <input
                  type="text"
                  value={notifyCfg.ntfyTopic}
                  onChange={(e) => setNotifyCfg({ ...notifyCfg, ntfyTopic: e.target.value })}
                  onBlur={(e) => saveNotify({ ntfyTopic: e.target.value })}
                  placeholder="fx skynet-dit-navn-xyz"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <span style={{ color: "#6b6b6b" }}>{notifyCfg.ntfyTopic ? "aktiv" : "inaktiv"}</span>
              </div>
              <div style={{ color: "#6b6b6b", fontSize: 11, marginLeft: 100, marginBottom: 10 }}>
                Hent ntfy-appen til iPhone/Android og abonnér på dit topic — push uden opsætning.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={sendTest} disabled={testing} style={{ ...btnStyle, opacity: testing ? 0.5 : 1 }}>
                  {testing ? "sender…" : "→ send test"}
                </button>
                {testMsg && <span style={{ color: "#9bd0ff", fontSize: 11 }}>{testMsg}</span>}
              </div>
            </div>
          ) : (
            <span style={{ color: "#6b6b6b", fontSize: 12 }}>indlæser…</span>
          )}
        </Section>

        {/* Gmail config */}
        <Section title="gmail triage (imap)" className="mb-8">
          {gmailCfg ? (
            <div style={{ fontSize: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={gmailCfg.enabled} onChange={(e) => saveGmail({ enabled: e.target.checked })} />
                <span style={{ color: "#e5e5e5" }}>aktivér mail-triage</span>
                <span style={{ color: "#6b6b6b" }}>(kun læs — vi sender aldrig noget)</span>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ color: "#6b6b6b", width: 90 }}>gmail-adresse</span>
                <input type="email" value={gmailCfg.user} onChange={(e) => setGmailCfg({ ...gmailCfg, user: e.target.value })} onBlur={(e) => saveGmail({ user: e.target.value })} placeholder="dig@gmail.com" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ color: "#6b6b6b", width: 90 }}>app-password</span>
                <input type="password" value={gmailPassword} onChange={(e) => setGmailPassword(e.target.value)} placeholder={gmailCfg.hasPassword ? "(gemt — indtast for at ændre)" : "16 tegn fra Google"} style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ color: "#6b6b6b", fontSize: 11, marginLeft: 100, marginBottom: 6 }}>
                Opret app-password på{" "}
                <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: "#9bd0ff" }}>myaccount.google.com/apppasswords</a>
                {" "}(kræver 2FA). Password bruges kun lokalt — aldrig sendt videre.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ color: "#6b6b6b", width: 90 }}>poll hver</span>
                <input type="number" value={gmailCfg.pollMinutes} onChange={(e) => setGmailCfg({ ...gmailCfg, pollMinutes: parseInt(e.target.value) || 15 })} onBlur={(e) => saveGmail({ pollMinutes: parseInt(e.target.value) || 15 })} min={5} max={120} style={{ ...inputStyle, width: 60 }} />
                <span style={{ color: "#6b6b6b" }}>minutter</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={testGmail} disabled={gmailTesting} style={{ ...btnStyle, opacity: gmailTesting ? 0.5 : 1 }}>{gmailTesting ? "tester…" : "→ test forbindelse"}</button>
                <a href="/api/agent/triage-mail?push=1" target="_blank" rel="noreferrer" style={{ ...btnStyle, textDecoration: "none" }}>kør triage nu</a>
                {gmailMsg && <span style={{ color: "#9bd0ff", fontSize: 11 }}>{gmailMsg}</span>}
              </div>
            </div>
          ) : (
            <span style={{ color: "#6b6b6b", fontSize: 12 }}>indlæser…</span>
          )}
        </Section>

        {/* Active automations */}
        <Section title={`aktive regler${items.length > 0 ? ` (${items.filter(i => i.enabled).length}/${items.length})` : ""}`} right={
          <button onClick={() => setEditing("new")} style={{ background: "none", border: "none", color: "#9bd0ff", fontSize: 11, cursor: "pointer", padding: 0 }}>+ ny regel</button>
        } className="mb-8">
          {loading ? (
            <span style={{ color: "#6b6b6b", fontSize: 12 }}>indlæser…</span>
          ) : items.length === 0 ? (
            <div style={{ color: "#6b6b6b", fontSize: 12, borderTop: "1px dashed #1c1c1c", paddingTop: 12 }}>
              ingen automations endnu — klik &quot;+ ny regel&quot; eller brug en skabelon
            </div>
          ) : (
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#6b6b6b", borderBottom: "1px dashed #262626" }}>
                  <th style={{ textAlign: "left", padding: "0 8px 6px 0", fontWeight: 400, width: 24 }}></th>
                  <th style={{ textAlign: "left", padding: "0 8px 6px 0", fontWeight: 400 }}>navn</th>
                  <th style={{ textAlign: "left", padding: "0 8px 6px 0", fontWeight: 400 }}>trigger → action</th>
                  <th style={{ textAlign: "left", padding: "0 0 6px 0", fontWeight: 400 }}>sidst kørt</th>
                  <th style={{ textAlign: "right", padding: "0 0 6px 0", fontWeight: 400 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} style={{ borderBottom: "1px dashed #1c1c1c", color: a.enabled ? "#e5e5e5" : "#6b6b6b" }}>
                    <td style={{ padding: "7px 8px 7px 0" }}>
                      <button onClick={() => toggle(a)} title={a.enabled ? "aktiv" : "inaktiv"} style={{ background: "none", border: "none", cursor: "pointer", color: a.enabled ? "#7dd67d" : "#6b6b6b", fontSize: 12, padding: 0 }}>●</button>
                    </td>
                    <td style={{ padding: "7px 8px 7px 0", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ color: "#9bd0ff" }}>{a.name}</span>
                      {a.description && <div style={{ color: "#6b6b6b", fontSize: 11 }}>{a.description}</div>}
                    </td>
                    <td style={{ padding: "7px 8px 7px 0", color: "#6b6b6b", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {summaryTrigger(a.trigger)}<Sep />{summaryActions(a.actions)}
                    </td>
                    <td style={{ padding: "7px 8px 7px 0", color: "#6b6b6b", fontSize: 11 }}>
                      {a.lastRunAt ? new Date(a.lastRunAt).toLocaleString("da-DK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      {a.lastStatus && <span style={{ color: a.lastStatus === "ok" ? "#7dd67d" : "#d87373", marginLeft: 4 }}>{a.lastStatus === "ok" ? "✓" : "✗"}</span>}
                    </td>
                    <td style={{ padding: "7px 0 7px 0", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => runNow(a)} style={{ ...btnStyle, marginRight: 4 }}>kør</button>
                      <button onClick={() => setEditing(a)} style={{ ...btnStyle, marginRight: 4 }}>redigér</button>
                      <button onClick={() => remove(a)} style={{ background: "none", border: "none", color: "#6b6b6b", cursor: "pointer", fontSize: 12 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Templates */}
        <Section title="skabeloner">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 4 }}>
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                onClick={() => addTemplate(t)}
                style={{ textAlign: "left", background: "#0d0d0d", border: "1px dashed #262626", padding: "12px 14px", cursor: "pointer", fontFamily: "inherit" }}
              >
                <div style={{ color: "#9bd0ff", fontSize: 12, marginBottom: 4 }}>{t.name}</div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 6 }}>{t.description}</div>
                <div style={{ color: "#444", fontSize: 10, fontFamily: "inherit" }}>
                  {summaryTrigger(t.trigger)} → {summaryActions(t.actions)}
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* Live log tail */}
        <AgentLogPanel />
      </main>

      <AutomationEditor target={editing} onClose={() => setEditing(null)} onSaved={load} />
    </MinimalPageLayout>
  );
}

// ── Live agent log panel ─────────────────────────────────────────────────────

const LOG_COLORS: Record<string, string> = {
  info:  "#6b6b6b",
  ok:    "#7dd67d",
  error: "#d87373",
  warn:  "#e6b450",
  tool:  "#9bd0ff",
};

function AgentLogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    const es = new EventSource("/api/agent/logs?tail=80");
    es.onmessage = (e: MessageEvent) => {
      if (pausedRef.current) return;
      try {
        const entry = JSON.parse(e.data as string) as LogEntry;
        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > 200 ? next.slice(-200) : next;
        });
      } catch { /* noop */ }
    };
    return () => es.close();
  }, []);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, paused]);

  const fmt = (ts: number) => new Date(ts).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div style={{ fontFamily: "inherit", marginTop: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: "#525252", letterSpacing: "0.25em", textTransform: "uppercase" }}>
          # agent logs <span style={{ color: "#3a3a3a", marginLeft: 8 }}>live · {logs.length} linjer</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setPaused(!paused)} style={{ background: "none", border: "none", color: paused ? "#e6b450" : "#6b6b6b", fontFamily: "inherit", fontSize: 11, cursor: "pointer", padding: 0 }}>
            {paused ? "▶ genoptag" : "⏸ pause"}
          </button>
          <button onClick={() => setLogs([])} style={{ background: "none", border: "none", color: "#3a3a3a", fontFamily: "inherit", fontSize: 11, cursor: "pointer", padding: 0 }}>
            ryd
          </button>
        </div>
      </div>
      <div
        style={{
          background: "#080808",
          border: "1px dashed #1c1c1c",
          padding: "10px 14px",
          height: 240,
          overflowY: "auto",
          fontFamily: "inherit",
          fontSize: 11,
        }}
      >
        {logs.length === 0 && (
          <div style={{ color: "#3a3a3a" }}>ingen logs endnu — kør en automation for at se output her</div>
        )}
        {logs.map((l) => (
          <div key={l.id} style={{ display: "flex", gap: 10, marginBottom: 2 }}>
            <span style={{ color: "#3a3a3a", flexShrink: 0 }}>{fmt(l.ts)}</span>
            <span style={{ color: LOG_COLORS[l.level] ?? "#6b6b6b", flexShrink: 0, width: 36 }}>{l.level}</span>
            {l.automationName && (
              <span style={{ color: "#444", flexShrink: 0 }}>[{l.automationName}]</span>
            )}
            <span style={{ color: "#9b9b9b", wordBreak: "break-all" }}>{l.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function summaryTrigger(t: Trigger): string {
  if (t.type === "cron") return `cron ${t.expression}`;
  if (t.type === "threshold") return `${t.metric} ${t.op} ${t.value}`;
  return "manuel";
}

function summaryOneAction(a: Action): string {
  if (a.type === "notify") return `notify "${a.title}"`;
  if (a.type === "tool") return `tool ${a.tool}`;
  if (a.type === "llm_notify") return `llm → "${a.notifyTitle}"`;
  return "ukendt";
}

function summaryActions(actions: Action[]): string {
  if (!actions || actions.length === 0) return "ingen action";
  if (actions.length === 1) return summaryOneAction(actions[0]);
  return `${actions.length} trin: ${actions.map(summaryOneAction).join(" → ")}`;
}
