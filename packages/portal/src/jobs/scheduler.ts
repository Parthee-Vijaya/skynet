/**
 * Scheduler — læser automations-tabellen og registrerer cron-jobs.
 *
 * Bootes fra instrumentation.ts. Lytter på reload-signal så UI kan bede om
 * re-registrering efter CRUD.
 */

import cron, { type ScheduledTask } from "node-cron";
import type { Automation } from "@/lib/agent/types";
import { listAutomations, recordRun, deleteAutomation } from "@/lib/agent/automations";
import { runActions } from "@/lib/agent/actions";
import { appendLog } from "@/lib/agent/log-buffer";

interface RegisteredJob {
  automationId: number;
  expression: string;
  task: ScheduledTask;
}

interface OnceJob {
  automationId: number;
  runAt: number;
  timeout: NodeJS.Timeout;
}

const jobs = new Map<number, RegisteredJob>();
const onceJobs = new Map<number, OnceJob>();
let started = false;

/**
 * Registrér alle enabled cron-triggers fra DB. Kan kaldes igen efter CRUD for
 * at reloade.
 */
export function reloadScheduler(): { active: number; total: number } {
  // Stop alle eksisterende jobs først
  for (const job of jobs.values()) {
    try {
      job.task.stop();
    } catch {
      /* noop */
    }
  }
  jobs.clear();
  for (const oj of onceJobs.values()) clearTimeout(oj.timeout);
  onceJobs.clear();

  const all = listAutomations();
  let active = 0;

  for (const a of all) {
    if (!a.enabled) continue;

    if (a.trigger.type === "cron") {
      if (!cron.validate(a.trigger.expression)) {
        console.warn(
          `[scheduler] automation ${a.id} (${a.name}) har ugyldig cron: ${a.trigger.expression}`
        );
        continue;
      }

      const task = cron.schedule(
        a.trigger.expression,
        () => {
          executeAutomation(a).catch((e) => {
            console.error(`[scheduler] automation ${a.id} fejl`, e);
          });
        },
        {
          timezone: a.trigger.type === "cron" ? a.trigger.tz : undefined,
        }
      );

      jobs.set(a.id, {
        automationId: a.id,
        expression: a.trigger.expression,
        task,
      });
      active++;
    } else if (a.trigger.type === "once") {
      const delay = a.trigger.runAt - Date.now();
      if (delay <= 0) {
        // Tidspunktet er passeret — kør nu hvis vi ikke allerede har kørt
        if (!a.lastRunAt || a.lastRunAt < a.trigger.runAt) {
          executeOnce(a).catch((e) => console.error(`[scheduler] once ${a.id} fejl`, e));
        }
        continue;
      }
      // setTimeout har 32-bit signed max ≈ 24 dage — clamp til 24t og re-load hvis vi clampede
      const MAX_DELAY = 24 * 60 * 60 * 1000;
      const safeDelay = Math.min(delay, MAX_DELAY);
      const willClamp = delay > MAX_DELAY;
      const timeout = setTimeout(() => {
        if (willClamp) {
          // Tidspunktet er endnu længere ude → re-load for at sætte ny timer
          reloadScheduler();
        } else {
          executeOnce(a).catch((e) => console.error(`[scheduler] once ${a.id} fejl`, e));
        }
      }, safeDelay);
      onceJobs.set(a.id, { automationId: a.id, runAt: a.trigger.runAt, timeout });
      active++;
    }
  }

  console.log(`[scheduler] ${active}/${all.length} automations aktive (cron: ${jobs.size}, once: ${onceJobs.size})`);
  return { active, total: all.length };
}

async function executeOnce(a: Automation): Promise<void> {
  await executeAutomation(a);
  if (a.trigger.type === "once" && a.trigger.deleteAfterRun !== false) {
    deleteAutomation(a.id);
    appendLog("info", `'${a.name}' slettet efter one-off kørsel`, { automationId: a.id, automationName: a.name });
  }
  onceJobs.delete(a.id);
}

async function executeAutomation(a: Automation): Promise<void> {
  const meta = { automationId: a.id, automationName: a.name };
  appendLog("info", `starter automation '${a.name}'`, meta);
  console.log(`[scheduler] kører '${a.name}' (id=${a.id})`);
  const result = await runActions(a.actions, meta);
  recordRun(a.id, result.ok ? "ok" : "error", result.message);
  appendLog(result.ok ? "ok" : "error", `'${a.name}' → ${result.message}`, meta);
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  reloadScheduler();
}

export function listActiveJobs(): Array<{ id: number; expression: string }> {
  return Array.from(jobs.values()).map((j) => ({
    id: j.automationId,
    expression: j.expression,
  }));
}

/** Kør en automation-action manuelt (fx "test trigger"-knap i UI) */
export async function runAutomationManually(
  automationId: number,
  opts?: { dryRun?: boolean },
): Promise<{
  ok: boolean;
  message: string;
  dryRunPreview?: import("@/lib/agent/actions").DryRunStep[];
}> {
  const all = listAutomations();
  const a = all.find((x) => x.id === automationId);
  if (!a) return { ok: false, message: "automation findes ikke" };
  const meta = { automationId: a.id, automationName: a.name, dryRun: opts?.dryRun === true };
  appendLog("info", `manuel kørsel af '${a.name}'${opts?.dryRun ? " [dry-run]" : ""}`, meta);
  const result = await runActions(a.actions, meta);
  if (!opts?.dryRun) {
    recordRun(a.id, result.ok ? "ok" : "error", result.message);
  }
  appendLog(result.ok ? "ok" : "error", `'${a.name}' → ${result.message}`, meta);
  return result;
}
