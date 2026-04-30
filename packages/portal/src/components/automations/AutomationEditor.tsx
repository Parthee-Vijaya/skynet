"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import type {
  Automation,
  Trigger,
  Action,
  CronTrigger,
  ThresholdTrigger,
  NotifyAction,
  LLMNotifyAction,
  ToolAction,
} from "@/lib/agent/types";
import { inspectCron, relativeFromNow } from "@/lib/cron-utils";

interface Props {
  /** Hvis null: opret ny. Hvis Automation: redigér eksisterende. */
  target: Automation | "new" | null;
  /** Forhåndsudfyld editoren (fx fra NL→automation-forslag) — kun hvis target === "new" */
  prefill?: {
    name: string;
    description?: string;
    enabled?: boolean;
    trigger: Trigger;
    actions: Action[];
  } | null;
  onClose: () => void;
  onSaved: () => void;
}

type DraftTrigger =
  | (CronTrigger & { type: "cron" })
  | (ThresholdTrigger & { type: "threshold" })
  | { type: "manual" }
  | { type: "once"; runAt: number; deleteAfterRun?: boolean };

type DraftAction =
  | (NotifyAction & { type: "notify" })
  | (LLMNotifyAction & { type: "llm_notify" })
  | (ToolAction & { type: "tool" });

function defaultAction(type: "notify" | "llm_notify" | "tool"): DraftAction {
  if (type === "notify") {
    return { type: "notify", title: "Skynet", body: "Ny besked fra Skynet", priority: "default" };
  } else if (type === "llm_notify") {
    return { type: "llm_notify", prompt: "Skriv en kort dansk besked om ...", notifyTitle: "Skynet", priority: "default" };
  } else {
    return { type: "tool", tool: "read_system_status", args: {}, allowDestructive: false };
  }
}

function emptyDraft(): {
  name: string;
  description: string;
  enabled: boolean;
  trigger: DraftTrigger;
  actions: DraftAction[];
} {
  return {
    name: "",
    description: "",
    enabled: true,
    trigger: { type: "cron", expression: "0 7 * * *" },
    actions: [
      {
        type: "llm_notify",
        prompt: "Skriv en kort venlig dansk besked om dagens vejr og el-spotpris.",
        notifyTitle: "Morgenbesked",
        priority: "default",
      },
    ],
  };
}

export function AutomationEditor({ target, prefill, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<Array<{ id: string; label?: string }>>([]);
  const isEdit = target !== null && target !== "new";

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/models", { cache: "no-store" });
      const data = await res.json() as { available: boolean; models: Array<{ id: string; label?: string }> };
      if (data.available) setModels(data.models);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { if (target !== null) fetchModels(); }, [target, fetchModels]);

  useEffect(() => {
    if (target && target !== "new") {
      setDraft({
        name: target.name,
        description: target.description ?? "",
        enabled: target.enabled,
        trigger: target.trigger as DraftTrigger,
        actions: target.actions as DraftAction[],
      });
    } else if (target === "new" && prefill) {
      setDraft({
        name: prefill.name,
        description: prefill.description ?? "",
        enabled: prefill.enabled !== false,
        trigger: prefill.trigger as DraftTrigger,
        actions: prefill.actions as DraftAction[],
      });
    } else {
      setDraft(emptyDraft());
    }
    setError(null);
  }, [target, prefill]);

  if (target === null) return null;

  const save = async () => {
    setError(null);
    if (!draft.name.trim()) {
      setError("Navn er påkrævet");
      return;
    }
    if (draft.actions.length === 0) {
      setError("Mindst én action er påkrævet");
      return;
    }
    setSaving(true);
    try {
      const url = isEdit
        ? `/api/automations/${(target as Automation).id}`
        : "/api/automations";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          enabled: draft.enabled,
          trigger: draft.trigger as Trigger,
          actions: draft.actions as Action[],
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const changeTriggerType = (type: "cron" | "threshold" | "manual") => {
    if (type === "cron") {
      setDraft({ ...draft, trigger: { type: "cron", expression: "0 7 * * *" } });
    } else if (type === "threshold") {
      setDraft({
        ...draft,
        trigger: {
          type: "threshold",
          metric: "disk_percent",
          op: ">",
          value: 90,
          cooldownSec: 3600,
        },
      });
    } else {
      setDraft({ ...draft, trigger: { type: "manual" } });
    }
  };

  const updateAction = (idx: number, newAction: DraftAction) => {
    const updated = [...draft.actions];
    updated[idx] = newAction;
    setDraft({ ...draft, actions: updated });
  };

  const addStep = () => {
    setDraft({ ...draft, actions: [...draft.actions, defaultAction("notify")] });
  };

  const removeStep = (idx: number) => {
    setDraft({ ...draft, actions: draft.actions.filter((_, i) => i !== idx) });
  };

  const changeStepType = (idx: number, type: "notify" | "llm_notify" | "tool") => {
    updateAction(idx, defaultAction(type));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#0a1216] border border-cyan-400/25 rounded-2xl shadow-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-cyan-400/10 flex items-center justify-between">
          <h2 className="text-sm font-medium text-cyan-100">
            {isEdit ? `Redigér: ${(target as Automation).name}` : "Ny automation"}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-200 text-lg"
          >
            ✕
          </button>
        </header>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Navn + beskrivelse */}
          <Field label="Navn">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputCls}
              placeholder="Fx 'Morgenbriefing'"
            />
          </Field>
          <Field label="Beskrivelse (valgfri)">
            <input
              type="text"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className={inputCls}
            />
          </Field>

          {/* Trigger-sektion */}
          <section className="border-t border-cyan-400/10 pt-4">
            <Label>TRIGGER</Label>
            <div className="flex gap-2 mt-1 mb-3 flex-wrap">
              {(["cron", "threshold", "manual"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => changeTriggerType(t)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] border transition-colors ${
                    draft.trigger.type === t
                      ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                      : "border-cyan-400/15 text-neutral-400 hover:border-cyan-400/40"
                  }`}
                >
                  {t === "cron" ? "Tid (cron)" : t === "threshold" ? "Tærskel" : "Manuel"}
                </button>
              ))}
              {draft.trigger.type === "once" && (
                <span className="px-3 py-1.5 rounded-lg text-[12px] border border-amber-400/40 bg-amber-500/10 text-amber-200">
                  Engang (auto-genereret)
                </span>
              )}
            </div>

            {draft.trigger.type === "cron" && (
              <CronEditor
                expression={draft.trigger.expression}
                onChange={(expression) =>
                  setDraft({
                    ...draft,
                    trigger: { ...draft.trigger, expression } as DraftTrigger,
                  })
                }
              />
            )}

            {draft.trigger.type === "threshold" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Metric">
                  <select
                    value={draft.trigger.metric}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        trigger: { ...draft.trigger, metric: e.target.value } as DraftTrigger,
                      })
                    }
                    className={inputCls}
                  >
                    <option value="cpu">CPU (%)</option>
                    <option value="mem">RAM (%)</option>
                    <option value="disk_percent">Disk (%)</option>
                    <option value="temperature">Temperatur (°C)</option>
                    <option value="netIn">Net ind (B/s)</option>
                    <option value="netOut">Net ud (B/s)</option>
                  </select>
                </Field>
                <Field label="Sammenligning">
                  <div className="flex gap-2">
                    <select
                      value={draft.trigger.op}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          trigger: {
                            ...draft.trigger,
                            op: e.target.value as ThresholdTrigger["op"],
                          } as DraftTrigger,
                        })
                      }
                      className={`${inputCls} w-20`}
                    >
                      <option>{">"}</option>
                      <option>{">="}</option>
                      <option>{"<"}</option>
                      <option>{"<="}</option>
                      <option>{"=="}</option>
                    </select>
                    <input
                      type="number"
                      value={draft.trigger.value}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          trigger: {
                            ...draft.trigger,
                            value: Number(e.target.value),
                          } as DraftTrigger,
                        })
                      }
                      className={`${inputCls} flex-1`}
                    />
                  </div>
                </Field>
                <Field label="Cooldown (sek)">
                  <input
                    type="number"
                    value={draft.trigger.cooldownSec ?? 3600}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        trigger: {
                          ...draft.trigger,
                          cooldownSec: Number(e.target.value),
                        } as DraftTrigger,
                      })
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Sustain (sek, valgfri)">
                  <input
                    type="number"
                    value={draft.trigger.sustainSec ?? 0}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        trigger: {
                          ...draft.trigger,
                          sustainSec: Number(e.target.value) || undefined,
                        } as DraftTrigger,
                      })
                    }
                    className={inputCls}
                  />
                </Field>
              </div>
            )}

            {draft.trigger.type === "manual" && (
              <div className="text-[12px] text-neutral-500">
                Kører kun når du trykker &quot;kør&quot; manuelt.
              </div>
            )}

            {draft.trigger.type === "once" && (
              <div className="text-[12px] text-amber-200/80 bg-amber-500/5 border border-amber-400/20 rounded-lg px-3 py-2 leading-relaxed">
                One-off reminder oprettet af AI · sendes{" "}
                <strong className="text-amber-100">
                  {new Date(draft.trigger.runAt).toLocaleString("da-DK", {
                    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </strong>{" "}
                og slettes automatisk efter kørsel. Skift til cron/threshold/manuel hvis du vil ændre denne adfærd.
              </div>
            )}
          </section>

          {/* Multi-action kæde */}
          <section className="border-t border-cyan-400/10 pt-4">
            <div className="flex items-center justify-between mb-3">
              <Label>
                ACTIONS
                {draft.actions.length > 1 && (
                  <span className="ml-2 text-neutral-500 normal-case text-[10px]">
                    — {draft.actions.length} trin køres sekventielt
                  </span>
                )}
              </Label>
              <button
                onClick={addStep}
                className="text-[11px] text-cyan-400/70 hover:text-cyan-300 border border-cyan-400/20 rounded px-2 py-0.5 hover:border-cyan-400/40 transition-colors"
              >
                + Tilføj trin
              </button>
            </div>

            <div className="space-y-4">
              {draft.actions.map((action, idx) => (
                <div
                  key={idx}
                  className="border border-cyan-400/10 rounded-lg p-3 bg-black/20"
                >
                  {/* Step header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-cyan-400/50 font-mono uppercase tracking-widest">
                      {draft.actions.length > 1 ? `Trin ${idx + 1} / ${draft.actions.length}` : "Action"}
                    </span>
                    {draft.actions.length > 1 && (
                      <button
                        onClick={() => removeStep(idx)}
                        className="text-[11px] text-neutral-600 hover:text-rose-400 transition-colors"
                      >
                        ✕ fjern
                      </button>
                    )}
                  </div>

                  {/* Type picker */}
                  <div className="flex gap-2 mb-3">
                    {(["notify", "llm_notify", "tool"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => changeStepType(idx, t)}
                        className={`px-3 py-1.5 rounded-lg text-[12px] border transition-colors ${
                          action.type === t
                            ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                            : "border-cyan-400/15 text-neutral-400 hover:border-cyan-400/40"
                        }`}
                      >
                        {t === "notify"
                          ? "Simpel besked"
                          : t === "llm_notify"
                            ? "LLM-genereret besked"
                            : "Kør tool"}
                      </button>
                    ))}
                  </div>

                  {/* Action-specifikke felter */}
                  <ActionFields
                    action={action}
                    trigger={draft.trigger}
                    models={models}
                    onChange={(newAction) => updateAction(idx, newAction)}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Enabled toggle */}
          <section className="border-t border-cyan-400/10 pt-4">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                className="accent-cyan-400 w-4 h-4"
              />
              <span className="text-neutral-200">Aktiveret</span>
            </label>
          </section>

          {error && (
            <div className="text-[12px] text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-cyan-400/10 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[13px] text-neutral-400 hover:text-neutral-200"
          >
            Annullér
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg text-[13px] bg-cyan-500/20 border border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-40"
          >
            {saving ? "gemmer…" : isEdit ? "Gem ændringer" : "Opret"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Cron-editor med live feedback ────────────────────────────────────────────

const CRON_PRESETS: Array<{ label: string; expr: string }> = [
  { label: "07:00 hverdag", expr: "0 7 * * 1-5" },
  { label: "07:00 hver dag", expr: "0 7 * * *" },
  { label: "Hver 15. min", expr: "*/15 * * * *" },
  { label: "Hver time", expr: "0 * * * *" },
  { label: "Søndag 22:00", expr: "0 22 * * 0" },
  { label: "1. i måneden 09:00", expr: "0 9 1 * *" },
];

function CronEditor({
  expression,
  onChange,
}: {
  expression: string;
  onChange: (expr: string) => void;
}) {
  const info = useMemo(() => inspectCron(expression), [expression]);
  return (
    <div className="space-y-2">
      <Field label="Cron-expression">
        <input
          type="text"
          value={expression}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} font-mono ${
            info.valid
              ? "border-emerald-400/40"
              : "border-rose-500/40"
          }`}
          placeholder="0 7 * * *"
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {CRON_PRESETS.map((p) => (
          <button
            key={p.expr}
            onClick={() => onChange(p.expr)}
            className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
              expression.trim() === p.expr
                ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                : "border-cyan-400/15 text-neutral-400 hover:border-cyan-400/40"
            }`}
            title={p.expr}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div
        className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
          info.valid
            ? "border-emerald-400/20 bg-emerald-500/5"
            : "border-rose-500/30 bg-rose-950/20"
        }`}
      >
        {info.valid ? (
          <>
            <div className="text-emerald-200 mb-1">
              ✓ {info.description}
            </div>
            <div className="text-neutral-500 font-mono">
              <span className="text-neutral-600">næste 3 kørsler · </span>
              {info.nextRuns?.map((ts, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-neutral-700"> · </span>}
                  <span className="text-neutral-300">{relativeFromNow(ts)}</span>
                  <span className="text-neutral-600">
                    {" "}
                    ({new Date(ts).toLocaleString("da-DK", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })})
                  </span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="text-rose-300">
            ✗ {info.error ?? "ugyldig"}
            <span className="text-neutral-500 ml-2 font-mono">
              format: min time dag måned uge — fx &quot;0 7 * * *&quot;
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Action-fields komponent ──────────────────────────────────────────────────

function ActionFields({
  action,
  trigger,
  models,
  onChange,
}: {
  action: DraftAction;
  trigger: DraftTrigger;
  models: Array<{ id: string; label?: string }>;
  onChange: (a: DraftAction) => void;
}) {
  if (action.type === "notify") {
    return (
      <div className="space-y-2">
        <Field label="Titel">
          <input
            type="text"
            value={action.title}
            onChange={(e) => onChange({ ...action, title: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Besked">
          <textarea
            value={action.body}
            onChange={(e) => onChange({ ...action, body: e.target.value })}
            rows={3}
            className={inputCls}
          />
        </Field>
        <PriorityPicker
          value={action.priority ?? "default"}
          onChange={(p) => onChange({ ...action, priority: p })}
        />
        {trigger.type === "threshold" && (
          <div className="text-[11px] text-neutral-500 bg-cyan-400/5 rounded px-2 py-1.5 border border-cyan-400/10">
            Tip: brug {"{metric}"}, {"{value}"}, {"{threshold}"} og {"{op}"} i
            titel/besked — fx &quot;Disk fuld ({"{value}"}%)&quot;.
          </div>
        )}
      </div>
    );
  }

  if (action.type === "llm_notify") {
    return (
      <div className="space-y-2">
        <Field label="Notifikations-titel">
          <input
            type="text"
            value={action.notifyTitle}
            onChange={(e) => onChange({ ...action, notifyTitle: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Prompt til LLM">
          <textarea
            value={action.prompt}
            onChange={(e) => onChange({ ...action, prompt: e.target.value })}
            rows={6}
            className={`${inputCls} font-mono text-[12px]`}
            placeholder="Fortæl LLM'en hvad den skal skrive. Hold det kort — output pushes som notifikation."
          />
        </Field>
        <Field label="Model">
          {models.length > 0 ? (
            <select
              value={action.model ?? ""}
              onChange={(e) => onChange({ ...action, model: e.target.value || undefined })}
              className={`${inputCls} font-mono text-[12px]`}
            >
              <option value="">— første tilgængelige —</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label ? `${m.label} · ${m.id.split("/").pop()}` : m.id.split("/").pop()}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-[11px] text-neutral-500 py-1">
              LM Studio ikke tilgængeligt — gem alligevel, modellen vælges automatisk
            </div>
          )}
        </Field>
        <label className="flex items-center gap-2 text-[12px] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={action.useTools !== false}
            onChange={(e) => onChange({ ...action, useTools: e.target.checked })}
            className="accent-cyan-400"
          />
          <span className="text-neutral-300">Aktivér tools</span>
          <span className="text-neutral-500 text-[11px]">
            (web_fetch, web_search, system, vejr, energi, kalender…)
          </span>
        </label>
        <PriorityPicker
          value={action.priority ?? "default"}
          onChange={(p) => onChange({ ...action, priority: p })}
        />
        <Field label="Send som iMessage til (valgfri)">
          <input
            type="text"
            value={action.imessageTo ?? ""}
            onChange={(e) => onChange({ ...action, imessageTo: e.target.value || undefined })}
            className={inputCls}
            placeholder="+4512345678 eller navn@icloud.com (tom = kun push)"
          />
          <div className="text-[11px] text-neutral-600 mt-1">
            8-cifret DK-nummer normaliseres automatisk til +45-format
          </div>
        </Field>
        <div className="text-[11px] text-neutral-500 bg-cyan-400/5 rounded px-3 py-2 border border-cyan-400/10 leading-relaxed">
          <strong className="text-cyan-300">Med tools aktiveret</strong> kan LLM&apos;en
          søge på nettet, hente nyheder (fetch_news), tjekke vejr, el-pris, system-status mm.
          <br />
          <span className="text-neutral-600">
            Tip: &quot;Hent danske nyheder fra DR og skriv en kort morgenbriefing på dansk.&quot;
          </span>
        </div>
      </div>
    );
  }

  if (action.type === "tool") {
    return (
      <div className="space-y-2">
        <Field label="Tool-navn">
          <select
            value={action.tool}
            onChange={(e) => onChange({ ...action, tool: e.target.value })}
            className={inputCls}
          >
            <optgroup label="Beskeder">
              <option value="send_imessage">send_imessage</option>
            </optgroup>
            <optgroup label="Services & Apps">
              <option value="list_services">list_services</option>
              <option value="control_service">control_service</option>
              <option value="list_apps">list_apps</option>
              <option value="control_app">control_app</option>
            </optgroup>
            <optgroup label="System">
              <option value="read_system_status">read_system_status</option>
              <option value="read_disk">read_disk</option>
              <option value="read_weather">read_weather</option>
              <option value="read_energy">read_energy</option>
              <option value="run_discovery">run_discovery</option>
            </optgroup>
            <optgroup label="Web & Nyheder">
              <option value="fetch_news">fetch_news</option>
              <option value="web_fetch">web_fetch</option>
              <option value="web_search">web_search</option>
            </optgroup>
            <optgroup label="Kalender & Påmindelser">
              <option value="list_calendar_events">list_calendar_events</option>
              <option value="list_reminders">list_reminders</option>
              <option value="add_reminder">add_reminder</option>
            </optgroup>
          </select>
        </Field>
        <Field label="Argumenter (JSON)">
          <textarea
            value={JSON.stringify(action.args, null, 2)}
            onChange={(e) => {
              try {
                const args = JSON.parse(e.target.value);
                onChange({ ...action, args });
              } catch {
                // ignore — ugyldig JSON, lad brugeren skrive færdigt
              }
            }}
            rows={4}
            className={`${inputCls} font-mono text-[12px]`}
            placeholder='{"label":"com.tailscale.tailscaled","action":"start"}'
          />
        </Field>
        <label className="flex items-center gap-2 text-[12px] text-amber-300">
          <input
            type="checkbox"
            checked={action.allowDestructive === true}
            onChange={(e) => onChange({ ...action, allowDestructive: e.target.checked })}
            className="accent-amber-400"
          />
          Tillad destruktive actions (stop, restart, quit)
        </label>
      </div>
    );
  }

  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const inputCls =
  "w-full bg-black/40 border border-cyan-400/20 rounded-lg px-3 py-1.5 text-[13px] text-neutral-100 focus:outline-none focus:border-cyan-400/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-mono mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-400/80 font-mono">
      {children}
    </div>
  );
}

function PriorityPicker({
  value,
  onChange,
}: {
  value: "low" | "default" | "high";
  onChange: (v: "low" | "default" | "high") => void;
}) {
  return (
    <Field label="Prioritet">
      <div className="flex gap-2">
        {(["low", "default", "high"] as const).map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`px-3 py-1.5 rounded-lg text-[12px] border transition-colors ${
              value === p
                ? p === "high"
                  ? "border-rose-400/50 bg-rose-500/15 text-rose-200"
                  : p === "low"
                    ? "border-neutral-400/40 bg-neutral-700/20 text-neutral-300"
                    : "border-cyan-400/50 bg-cyan-400/15 text-cyan-100"
                : "border-neutral-500/20 text-neutral-400 hover:border-cyan-400/40"
            }`}
          >
            {p === "low" ? "lav" : p === "default" ? "normal" : "høj"}
          </button>
        ))}
      </div>
    </Field>
  );
}
