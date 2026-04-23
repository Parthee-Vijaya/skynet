"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Automation, Trigger, Action } from "@/lib/agent/types";
import { AutomationEditor } from "@/components/automations/AutomationEditor";

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
  {
    name: "Morgen-ping",
    description: "Kort besked hver morgen kl 07:30",
    trigger: { type: "cron", expression: "30 7 * * *" },
    action: {
      type: "notify",
      title: "Godmorgen",
      body: "Skynet er klar til dagen ☕",
      priority: "default",
    },
  },
  {
    name: "Disk-alarm >90%",
    description: "Advarsel når disken er næsten fuld",
    trigger: {
      type: "threshold",
      metric: "disk_percent",
      op: ">",
      value: 90,
      cooldownSec: 3600,
    },
    action: {
      type: "notify",
      title: "Disk næsten fuld ({value}%)",
      body: "Disken er over {threshold}% — ryd op i Downloads/cache",
      priority: "high",
      tag: "warning",
    },
  },
  {
    name: "CPU hot >85°C",
    description: "Push når temperaturen er høj i 5 min",
    trigger: {
      type: "threshold",
      metric: "temperature",
      op: ">",
      value: 85,
      sustainSec: 300,
      cooldownSec: 1800,
    },
    action: {
      type: "notify",
      title: "CPU varm ({value}°C)",
      body: "Tjek om en proces er i loop — har været over {threshold}°C i 5+ min",
      priority: "high",
      tag: "fire",
    },
  },
  {
    name: "LLM-briefing kl 07:00",
    description: "LLM genererer kort dansk morgenbriefing",
    trigger: { type: "cron", expression: "0 7 * * *" },
    action: {
      type: "llm_notify",
      prompt:
        "Skriv en kort dansk morgenbriefing på max 3 linjer. Nævn vejret, dagens el-spotpris og om der er vigtige services der ikke kører. Brug tools når det giver mening.",
      notifyTitle: "Morgenbriefing",
      priority: "default",
    },
  },
];

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

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (a: Automation) => {
    await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !a.enabled }),
    });
    load();
  };

  const runNow = async (a: Automation) => {
    await fetch(`/api/automations/${a.id}/run`, { method: "POST" });
    load();
  };

  const remove = async (a: Automation) => {
    if (!confirm(`Slet "${a.name}"?`)) return;
    await fetch(`/api/automations/${a.id}`, { method: "DELETE" });
    load();
  };

  const addTemplate = async (t: (typeof TEMPLATES)[number]) => {
    await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: t.name,
        description: t.description,
        trigger: t.trigger,
        action: t.action,
        enabled: false,
      }),
    });
    load();
  };

  const sendTest = async () => {
    setTesting(true);
    setTestMsg("");
    try {
      const res = await fetch("/api/automations/notify-config", { method: "POST" });
      const data = (await res.json()) as {
        results: Array<{ backend: string; ok: boolean; error?: string }>;
      };
      if (data.results.length === 0) {
        setTestMsg("Ingen backends aktive — tænd macOS eller konfigurer ntfy/pushover");
      } else {
        setTestMsg(
          data.results
            .map((r) => `${r.backend}: ${r.ok ? "✓" : "✗ " + (r.error ?? "")}`)
            .join(" · ")
        );
      }
    } finally {
      setTesting(false);
    }
  };

  const saveNotify = async (patch: Partial<NotifyCfg>) => {
    await fetch("/api/automations/notify-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  };

  const saveGmail = async (patch: Partial<GmailCfg> & { appPassword?: string }) => {
    await fetch("/api/automations/gmail-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  };

  const testGmail = async () => {
    setGmailTesting(true);
    setGmailMsg("");
    try {
      // Gem evt. nyt password først
      if (gmailPassword.trim()) {
        await saveGmail({ appPassword: gmailPassword.trim() });
        setGmailPassword("");
      }
      const res = await fetch("/api/automations/gmail-config", { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        message: string;
        total?: number;
      };
      setGmailMsg(
        data.ok
          ? `✓ ${data.message}${data.total != null ? ` · ${data.total} mails i INBOX` : ""}`
          : `✗ ${data.message}`
      );
    } finally {
      setGmailTesting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#07090b] text-neutral-100">
      <header className="border-b border-cyan-400/10 bg-[#0a0e11]/90">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/"
            className="w-9 h-9 rounded-lg border border-cyan-400/20 flex items-center justify-center text-cyan-300 hover:border-cyan-400/50"
          >
            ←
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-medium text-cyan-100">Automations</h1>
            <div className="text-[11px] text-neutral-500">
              Planlæg beskeder og tool-actions baseret på tid eller tærskler
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {/* Notifikations-konfig */}
        <section className="rounded-xl border border-cyan-400/15 bg-[#0a1216]/60 p-4">
          <h2 className="text-sm font-medium text-cyan-200 mb-3">Notifikations-backends</h2>
          {notifyCfg ? (
            <div className="space-y-3 text-sm">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={notifyCfg.macos}
                  onChange={(e) =>
                    saveNotify({ macos: e.target.checked } as Partial<NotifyCfg>)
                  }
                  className="accent-cyan-400"
                />
                <span className="text-neutral-200">macOS Notification Center</span>
                <span className="text-[11px] text-neutral-500">
                  (lokalt, ingen opsætning)
                </span>
              </label>

              <div className="flex items-center gap-3">
                <label className="text-neutral-300 w-32 text-[13px]">ntfy topic</label>
                <input
                  type="text"
                  value={notifyCfg.ntfyTopic}
                  onChange={(e) =>
                    setNotifyCfg({ ...notifyCfg, ntfyTopic: e.target.value })
                  }
                  onBlur={(e) =>
                    saveNotify({ ntfyTopic: e.target.value } as Partial<NotifyCfg>)
                  }
                  placeholder="fx skynet-parthee-xyz"
                  className="flex-1 bg-black/40 border border-cyan-400/20 rounded-lg px-3 py-1.5 text-sm font-mono text-neutral-200 focus:outline-none focus:border-cyan-400/50"
                />
                <span className="text-[11px] text-neutral-500">
                  {notifyCfg.ntfyTopic ? "aktiv" : "inaktiv"}
                </span>
              </div>

              <div className="text-[11px] text-neutral-500 pl-[8.5rem]">
                Hent ntfy-appen til iPhone/Android og abonnér på dit topic — push
                uden opsætning.
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={sendTest}
                  disabled={testing}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-cyan-100 text-[13px] hover:bg-cyan-500/25 disabled:opacity-40"
                >
                  {testing ? "sender…" : "Send test-notifikation"}
                </button>
                {testMsg && (
                  <span className="text-[11px] font-mono text-neutral-400">{testMsg}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-500">indlæser…</div>
          )}
        </section>

        {/* Gmail IMAP-konfig */}
        <section className="rounded-xl border border-cyan-400/15 bg-[#0a1216]/60 p-4">
          <h2 className="text-sm font-medium text-cyan-200 mb-3">Gmail triage (IMAP)</h2>
          {gmailCfg ? (
            <div className="space-y-3 text-sm">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={gmailCfg.enabled}
                  onChange={(e) => saveGmail({ enabled: e.target.checked })}
                  className="accent-cyan-400"
                />
                <span className="text-neutral-200">Aktivér mail-triage</span>
                <span className="text-[11px] text-neutral-500">
                  (kun læs — vi sender aldrig noget)
                </span>
              </label>

              <div className="flex items-center gap-3">
                <label className="text-neutral-300 w-32 text-[13px]">Gmail-adresse</label>
                <input
                  type="email"
                  value={gmailCfg.user}
                  onChange={(e) => setGmailCfg({ ...gmailCfg, user: e.target.value })}
                  onBlur={(e) => saveGmail({ user: e.target.value })}
                  placeholder="dig@gmail.com"
                  className="flex-1 bg-black/40 border border-cyan-400/20 rounded-lg px-3 py-1.5 text-sm font-mono text-neutral-200 focus:outline-none focus:border-cyan-400/50"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="text-neutral-300 w-32 text-[13px]">App-password</label>
                <input
                  type="password"
                  value={gmailPassword}
                  onChange={(e) => setGmailPassword(e.target.value)}
                  placeholder={gmailCfg.hasPassword ? "(gemt — indtast for at ændre)" : "16 tegn fra Google"}
                  className="flex-1 bg-black/40 border border-cyan-400/20 rounded-lg px-3 py-1.5 text-sm font-mono text-neutral-200 focus:outline-none focus:border-cyan-400/50"
                />
              </div>

              <div className="text-[11px] text-neutral-500 pl-[8.5rem]">
                Opret app-password på{" "}
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-300 hover:underline"
                >
                  myaccount.google.com/apppasswords
                </a>
                {" "}(kræver 2FA). Password bruges kun lokalt — aldrig sendt videre.
              </div>

              <div className="flex items-center gap-3">
                <label className="text-neutral-300 w-32 text-[13px]">Poll hver</label>
                <input
                  type="number"
                  value={gmailCfg.pollMinutes}
                  onChange={(e) =>
                    setGmailCfg({ ...gmailCfg, pollMinutes: parseInt(e.target.value) || 15 })
                  }
                  onBlur={(e) => saveGmail({ pollMinutes: parseInt(e.target.value) || 15 })}
                  min={5}
                  max={120}
                  className="w-20 bg-black/40 border border-cyan-400/20 rounded-lg px-3 py-1.5 text-sm font-mono text-neutral-200 focus:outline-none focus:border-cyan-400/50"
                />
                <span className="text-[11px] text-neutral-500">minutter</span>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={testGmail}
                  disabled={gmailTesting}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-cyan-100 text-[13px] hover:bg-cyan-500/25 disabled:opacity-40"
                >
                  {gmailTesting ? "tester…" : "Test forbindelse"}
                </button>
                <a
                  href="/api/agent/triage-mail?push=1"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 text-[13px] hover:border-neutral-600"
                >
                  Kør triage nu
                </a>
                {gmailMsg && (
                  <span className="text-[11px] font-mono text-neutral-400">{gmailMsg}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-500">indlæser…</div>
          )}
        </section>

        {/* Aktive automations */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-cyan-200">Aktive regler</h2>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-neutral-500">
                {items.length} i alt · {items.filter((i) => i.enabled).length} aktive
              </span>
              <button
                onClick={() => setEditing("new")}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-cyan-100 text-[12px] hover:bg-cyan-500/25"
              >
                + Ny regel
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-xs text-neutral-500 py-8 text-center">indlæser…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-neutral-500 py-8 text-center border border-dashed border-cyan-400/15 rounded-xl">
              Ingen automations endnu — tryk &quot;+ Ny regel&quot; eller prøv en skabelon nedenfor
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((a) => (
                <AutomationCard
                  key={a.id}
                  a={a}
                  onToggle={() => toggle(a)}
                  onRun={() => runNow(a)}
                  onEdit={() => setEditing(a)}
                  onDelete={() => remove(a)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Skabeloner */}
        <section>
          <h2 className="text-sm font-medium text-cyan-200 mb-3">Skabeloner — ét klik</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                onClick={() => addTemplate(t)}
                className="text-left p-4 rounded-xl border border-cyan-400/15 bg-[#0a1216]/60 hover:border-cyan-400/40 transition-colors"
              >
                <div className="text-[13px] font-medium text-cyan-100 mb-1">{t.name}</div>
                <div className="text-[11px] text-neutral-500 mb-2">{t.description}</div>
                <div className="text-[10px] font-mono text-neutral-600">
                  {summaryTrigger(t.trigger)} → {summaryAction(t.action)}
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>

      <AutomationEditor
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </div>
  );
}

function AutomationCard({
  a,
  onToggle,
  onRun,
  onEdit,
  onDelete,
}: {
  a: Automation;
  onToggle: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const statusColor =
    a.lastStatus === "ok"
      ? "bg-emerald-400"
      : a.lastStatus === "error"
        ? "bg-rose-400"
        : "bg-neutral-600";
  return (
    <div className="rounded-xl border border-cyan-400/15 bg-[#0a1216]/60 px-4 py-3 flex items-center gap-3">
      <button
        onClick={onToggle}
        className={`w-10 h-6 rounded-full shrink-0 relative transition-colors ${
          a.enabled ? "bg-cyan-500/70" : "bg-neutral-700"
        }`}
        title={a.enabled ? "Aktiv — klik for at deaktivere" : "Inaktiv"}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-[left] ${
            a.enabled ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-neutral-100 truncate">{a.name}</div>
          {a.lastRunAt && (
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`}
              title={`seneste: ${a.lastStatus ?? "?"} · ${new Date(a.lastRunAt).toLocaleString("da-DK")}`}
            />
          )}
        </div>
        {a.description && (
          <div className="text-[11px] text-neutral-500 truncate">{a.description}</div>
        )}
        <div className="text-[10px] font-mono text-neutral-600 truncate">
          {summaryTrigger(a.trigger)} → {summaryAction(a.action)}
        </div>
      </div>

      <button
        onClick={onRun}
        className="px-2.5 py-1 rounded-lg border border-cyan-400/20 text-[11px] text-cyan-200 hover:border-cyan-400/50 shrink-0"
        title="Kør nu"
      >
        kør
      </button>
      <button
        onClick={onEdit}
        className="px-2.5 py-1 rounded-lg border border-cyan-400/20 text-[11px] text-cyan-200 hover:border-cyan-400/50 shrink-0"
        title="Redigér"
      >
        redigér
      </button>
      <button
        onClick={onDelete}
        className="px-2 py-1 text-neutral-600 hover:text-rose-400 text-[13px] shrink-0"
        title="Slet"
      >
        ✕
      </button>
    </div>
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
