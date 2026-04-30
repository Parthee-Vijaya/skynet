"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Automation, Trigger, Action, LLMNotifyAction } from "@/lib/agent/types";
import type { LogEntry } from "@/lib/agent/log-buffer";
import { AutomationEditor } from "@/components/automations/AutomationEditor";
import { AutomationDetailDrawer } from "@/components/automations/AutomationDetailDrawer";
import { MinimalPageLayout } from "@/components/minimal/MinimalPageLayout";
import { Section, Sep } from "@/components/minimal/primitives";
import { Button, ButtonLink } from "@/components/ui/Button";
import { nextRuns, relativeFromNow } from "@/lib/cron-utils";

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

interface ImessagePollerStatus {
  enabled: boolean;
  chatDbExists: boolean;
  lastSeenRowid?: number;
  fdaOk: boolean;
}

interface NtfySubscriberStatus {
  enabled: boolean;
  ntfyTopic: string;
  ntfyServer: string;
  publicUrl: string;
  lastFinishedSessionId?: string;
  lastFinishedSessionAt?: string;
}

interface TelegramStatus {
  enabled: boolean;
  hasBotToken: boolean;
  allowedChatIds: string[];
  bot?: { id: number; username: string; first_name: string };
  botError?: string;
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
3. Kald fetch_news med url='https://www.dr.dk/nyheder/service/feeds/allenyheder' → nævn den vigtigste nyhed
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
3. Kald fetch_news med url='https://www.dr.dk/nyheder/service/feeds/allenyheder' → nævn 2 vigtige nyheder med korte titler
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
        prompt: "Kald fetch_news med url='https://www.dr.dk/nyheder/service/feeds/allenyheder' og limit=6. Opsummer de 3 vigtigste nyheder på dansk i punktform. Max 5 linjer.",
        notifyTitle: "📰 DR Nyheder",
        priority: "default",
        useTools: true,
      } as LLMNotifyAction,
    ],
  },
  {
    name: "Politiken (daglig)",
    description: "Hent Politiken senest-nyt og send push kl 08:05",
    trigger: { type: "cron", expression: "5 8 * * *" },
    actions: [
      {
        type: "llm_notify",
        prompt: "Kald fetch_news med url='https://politiken.dk/rss/senestenyt.rss' og limit=6. Opsummer de 3 vigtigste nyheder på dansk i punktform. Max 5 linjer.",
        notifyTitle: "📰 Politiken",
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

type TabId = "rules" | "setup" | "logs";

export default function AutomationsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("rules");
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifyCfg, setNotifyCfg] = useState<NotifyCfg | null>(null);
  const [gmailCfg, setGmailCfg] = useState<GmailCfg | null>(null);
  const [imessageDefault, setImessageDefault] = useState("");
  const imessageDefaultLoaded = useRef(false);
  const [imessagePoller, setImessagePoller] = useState<ImessagePollerStatus | null>(null);
  const [rejseplanenAccessId, setRejseplanenAccessId] = useState("");
  const [hasRejseplanenAccessId, setHasRejseplanenAccessId] = useState(false);
  const [nzbgeekApiKey, setNzbgeekApiKey] = useState("");
  const [hasNzbgeekApiKey, setHasNzbgeekApiKey] = useState(false);
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [telegramTokenInput, setTelegramTokenInput] = useState("");
  const [telegramAllowedInput, setTelegramAllowedInput] = useState("");
  const telegramAllowedLoaded = useRef(false);
  const [ntfySub, setNtfySub] = useState<NtfySubscriberStatus | null>(null);
  const [publicUrlInput, setPublicUrlInput] = useState("");
  const publicUrlLoaded = useRef(false);
  const [tgDiscovered, setTgDiscovered] = useState<{
    ok: boolean;
    chats?: Array<{ chatId: number; type: string; title?: string; username?: string; firstName?: string; lastMessageText: string }>;
    error?: string;
    hint?: string;
  } | null>(null);
  const [tgDiscoverBusy, setTgDiscoverBusy] = useState(false);
  const [gmailPassword, setGmailPassword] = useState("");
  const [gmailTesting, setGmailTesting] = useState(false);
  const [gmailMsg, setGmailMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string>("");
  const [editing, setEditing] = useState<Automation | "new" | null>(null);
  const [editorPrefill, setEditorPrefill] = useState<{
    name: string;
    description?: string;
    enabled?: boolean;
    trigger: Trigger;
    actions: Action[];
  } | null>(null);
  const [detail, setDetail] = useState<Automation | null>(null);
  const [nlText, setNlText] = useState("");
  const [nlBusy, setNlBusy] = useState(false);
  const [nlError, setNlError] = useState("");

  // Inbound test
  const [inboundTestMsg, setInboundTestMsg] = useState("tjek vejret");
  const [inboundTestBusy, setInboundTestBusy] = useState(false);
  const [inboundTestResult, setInboundTestResult] = useState<{ ok: boolean; reply?: string; error?: string; toolsUsed?: string[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, n, g, s, p, t, ns] = await Promise.all([
        fetch("/api/automations", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/automations/notify-config", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/automations/gmail-config", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/automations/imessage-poller", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/telegram/status", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/ntfy/subscriber", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      setItems(a.automations ?? []);
      setNotifyCfg(n);
      setGmailCfg(g);
      // Læs imessageDefault fra server kun ved første load — efterfølgende
      // lader vi UI'et være single source of truth (gemmes ved onBlur)
      if (typeof s?.imessageDefault === "string" && !imessageDefaultLoaded.current) {
        setImessageDefault(s.imessageDefault);
        imessageDefaultLoaded.current = true;
      }
      if (typeof s?.hasRejseplanenAccessId === "boolean") setHasRejseplanenAccessId(s.hasRejseplanenAccessId);
      if (typeof s?.hasNzbgeekApiKey === "boolean") setHasNzbgeekApiKey(s.hasNzbgeekApiKey);
      if (p) setImessagePoller(p);
      if (t) {
        setTelegram(t);
        if (!telegramAllowedLoaded.current) {
          setTelegramAllowedInput((t.allowedChatIds ?? []).join(", "));
          telegramAllowedLoaded.current = true;
        }
      }
      if (ns) {
        setNtfySub(ns);
        if (!publicUrlLoaded.current) {
          setPublicUrlInput(ns.publicUrl ?? "");
          publicUrlLoaded.current = true;
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const parseNL = async () => {
    if (!nlText.trim()) return;
    setNlBusy(true);
    setNlError("");
    try {
      const res = await fetch("/api/automations/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nlText.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        suggestion?: { name: string; description?: string; enabled?: boolean; trigger: Trigger; actions: Action[] };
        error?: string;
        raw?: string;
      };
      if (!data.ok || !data.suggestion) {
        setNlError(data.error ?? "kunne ikke generere forslag");
        return;
      }
      setEditorPrefill(data.suggestion);
      setEditing("new");
      setNlText("");
    } catch (e) {
      setNlError(e instanceof Error ? e.message : "fejl");
    } finally {
      setNlBusy(false);
    }
  };

  const toggle = async (a: Automation) => {
    await fetch(`/api/automations/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !a.enabled }) });
    load();
  };
  const runNow = async (a: Automation) => { await fetch(`/api/automations/${a.id}/run`, { method: "POST" }); load(); };
  const remove = async (a: Automation) => { if (!confirm(`Slet "${a.name}"?`)) return; await fetch(`/api/automations/${a.id}`, { method: "DELETE" }); load(); };

  const addTemplate = async (t: (typeof TEMPLATES)[number]) => {
    const actions = imessageDefault.trim()
      ? t.actions.map((a) => {
          if (a.type === "llm_notify" && a.imessageTo === "+4500000000") {
            return { ...a, imessageTo: imessageDefault.trim() };
          }
          return a;
        })
      : t.actions;
    await fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: t.name, description: t.description, trigger: t.trigger, actions, enabled: false }) });
    load();
  };

  const sendNotifyTest = async () => {
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
  const saveImessageDefault = async (value: string) => {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imessageDefault: value.trim() }),
    });
  };

  const saveRejseplanenAccessId = async (value: string) => {
    if (!value.trim()) return; // Tom = behold eksisterende
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejseplanenAccessId: value.trim() }),
    });
    const data = (await res.json()) as { hasRejseplanenAccessId?: boolean };
    setHasRejseplanenAccessId(!!data.hasRejseplanenAccessId);
    setRejseplanenAccessId(""); // Ryd input efter gem
  };

  const saveNzbgeekApiKey = async (value: string) => {
    if (!value.trim()) return;
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nzbgeekApiKey: value.trim() }),
    });
    const data = (await res.json()) as { hasNzbgeekApiKey?: boolean };
    setHasNzbgeekApiKey(!!data.hasNzbgeekApiKey);
    setNzbgeekApiKey("");
  };

  const patchTelegram = async (patch: { enabled?: boolean; botToken?: string; allowedChatIds?: string }) => {
    const res = await fetch("/api/telegram/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as TelegramStatus;
    setTelegram(data);
    return data;
  };

  const saveTelegramToken = async (value: string) => {
    if (!value.trim()) return;
    await patchTelegram({ botToken: value.trim() });
    setTelegramTokenInput("");
  };

  const saveTelegramAllowed = async (value: string) => {
    await patchTelegram({ allowedChatIds: value });
  };

  const toggleTelegram = async (enabled: boolean) => {
    await patchTelegram({ enabled });
  };

  const patchNtfySub = async (patch: { enabled?: boolean; publicUrl?: string }) => {
    const res = await fetch("/api/ntfy/subscriber", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as NtfySubscriberStatus;
    setNtfySub(data);
    return data;
  };

  const savePublicUrl = async (value: string) => {
    await patchNtfySub({ publicUrl: value.trim() });
  };

  const toggleNtfySub = async (enabled: boolean) => {
    await patchNtfySub({ enabled });
  };

  const discoverTelegramChats = async () => {
    setTgDiscoverBusy(true);
    setTgDiscovered(null);
    try {
      const res = await fetch("/api/telegram/discover-chats");
      setTgDiscovered((await res.json()) as typeof tgDiscovered);
    } catch (e) {
      setTgDiscovered({ ok: false, error: e instanceof Error ? e.message : "fejl" });
    } finally {
      setTgDiscoverBusy(false);
    }
  };

  const addChatIdToAllowlist = (chatId: number) => {
    const current = telegramAllowedInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (current.includes(String(chatId))) return;
    const next = [...current, String(chatId)].join(", ");
    setTelegramAllowedInput(next);
    saveTelegramAllowed(next);
  };

  const toggleImessagePoller = async (enabled: boolean) => {
    const res = await fetch("/api/automations/imessage-poller", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const data = (await res.json()) as { enabled?: boolean };
    setImessagePoller((prev) => (prev ? { ...prev, enabled: !!data.enabled } : prev));
  };

  const runInboundTest = async () => {
    if (!inboundTestMsg.trim()) return;
    setInboundTestBusy(true);
    setInboundTestResult(null);
    try {
      const from = imessageDefault.trim() || "+4500000000";
      const res = await fetch("/api/imessage/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, message: inboundTestMsg.trim(), silent: true }),
      });
      const data = (await res.json()) as { ok: boolean; reply?: string; error?: string; toolsUsed?: string[] };
      setInboundTestResult(data);
    } catch (e) {
      setInboundTestResult({ ok: false, error: e instanceof Error ? e.message : "fejl" });
    } finally {
      setInboundTestBusy(false);
    }
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

  const ruleStats = `${items.filter((i) => i.enabled).length}/${items.length}`;
  const setupStats = `${[notifyCfg?.macos || notifyCfg?.ntfyTopic, gmailCfg?.enabled, imessagePoller?.enabled].filter(Boolean).length}/3`;

  return (
    <MinimalPageLayout active="automations">
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px 60px", fontFamily: "inherit" }}>
        <Tabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: "rules", label: "regler", badge: items.length > 0 ? ruleStats : undefined },
            { id: "setup", label: "setup", badge: setupStats },
            { id: "logs", label: "logs" },
          ]}
        />

        {/* ── REGLER ─────────────────────────────────────────────────────────── */}
        {activeTab === "rules" && (
          <>
            {/* NL parse — kompakt, 1 linje */}
            <div style={{ marginBottom: 24, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input
                type="text"
                value={nlText}
                onChange={(e) => setNlText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); parseNL(); } }}
                placeholder='beskriv en regel · fx "send push når disken er over 90%"'
                disabled={nlBusy}
                style={{ ...inputStyle, flex: 1 }}
              />
              <Button size="sm" tone="accent" onClick={parseNL} disabled={nlBusy || !nlText.trim()}>
                {nlBusy ? "tænker…" : "→ AI-forslag"}
              </Button>
              <Button size="sm" onClick={() => { setEditorPrefill(null); setEditing("new"); }}>
                + ny regel
              </Button>
            </div>
            {nlError && <div style={{ color: "#d87373", fontSize: 11, marginTop: -16, marginBottom: 16 }}>{nlError}</div>}

            {/* Aktive regler */}
            <Section title={`aktive regler ${items.length > 0 ? `(${ruleStats})` : ""}`} className="mb-8">
              {loading ? (
                <span style={{ color: "#6b6b6b", fontSize: 12 }}>indlæser…</span>
              ) : items.length === 0 ? (
                <div style={{ color: "#6b6b6b", fontSize: 12, borderTop: "1px dashed #1c1c1c", paddingTop: 12 }}>
                  ingen regler endnu — beskriv én ovenfor eller vælg en skabelon
                </div>
              ) : (
                <RulesTable
                  items={items}
                  onToggle={toggle}
                  onRunNow={runNow}
                  onRemove={remove}
                  onEdit={(a) => setEditing(a)}
                  onShowDetail={(a) => setDetail(a)}
                />
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
                    <div style={{ color: "#444", fontSize: 10 }}>
                      {summaryTrigger(t.trigger)} → {summaryActions(t.actions)}
                    </div>
                  </button>
                ))}
              </div>
            </Section>
          </>
        )}

        {/* ── SETUP ──────────────────────────────────────────────────────────── */}
        {activeTab === "setup" && (
          <>
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
                    <Button size="sm" tone="accent" onClick={sendNotifyTest} disabled={testing}>
                      {testing ? "sender…" : "→ send test"}
                    </Button>
                    {testMsg && <span style={{ color: "#9bd0ff", fontSize: 11 }}>{testMsg}</span>}
                  </div>

                  {/* Public URL — bruges af ntfy click-actions */}
                  <div style={{ borderTop: "1px dashed #262626", marginTop: 14, paddingTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ color: "#6b6b6b", width: 90 }}>public URL</span>
                      <input
                        type="text"
                        value={publicUrlInput}
                        onChange={(e) => setPublicUrlInput(e.target.value)}
                        onBlur={(e) => savePublicUrl(e.target.value)}
                        placeholder="fx http://din-mac.tail-XXXX.ts.net:3100 (Tailscale)"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                    </div>
                    <div style={{ color: "#6b6b6b", fontSize: 11, marginLeft: 100, lineHeight: 1.6 }}>
                      Når sat: notif-tap åbner Skynet&apos;s reply-side på iPhone. Hvis tom: tap åbner ntfy-appen
                      naturligt og du kan svare direkte i ntfy (kræver subscriber-toggle nedenfor).
                    </div>
                  </div>

                  {/* ntfy reply-back subscriber */}
                  <div style={{ borderTop: "1px dashed #262626", marginTop: 14, paddingTop: 12 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, cursor: notifyCfg.ntfyTopic ? "pointer" : "not-allowed" }}>
                      <input
                        type="checkbox"
                        checked={ntfySub?.enabled ?? false}
                        disabled={!notifyCfg.ntfyTopic}
                        onChange={(e) => toggleNtfySub(e.target.checked)}
                      />
                      <span style={{ color: notifyCfg.ntfyTopic ? "#e5e5e5" : "#525252" }}>
                        aktivér ntfy reply-back
                      </span>
                      {ntfySub?.enabled && <span style={{ color: "#7dd67d", fontSize: 11 }}>● subscriber kører</span>}
                      {!notifyCfg.ntfyTopic && <span style={{ color: "#6b6b6b", fontSize: 11 }}>(kræver ntfy-topic)</span>}
                    </label>
                    <div style={{ color: "#6b6b6b", fontSize: 11, marginLeft: 24, lineHeight: 1.5 }}>
                      Når aktiv: Skynet lytter på ntfy-topic via SSE. Skriver du en besked i ntfy-app&apos;en
                      (publish-knappen), bliver den brugt som reply til seneste Claude Code-session →
                      <code style={{ color: "#9bd0ff" }}> claude --resume</code>{" "}
                      kører i baggrunden og sender ny push når den er færdig.
                      Botens egne beskeder filtreres væk via <code style={{ color: "#9bd0ff" }}>skynet-bot</code> tag.
                    </div>
                    {ntfySub?.lastFinishedSessionId && (
                      <div style={{ color: "#525252", fontSize: 10, marginLeft: 24, marginTop: 6 }}>
                        Seneste claude-session: <code style={{ color: "#6b6b6b" }}>{ntfySub.lastFinishedSessionId.slice(0, 8)}…</code>
                        {ntfySub.lastFinishedSessionAt && ` · ${new Date(ntfySub.lastFinishedSessionAt).toLocaleString("da-DK", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}`}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <span style={{ color: "#6b6b6b", fontSize: 12 }}>indlæser…</span>
              )}
            </Section>

            {/* iMessage — alt samlet ét sted */}
            <Section title="iMessage" right={imessagePoller?.enabled ? <span style={{ color: "#7dd67d" }}>● poller aktiv</span> : null} className="mb-8">
              <div style={{ fontSize: 12 }}>
                {/* Default-modtager */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ color: "#6b6b6b", width: 100 }}>default-modtager</span>
                  <input
                    type="text"
                    value={imessageDefault}
                    onChange={(e) => setImessageDefault(e.target.value)}
                    onBlur={(e) => saveImessageDefault(e.target.value)}
                    placeholder="+4512345678 eller dig@icloud.com"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginLeft: 110, marginBottom: 16 }}>
                  Bruges af templates, schedule_imessage_reminder-tool og inbound-LLM. 8-cifret DK-nummer normaliseres.
                </div>

                {/* FDA-banner — stort hvis ikke OK */}
                {imessagePoller && !imessagePoller.fdaOk && (
                  <div style={{ background: "#2a1f0a", border: "1px solid #6b5a1f", borderRadius: 4, padding: "10px 12px", marginBottom: 14 }}>
                    <div style={{ color: "#e6b450", fontWeight: 500, marginBottom: 4 }}>
                      ⚠ Full Disk Access mangler
                    </div>
                    <div style={{ color: "#bfa76a", fontSize: 11, lineHeight: 1.6 }}>
                      Polleren kan ikke læse <code style={{ color: "#e6b450" }}>~/Library/Messages/chat.db</code> uden Full Disk Access.
                      Indkommende iMessages registreres derfor ikke.
                      <div style={{ marginTop: 6 }}>
                        <strong>Sådan aktiveres:</strong>
                        <div>System Settings → Privacy &amp; Security → Full Disk Access → klik &quot;+&quot; og tilføj{" "}
                          <code style={{ color: "#e6b450" }}>/opt/homebrew/bin/node</code> (eller terminal hvor portalen kører).
                        </div>
                        <div style={{ marginTop: 4 }}>
                          Genstart derefter portalen: <code style={{ color: "#e6b450" }}>launchctl kickstart -k gui/$(id -u)/com.skynet.portal</code>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {imessagePoller?.fdaOk && (
                  <div style={{ color: "#7dd67d", fontSize: 11, marginBottom: 14 }}>
                    ✓ Full Disk Access OK · sidst sete rowid: <code style={{ color: "#7dd67d" }}>{imessagePoller.lastSeenRowid ?? "—"}</code>
                  </div>
                )}

                {/* Toggle */}
                <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, cursor: imessagePoller ? "pointer" : "default" }}>
                  <input
                    type="checkbox"
                    checked={imessagePoller?.enabled ?? false}
                    disabled={!imessagePoller}
                    onChange={(e) => toggleImessagePoller(e.target.checked)}
                  />
                  <span style={{ color: "#e5e5e5" }}>aktivér inbound iMessage → LLM</span>
                  <span style={{ color: "#6b6b6b" }}>(poll hvert 30s)</span>
                </label>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginLeft: 24, marginBottom: 16, lineHeight: 1.5 }}>
                  Indkommende beskeder kører gennem LLM med tools (web-søg, vejr, kalender,{" "}
                  <code style={{ color: "#9bd0ff" }}>schedule_imessage_reminder</code>). LLM&apos;s svar
                  sendes som iMessage tilbage. One-off reminders oprettes automatisk.
                </div>

                {/* Test-inbound */}
                <div style={{ borderTop: "1px dashed #262626", paddingTop: 12 }}>
                  <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 6 }}>
                    test inbound LLM (silent — sender ikke iMessage tilbage)
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <input
                      type="text"
                      value={inboundTestMsg}
                      onChange={(e) => setInboundTestMsg(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runInboundTest(); } }}
                      placeholder='fx "tjek vejret" eller "send mig en sms om 2 min med teksten test"'
                      disabled={inboundTestBusy}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <Button size="sm" tone="accent" onClick={runInboundTest} disabled={inboundTestBusy || !inboundTestMsg.trim()}>
                      {inboundTestBusy ? "kører…" : "→ test"}
                    </Button>
                  </div>
                  {inboundTestResult && (
                    <div
                      style={{
                        background: "#0a0a0a",
                        border: `1px dashed ${inboundTestResult.ok ? "#2c4a2c" : "#5a2c2c"}`,
                        padding: "8px 10px",
                        marginTop: 4,
                        fontSize: 11,
                        lineHeight: 1.5,
                      }}
                    >
                      {inboundTestResult.ok ? (
                        <>
                          <div style={{ color: "#7dd67d" }}>✓ LLM-svar:</div>
                          <div style={{ color: "#e5e5e5", marginTop: 4, whiteSpace: "pre-wrap" }}>{inboundTestResult.reply}</div>
                          {inboundTestResult.toolsUsed && inboundTestResult.toolsUsed.length > 0 && (
                            <div style={{ color: "#525252", marginTop: 6 }}>
                              tools: {inboundTestResult.toolsUsed.join(", ")}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ color: "#d87373" }}>✗ {inboundTestResult.error ?? "fejl"}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Section>

            <Section
              title="telegram bot (anbefalet 2-vejs)"
              right={telegram?.enabled ? <span style={{ color: "#7dd67d" }}>● poller aktiv</span> : null}
              className="mb-8"
            >
              <div style={{ fontSize: 12 }}>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 8, lineHeight: 1.6 }}>
                  Sikrere alternativ til iMessage — botten har sit eget Telegram-handle og taler kun med chat_ids du explicit
                  godkender. Ingen iCloud-sync-loops, ingen FDA-krav.
                </div>

                {/* Bot-token */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ color: "#6b6b6b", width: 100 }}>bot-token</span>
                  <input
                    type="password"
                    value={telegramTokenInput}
                    onChange={(e) => setTelegramTokenInput(e.target.value)}
                    onBlur={(e) => saveTelegramToken(e.target.value)}
                    placeholder={telegram?.hasBotToken ? "(gemt — indtast for at ændre)" : "fra @BotFather i Telegram"}
                    autoComplete="off"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginLeft: 110, lineHeight: 1.6, marginBottom: 14 }}>
                  Skriv til{" "}
                  <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{ color: "#9bd0ff" }}>@BotFather</a>
                  {" "}i Telegram → <code style={{ color: "#9bd0ff" }}>/newbot</code> → giv den et navn → kopiér token (formateret som <code>123456789:ABC...</code>).
                </div>

                {/* Bot-info hvis token virker */}
                {telegram?.bot && (
                  <div style={{ background: "#0a1a0a", border: "1px solid #2c4a2c", padding: "8px 12px", marginBottom: 14, fontSize: 11 }}>
                    <span style={{ color: "#7dd67d" }}>✓ forbundet til</span>{" "}
                    <a href={`https://t.me/${telegram.bot.username}`} target="_blank" rel="noreferrer" style={{ color: "#9bd0ff" }}>
                      @{telegram.bot.username}
                    </a>
                    <span style={{ color: "#6b6b6b" }}> · {telegram.bot.first_name} (id {telegram.bot.id})</span>
                  </div>
                )}
                {telegram?.hasBotToken && telegram?.botError && (
                  <div style={{ background: "#1f0a0a", border: "1px solid #5a2c2c", padding: "8px 12px", marginBottom: 14, fontSize: 11 }}>
                    <span style={{ color: "#d87373" }}>✗ token-fejl: {telegram.botError}</span>
                  </div>
                )}

                {/* Allowed chat_ids */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ color: "#6b6b6b", width: 100 }}>tilladte chats</span>
                  <input
                    type="text"
                    value={telegramAllowedInput}
                    onChange={(e) => setTelegramAllowedInput(e.target.value)}
                    onBlur={(e) => saveTelegramAllowed(e.target.value)}
                    placeholder="123456789, -987654321 (komma-separeret)"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginLeft: 110, lineHeight: 1.6, marginBottom: 8 }}>
                  Sikker default: tom liste = botten ignorerer ALT. Skriv til botten i Telegram først, klik så
                  knappen nedenfor for at finde dit chat_id automatisk.
                </div>
                <div style={{ marginLeft: 110, marginBottom: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Button size="sm" tone="accent" onClick={discoverTelegramChats} disabled={tgDiscoverBusy || !telegram?.hasBotToken}>
                    {tgDiscoverBusy ? "henter…" : "→ find chat_id automatisk"}
                  </Button>
                  {tgDiscovered && (
                    <span style={{ fontSize: 11, color: tgDiscovered.ok ? "#7dd67d" : "#d87373" }}>
                      {tgDiscovered.ok
                        ? `${tgDiscovered.chats?.length ?? 0} chats fundet`
                        : `✗ ${tgDiscovered.error}`}
                    </span>
                  )}
                </div>
                {tgDiscovered?.chats && tgDiscovered.chats.length > 0 && (
                  <div style={{ marginLeft: 110, marginBottom: 14, border: "1px dashed #262626", padding: "8px 12px", fontSize: 11 }}>
                    {tgDiscovered.chats.map((c) => {
                      const isAllowed = telegramAllowedInput.split(",").map((s) => s.trim()).includes(String(c.chatId));
                      return (
                        <div key={c.chatId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px dashed #1c1c1c", gap: 10 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: "#e5e5e5" }}>
                              <code style={{ color: "#9bd0ff" }}>{c.chatId}</code>
                              <span style={{ color: "#6b6b6b", marginLeft: 8 }}>
                                {c.type}{c.title ? ` · ${c.title}` : ""}{c.username ? ` · @${c.username}` : ""}{c.firstName ? ` · ${c.firstName}` : ""}
                              </span>
                            </div>
                            <div style={{ color: "#525252", fontSize: 10, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              &ldquo;{c.lastMessageText}&rdquo;
                            </div>
                          </div>
                          {isAllowed ? (
                            <span style={{ color: "#7dd67d", fontSize: 11, whiteSpace: "nowrap" }}>✓ tilføjet</span>
                          ) : (
                            <Button size="sm" onClick={() => addChatIdToAllowlist(c.chatId)}>+ tilføj</Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {tgDiscovered?.hint && (
                  <div style={{ marginLeft: 110, marginBottom: 14, fontSize: 11, color: "#e6b450" }}>
                    💡 {tgDiscovered.hint}
                  </div>
                )}

                {/* Toggle */}
                <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, cursor: telegram?.hasBotToken ? "pointer" : "not-allowed" }}>
                  <input
                    type="checkbox"
                    checked={telegram?.enabled ?? false}
                    disabled={!telegram?.hasBotToken}
                    onChange={(e) => toggleTelegram(e.target.checked)}
                  />
                  <span style={{ color: telegram?.hasBotToken ? "#e5e5e5" : "#525252" }}>
                    aktivér Telegram-poller (long-polling /getUpdates)
                  </span>
                  {!telegram?.hasBotToken && (
                    <span style={{ color: "#6b6b6b", fontSize: 11 }}>(kræver bot-token)</span>
                  )}
                </label>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginLeft: 24, lineHeight: 1.5 }}>
                  Indkommende beskeder fra tilladte chats kører gennem LLM med tools. Reminders oprettes via{" "}
                  <code style={{ color: "#9bd0ff" }}>schedule_telegram_reminder</code>. Ingen polling-delay — Telegram pusher
                  beskeder live til botten.
                </div>
              </div>
            </Section>

            <Section title="transit (rejseplanen)" right={hasRejseplanenAccessId ? <span style={{ color: "#7dd67d" }}>● konfigureret</span> : null} className="mb-8">
              <div style={{ fontSize: 12 }}>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 8, lineHeight: 1.6 }}>
                  Når sat kan LLM&apos;en bruge <code style={{ color: "#9bd0ff" }}>find_train_route</code> til at slå rigtige
                  togtider, bus- og metroafgange op via Rejseplanens API.
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ color: "#6b6b6b", width: 100 }}>access ID</span>
                  <input
                    type="password"
                    value={rejseplanenAccessId}
                    onChange={(e) => setRejseplanenAccessId(e.target.value)}
                    onBlur={(e) => saveRejseplanenAccessId(e.target.value)}
                    placeholder={hasRejseplanenAccessId ? "(gemt — indtast for at ændre)" : "fra rejseplanens API-portal"}
                    autoComplete="off"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginLeft: 110, lineHeight: 1.6 }}>
                  Gratis nøgle: registrér på{" "}
                  <a href="https://help.rejseplanen.dk" target="_blank" rel="noreferrer" style={{ color: "#9bd0ff" }}>help.rejseplanen.dk</a>
                  {" "}— de svarer typisk indenfor en uge. Uden nøgle returnerer{" "}
                  <code style={{ color: "#9bd0ff" }}>find_train_route</code> en fejl der fortæller LLM at fortælle dig det.
                </div>
              </div>
            </Section>

            <Section title="nzbgeek (film/tv-søgning)" right={hasNzbgeekApiKey ? <span style={{ color: "#7dd67d" }}>● konfigureret</span> : null} className="mb-8">
              <div style={{ fontSize: 12 }}>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginBottom: 8, lineHeight: 1.6 }}>
                  Når sat kan LLM&apos;en bruge <code style={{ color: "#9bd0ff" }}>search_nzbgeek</code> til at finde
                  trending film og søge efter specifikke film/serier i NZBgeek-indekset.
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ color: "#6b6b6b", width: 100 }}>API key</span>
                  <input
                    type="password"
                    value={nzbgeekApiKey}
                    onChange={(e) => setNzbgeekApiKey(e.target.value)}
                    onBlur={(e) => saveNzbgeekApiKey(e.target.value)}
                    placeholder={hasNzbgeekApiKey ? "(gemt — indtast for at ændre)" : "din 'r'-værdi fra api.nzbgeek.info"}
                    autoComplete="off"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
                <div style={{ color: "#6b6b6b", fontSize: 11, marginLeft: 110, lineHeight: 1.6 }}>
                  Find din nøgle på{" "}
                  <a href="https://nzbgeek.info/account.php" target="_blank" rel="noreferrer" style={{ color: "#9bd0ff" }}>nzbgeek.info/account.php</a>
                  {" "}(kræver konto). Det er den værdi der står som <code style={{ color: "#9bd0ff" }}>&amp;r=...</code> i RSS-URL&apos;en.
                </div>
              </div>
            </Section>

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
                    <Button size="sm" tone="accent" onClick={testGmail} disabled={gmailTesting}>
                      {gmailTesting ? "tester…" : "→ test forbindelse"}
                    </Button>
                    <ButtonLink size="sm" tone="accent" href="/api/agent/triage-mail?push=1" target="_blank" rel="noreferrer">
                      kør triage nu
                    </ButtonLink>
                    {gmailMsg && <span style={{ color: "#9bd0ff", fontSize: 11 }}>{gmailMsg}</span>}
                  </div>
                </div>
              ) : (
                <span style={{ color: "#6b6b6b", fontSize: 12 }}>indlæser…</span>
              )}
            </Section>
          </>
        )}

        {/* ── LOGS ───────────────────────────────────────────────────────────── */}
        {activeTab === "logs" && <AgentLogPanel />}
      </main>

      <AutomationEditor
        target={editing}
        prefill={editorPrefill}
        onClose={() => { setEditing(null); setEditorPrefill(null); }}
        onSaved={load}
      />
      <AutomationDetailDrawer automation={detail} onClose={() => setDetail(null)} />
    </MinimalPageLayout>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────

function Tabs({
  active,
  onChange,
  tabs,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  tabs: Array<{ id: TabId; label: string; badge?: string }>;
}) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px dashed #262626", marginBottom: 24 }}>
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              background: "none",
              border: "none",
              padding: "10px 18px",
              fontFamily: "inherit",
              fontSize: 12,
              cursor: "pointer",
              color: isActive ? "#e5e5e5" : "#6b6b6b",
              borderBottom: isActive ? "1px solid #9bd0ff" : "1px solid transparent",
              marginBottom: -1,
              letterSpacing: "0.05em",
            }}
          >
            {t.label}
            {t.badge && (
              <span style={{ color: isActive ? "#525252" : "#3a3a3a", marginLeft: 6, fontSize: 11 }}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Rules table ─────────────────────────────────────────────────────────────

function RulesTable({
  items,
  onToggle,
  onRunNow,
  onRemove,
  onEdit,
  onShowDetail,
}: {
  items: Automation[];
  onToggle: (a: Automation) => void;
  onRunNow: (a: Automation) => void;
  onRemove: (a: Automation) => void;
  onEdit: (a: Automation) => void;
  onShowDetail: (a: Automation) => void;
}) {
  return (
    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "#6b6b6b", borderBottom: "1px dashed #262626" }}>
          <th style={{ textAlign: "left", padding: "0 8px 6px 0", fontWeight: 400, width: 24 }}></th>
          <th style={{ textAlign: "left", padding: "0 8px 6px 0", fontWeight: 400 }}>navn</th>
          <th style={{ textAlign: "left", padding: "0 8px 6px 0", fontWeight: 400 }}>trigger → action</th>
          <th style={{ textAlign: "left", padding: "0 0 6px 0", fontWeight: 400 }}>kørsel</th>
          <th style={{ textAlign: "right", padding: "0 0 6px 0", fontWeight: 400 }}></th>
        </tr>
      </thead>
      <tbody>
        {items.map((a) => (
          <tr key={a.id} style={{ borderBottom: "1px dashed #1c1c1c", color: a.enabled ? "#e5e5e5" : "#6b6b6b" }}>
            <td style={{ padding: "7px 8px 7px 0" }}>
              <button onClick={() => onToggle(a)} title={a.enabled ? "aktiv" : "inaktiv"} style={{ background: "none", border: "none", cursor: "pointer", color: a.enabled ? "#7dd67d" : "#6b6b6b", fontSize: 12, padding: 0 }}>●</button>
            </td>
            <td style={{ padding: "7px 8px 7px 0", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <button
                onClick={() => onShowDetail(a)}
                style={{ background: "none", border: "none", padding: 0, color: "#9bd0ff", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 12 }}
                title="Se historik + dry-run"
              >
                {a.name}
              </button>
              {a.description && <div style={{ color: "#6b6b6b", fontSize: 11 }}>{a.description}</div>}
            </td>
            <td style={{ padding: "7px 8px 7px 0", color: "#6b6b6b", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {summaryTrigger(a.trigger)}<Sep />{summaryActions(a.actions)}
            </td>
            <td style={{ padding: "7px 8px 7px 0", color: "#6b6b6b", fontSize: 11, whiteSpace: "nowrap" }}>
              <RunCell automation={a} />
            </td>
            <td style={{ padding: "7px 0 7px 0", textAlign: "right", whiteSpace: "nowrap" }}>
              <Button size="sm" tone="accent" onClick={() => onRunNow(a)} className="mr-1">kør</Button>
              <Button size="sm" tone="accent" onClick={() => onEdit(a)} className="mr-1">redigér</Button>
              <button onClick={() => onRemove(a)} style={{ background: "none", border: "none", color: "#6b6b6b", cursor: "pointer", fontSize: 12 }}>✕</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Live agent log panel ────────────────────────────────────────────────────

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

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, paused]);

  const fmt = (ts: number) => new Date(ts).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div style={{ fontFamily: "inherit" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#6b6b6b" }}>
          <span style={{ marginRight: 6 }}>#</span>agent logs
          <span style={{ color: "#3a3a3a", marginLeft: 8 }}>live · {logs.length} linjer</span>
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
          height: 480,
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

function RunCell({ automation }: { automation: Automation }) {
  const next = automation.enabled && automation.trigger.type === "cron"
    ? nextRuns(automation.trigger.expression, 1, automation.trigger.tz)[0]
    : automation.enabled && automation.trigger.type === "once"
      ? automation.trigger.runAt
      : undefined;
  const lastTxt = automation.lastRunAt
    ? new Date(automation.lastRunAt).toLocaleString("da-DK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "aldrig kørt";
  return (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
      {next ? (
        <span style={{ color: "#9bd0ff" }}>
          næste {relativeFromNow(next)}
          <span style={{ color: "#3a3a3a", marginLeft: 4 }}>
            ({new Date(next).toLocaleString("da-DK", { hour: "2-digit", minute: "2-digit" })})
          </span>
        </span>
      ) : automation.trigger.type === "cron" ? (
        <span style={{ color: "#6b6b6b" }}>(inaktiv)</span>
      ) : automation.trigger.type === "threshold" ? (
        <span style={{ color: "#6b6b6b" }}>tærskel-watch</span>
      ) : (
        <span style={{ color: "#6b6b6b" }}>manuel</span>
      )}
      <span style={{ color: "#525252", fontSize: 10 }}>
        sidst: {lastTxt}
        {automation.lastStatus && (
          <span style={{ color: automation.lastStatus === "ok" ? "#7dd67d" : "#d87373", marginLeft: 4 }}>
            {automation.lastStatus === "ok" ? "✓" : "✗"}
          </span>
        )}
      </span>
    </div>
  );
}

function summaryTrigger(t: Trigger): string {
  if (t.type === "cron") return `cron ${t.expression}`;
  if (t.type === "threshold") return `${t.metric} ${t.op} ${t.value}`;
  if (t.type === "once") return `én gang ${new Date(t.runAt).toLocaleString("da-DK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
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
