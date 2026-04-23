"use client";
import { useCallback, useEffect, useState } from "react";
import type { Automation, Trigger, Action } from "@/lib/agent/types";
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
  action: Action;
}> = [
  // ── Daglige briefings ──────────────────────────────────────────────────────
  {
    name: "Morgen-ping",
    description: "Simpel besked hver morgen kl 07:30",
    trigger: { type: "cron", expression: "30 7 * * *" },
    action: { type: "notify", title: "Godmorgen ☀️", body: "Skynet er klar til dagen — tjek vejr, energi og nyheder.", priority: "default" },
  },
  {
    name: "LLM Morgen-briefing",
    description: "AI genererer dansk briefing: vejr + energi + nyheder kl 07:00",
    trigger: { type: "cron", expression: "0 7 * * *" },
    action: {
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
    } as Action,
  },
  {
    name: "iMessage Morgen-briefing",
    description: "Sender AI-briefing som iMessage + push kl 07:00",
    trigger: { type: "cron", expression: "0 7 * * *" },
    action: {
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
    } as Action,
  },
  {
    name: "DR Nyheder (daglig)",
    description: "Hent DR-nyheder og send push kl 08:00",
    trigger: { type: "cron", expression: "0 8 * * *" },
    action: {
      type: "llm_notify",
      prompt: "Kald fetch_news med url='https://feeds.dr.dk/dr-nyheder.rss' og limit=6. Opsummer de 3 vigtigste nyheder på dansk i punktform. Max 5 linjer.",
      notifyTitle: "📰 DR Nyheder",
      priority: "default",
      useTools: true,
    } as Action,
  },
  // ── Tærskler & alarmer ──────────────────────────────────────────────────────
  {
    name: "Disk-alarm >90%",
    description: "Advarsel når disken er næsten fuld",
    trigger: { type: "threshold", metric: "disk_percent", op: ">", value: 90, cooldownSec: 3600 },
    action: { type: "notify", title: "Disk næsten fuld", body: "Disken er over 90% — ryd op i Downloads/cache", priority: "high", tag: "warning" },
  },
  {
    name: "CPU hot >85°C",
    description: "Push når temperaturen er høj i 5 min",
    trigger: { type: "threshold", metric: "temperature", op: ">", value: 85, sustainSec: 300, cooldownSec: 1800 },
    action: { type: "notify", title: "🔥 CPU varm", body: "Processortemperatur over 85°C i 5+ min — tjek aktivitetsmonitor", priority: "high", tag: "fire" },
  },
  {
    name: "Lav el-pris (<50 øre)",
    description: "Push når el-spotprisen falder under 50 øre/kWh",
    trigger: { type: "threshold", metric: "energy_price", op: "<", value: 50, cooldownSec: 7200 },
    action: { type: "notify", title: "⚡ Lav el-pris", body: "Spotprisen er under 50 øre/kWh — godt tidspunkt at lade op.", priority: "default", tag: "energy" },
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
    await fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: t.name, description: t.description, trigger: t.trigger, action: t.action, enabled: false }) });
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
                  placeholder="fx skynet-parthee-xyz"
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
                      {summaryTrigger(a.trigger)}<Sep />{summaryAction(a.action)}
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
                  {summaryTrigger(t.trigger)} → {summaryAction(t.action)}
                </div>
              </button>
            ))}
          </div>
        </Section>
      </main>

      <AutomationEditor target={editing} onClose={() => setEditing(null)} onSaved={load} />
    </MinimalPageLayout>
  );
}

function summaryTrigger(t: Trigger): string {
  if (t.type === "cron") return `cron ${t.expression}`;
  if (t.type === "threshold") return `${t.metric} ${t.op} ${t.value}`;
  return "manuel";
}

function summaryAction(a: Action): string {
  if (a.type === "notify") return `notify "${a.title}"`;
  if (a.type === "tool") return `tool ${a.tool}`;
  if (a.type === "llm_notify") return `llm → "${a.notifyTitle}"`;
  return "ukendt";
}
