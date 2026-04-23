/**
 * Typer til automation-systemet (triggers + actions).
 *
 * En automation = trigger + action. Kør periodisk (cron), baseret på tærskler,
 * eller manuelt. Action kan være en notifikation, et tool-kald, eller en
 * LLM-genereret besked.
 */

// ── Triggers ────────────────────────────────────────────────────────────────

export type TriggerType = "cron" | "threshold" | "manual";

export interface CronTrigger {
  type: "cron";
  /** Standard cron-expression, fx "0 7 * * *" for kl 07:00 hver dag */
  expression: string;
  /** Timezone (default: system) */
  tz?: string;
}

export interface ThresholdTrigger {
  type: "threshold";
  /** Metric-navn — skal matche en collector: cpu, ram, disk, temp, energy_price osv. */
  metric: string;
  /** Sammenligning */
  op: ">" | ">=" | "<" | "<=" | "==";
  value: number;
  /** Minimum antal sekunder mellem re-triggers (hysterese). Default 3600 = 1t */
  cooldownSec?: number;
  /** Valgfri: kræv at betingelsen har været sand i N sekunder før trigger */
  sustainSec?: number;
}

export interface ManualTrigger {
  type: "manual";
}

export type Trigger = CronTrigger | ThresholdTrigger | ManualTrigger;

// ── Actions ─────────────────────────────────────────────────────────────────

export type ActionType = "notify" | "tool" | "llm_notify";

export interface NotifyAction {
  type: "notify";
  title: string;
  body: string;
  priority?: "low" | "default" | "high";
  tag?: string;
  url?: string;
}

export interface ToolAction {
  type: "tool";
  /** Tool-navn fra TOOLS i lib/agent/tools.ts */
  tool: string;
  /** Argumenter til tool-kaldet */
  args: Record<string, unknown>;
  /** Tillad destruktive actions (kun ved manuel bekræftelse) */
  allowDestructive?: boolean;
}

/**
 * Kør LLM med en prompt der får adgang til data-sources via tools, og send
 * resultatet som notifikation. Bruges til briefings, smart alerts osv.
 */
export interface LLMNotifyAction {
  type: "llm_notify";
  /** Model-id der skal bruges (fx "mistralai/mistral-small-3.2") */
  model?: string;
  /** User-prompt til LLM */
  prompt: string;
  /** Ekstra system-prompt (valgfri) */
  systemPrompt?: string;
  /** Titel til notifikation */
  notifyTitle: string;
  priority?: "low" | "default" | "high";
}

export type Action = NotifyAction | ToolAction | LLMNotifyAction;

// ── Automation record ───────────────────────────────────────────────────────

export interface Automation {
  id: number;
  name: string;
  description?: string;
  trigger: Trigger;
  action: Action;
  enabled: boolean;
  lastRunAt?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationRow {
  id: number;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: string;
  action_type: string;
  action_config: string;
  enabled: number;
  last_run_at: number | null;
  last_status: string | null;
  last_message: string | null;
  created_at: number;
  updated_at: number;
}

export interface AutomationRun {
  id: number;
  automationId: number;
  startedAt: number;
  endedAt?: number;
  status: "ok" | "error" | "skipped";
  message?: string;
}
