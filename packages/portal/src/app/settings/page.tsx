"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { LLMConfig } from "@/lib/settings";

interface SettingsResp {
  llm: LLMConfig;
  defaults: LLMConfig;
}

interface ModelsResp {
  available: boolean;
  baseUrl: string;
  models: Array<{ id: string; label?: string; tag?: string }>;
  missing: Array<{ hint: string; label: string; tag: string }>;
  error?: string;
}

export default function SettingsPage() {
  const [llm, setLlm] = useState<LLMConfig | null>(null);
  const [defaults, setDefaults] = useState<LLMConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<ModelsResp | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: SettingsResp) => {
        setLlm(data.llm);
        setDefaults(data.defaults);
      })
      .catch(() => {
        /* noop */
      });
  }, []);

  const save = async () => {
    if (!llm) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llm }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/chat/models", { cache: "no-store" });
      const data = (await res.json()) as ModelsResp;
      setTest(data);
    } catch (e) {
      setTest({
        available: false,
        baseUrl: llm?.baseUrl ?? "",
        models: [],
        missing: [],
        error: e instanceof Error ? e.message : "unknown",
      });
    } finally {
      setTesting(false);
    }
  };

  const resetKey = (key: keyof LLMConfig) => {
    if (!llm || !defaults) return;
    setLlm({ ...llm, [key]: defaults[key] });
  };

  if (!llm) {
    return <div className="min-h-screen p-8 text-neutral-500">Indlæser indstillinger…</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0d10] text-neutral-200">
      <header className="border-b border-cyan-400/15 bg-[#0d1518]/80">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.3em] text-cyan-400/70 font-mono hover:text-cyan-300"
          >
            ← SKYNET
          </Link>
          <span className="text-neutral-600">/</span>
          <span className="text-sm">Indstillinger</span>
          <div className="flex-1" />
          <Link
            href="/chat"
            className="text-[10px] uppercase tracking-[0.3em] text-cyan-400/70 font-mono hover:text-cyan-300"
          >
            chat →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <section>
          <h2 className="text-sm uppercase tracking-[0.2em] text-cyan-400/70 font-mono mb-4">
            LLM / LM Studio
          </h2>

          <div className="space-y-4">
            <Field
              label="Base URL"
              help="LM Studio's OpenAI-kompatible endpoint (typisk http://localhost:1234/v1)"
              value={llm.baseUrl}
              onChange={(v) => setLlm({ ...llm, baseUrl: v })}
              onReset={() => resetKey("baseUrl")}
            />
            <Field
              label="API-nøgle"
              help="LM Studio ignorerer indholdet — men noget skal stå der."
              value={llm.apiKey}
              onChange={(v) => setLlm({ ...llm, apiKey: v })}
              onReset={() => resetKey("apiKey")}
            />
            <Field
              label="Default model-ID"
              help="Tom = vælger første tilgængelige. Ellers skal ID matche /v1/models."
              value={llm.defaultModel}
              onChange={(v) => setLlm({ ...llm, defaultModel: v })}
              onReset={() => resetKey("defaultModel")}
            />
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-wider text-neutral-500">
                  System-prompt
                </label>
                <button
                  onClick={() => resetKey("systemPrompt")}
                  className="text-[10px] text-neutral-600 hover:text-cyan-300 uppercase tracking-wider"
                >
                  nulstil
                </button>
              </div>
              <textarea
                value={llm.systemPrompt}
                onChange={(e) => setLlm({ ...llm, systemPrompt: e.target.value })}
                rows={4}
                className="w-full bg-black/40 border border-cyan-400/20 rounded p-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-cyan-400/60"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={llm.verbose}
                onChange={(e) => setLlm({ ...llm, verbose: e.target.checked })}
                className="accent-cyan-400"
              />
              <span className="text-sm">Vis verbose metrics som default (TTFT, tokens, t/s)</span>
            </label>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded bg-cyan-500/80 hover:bg-cyan-400 text-black text-sm font-medium disabled:opacity-40"
            >
              {saving ? "gemmer…" : "Gem"}
            </button>
            {saved && <span className="text-xs text-emerald-400">✓ gemt</span>}
            <div className="flex-1" />
            <button
              onClick={runTest}
              disabled={testing}
              className="px-4 py-2 rounded border border-cyan-400/30 text-cyan-200 hover:border-cyan-400/60 text-sm disabled:opacity-40"
            >
              {testing ? "tester…" : "Test LM Studio"}
            </button>
          </div>

          {test && (
            <div
              className={`mt-4 rounded border p-3 text-xs font-mono ${
                test.available
                  ? "border-emerald-400/30 bg-emerald-950/20 text-emerald-200"
                  : "border-rose-500/30 bg-rose-950/20 text-rose-200"
              }`}
            >
              <div>
                {test.available ? "✓ forbundet" : "✗ kunne ikke forbinde"} · {test.baseUrl}
              </div>
              {test.error && <div className="mt-1 opacity-70">fejl: {test.error}</div>}
              {test.available && (
                <>
                  <div className="mt-2 text-neutral-400">
                    Loadede modeller ({test.models.length}):
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {test.models.map((m) => (
                      <li key={m.id} className="text-neutral-200">
                        · {m.id}
                        {m.label && <span className="text-neutral-500"> — {m.label}</span>}
                      </li>
                    ))}
                  </ul>
                  {test.missing.length > 0 && (
                    <>
                      <div className="mt-2 text-amber-300/80">
                        Forventede, men ikke loaded:
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {test.missing.map((m) => (
                          <li key={m.hint} className="text-amber-300/60">
                            · {m.label}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Field({
  label,
  help,
  value,
  onChange,
  onReset,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  onReset?: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</label>
        {onReset && (
          <button
            onClick={onReset}
            className="text-[10px] text-neutral-600 hover:text-cyan-300 uppercase tracking-wider"
          >
            nulstil
          </button>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black/40 border border-cyan-400/20 rounded p-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-cyan-400/60"
      />
      {help && <div className="text-[10px] text-neutral-600 mt-1">{help}</div>}
    </div>
  );
}
