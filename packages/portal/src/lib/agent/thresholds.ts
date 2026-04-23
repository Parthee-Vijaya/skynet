/**
 * Threshold-evaluator — evaluerer threshold-triggers mod aktuelle metric-
 * værdier. Kaldes fra sparkline-collector efter hver tick.
 *
 * Features:
 *   - Cooldown (hysterese) per automation for at undgå spam
 *   - Sustain (betingelse skal være sand i N sekunder) via in-memory
 *     first-seen timestamp
 *   - Understøtter alle metric-navne collectors skriver — fx cpu, mem, disk,
 *     temp, netIn, netOut samt ad-hoc felter fra custom checks
 */

import { listAutomations, recordRun } from "./automations";
import { runAction } from "./actions";
import type { ThresholdTrigger } from "./types";

interface TriggerState {
  /** Hvornår blev betingelsen først opfyldt? (for sustain) */
  firstSeenAt?: number;
  /** Hvornår triggede den sidst? (for cooldown) */
  lastTriggeredAt?: number;
}

const state = new Map<number, TriggerState>();

/**
 * Evaluér alle enabled threshold-triggers mod en snapshot af metrics.
 * Kaldes fra sparkline-collector efter write.
 */
export async function evaluateThresholds(
  metrics: Record<string, number>
): Promise<void> {
  const automations = listAutomations();
  const now = Date.now();

  for (const a of automations) {
    if (!a.enabled) continue;
    if (a.trigger.type !== "threshold") continue;

    const t = a.trigger;
    const value = metrics[t.metric];
    if (value == null || !Number.isFinite(value)) continue;

    const conditionMet = compare(value, t.op, t.value);
    const cooldownMs = (t.cooldownSec ?? 3600) * 1000;
    const sustainMs = (t.sustainSec ?? 0) * 1000;
    const st = state.get(a.id) ?? {};

    if (!conditionMet) {
      // Reset first-seen når betingelse ikke er opfyldt
      if (st.firstSeenAt != null) {
        st.firstSeenAt = undefined;
        state.set(a.id, st);
      }
      continue;
    }

    // Betingelse opfyldt — registrér første gang
    if (st.firstSeenAt == null) {
      st.firstSeenAt = now;
      state.set(a.id, st);
    }

    // Sustain check
    if (now - st.firstSeenAt < sustainMs) continue;

    // Cooldown check
    if (st.lastTriggeredAt != null && now - st.lastTriggeredAt < cooldownMs) {
      continue;
    }

    // Trigger!
    st.lastTriggeredAt = now;
    state.set(a.id, st);

    try {
      const result = await runAction(
        interpolateAction(a.action, t, value)
      );
      recordRun(
        a.id,
        result.ok ? "ok" : "error",
        `threshold ${t.metric}=${value} ${t.op} ${t.value} · ${result.message}`
      );
    } catch (e) {
      recordRun(a.id, "error", e instanceof Error ? e.message : String(e));
    }
  }
}

function compare(a: number, op: ThresholdTrigger["op"], b: number): boolean {
  switch (op) {
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case "==":
      return a === b;
    default:
      return false;
  }
}

/**
 * Substituér {metric}, {value}, {threshold} i notify-actions så beskeden kan
 * inkludere den aktuelle værdi. Ikke-string properties ændres ikke.
 */
function interpolateAction(
  action: ReturnType<typeof listAutomations>[number]["action"],
  trigger: ThresholdTrigger,
  currentValue: number
): ReturnType<typeof listAutomations>[number]["action"] {
  const vars: Record<string, string> = {
    metric: trigger.metric,
    value: formatValue(currentValue),
    threshold: String(trigger.value),
    op: trigger.op,
  };

  const sub = (s: string): string =>
    s.replace(/\{(metric|value|threshold|op)\}/g, (_, k: string) => vars[k] ?? "");

  if (action.type === "notify") {
    return { ...action, title: sub(action.title), body: sub(action.body) };
  }
  if (action.type === "llm_notify") {
    return {
      ...action,
      prompt: sub(action.prompt),
      notifyTitle: sub(action.notifyTitle),
    };
  }
  return action;
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
