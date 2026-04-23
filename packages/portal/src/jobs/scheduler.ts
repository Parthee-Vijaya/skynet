/**
 * Scheduler — læser automations-tabellen og registrerer cron-jobs.
 *
 * Bootes fra instrumentation.ts. Lytter på reload-signal så UI kan bede om
 * re-registrering efter CRUD.
 */

import cron, { type ScheduledTask } from "node-cron";
import type { Automation } from "@/lib/agent/types";
import { listAutomations, recordRun } from "@/lib/agent/automations";
import { runAction } from "@/lib/agent/actions";

interface RegisteredJob {
  automationId: number;
  expression: string;
  task: ScheduledTask;
}

const jobs = new Map<number, RegisteredJob>();
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

  const all = listAutomations();
  let active = 0;

  for (const a of all) {
    if (!a.enabled) continue;
    if (a.trigger.type !== "cron") continue;
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
  }

  console.log(`[scheduler] ${active}/${all.length} automations aktive`);
  return { active, total: all.length };
}

async function executeAutomation(a: Automation): Promise<void> {
  console.log(`[scheduler] kører '${a.name}' (id=${a.id})`);
  const result = await runAction(a.action);
  recordRun(a.id, result.ok ? "ok" : "error", result.message);
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
export async function runAutomationManually(automationId: number): Promise<{
  ok: boolean;
  message: string;
}> {
  const all = listAutomations();
  const a = all.find((x) => x.id === automationId);
  if (!a) return { ok: false, message: "automation findes ikke" };
  const result = await runAction(a.action);
  recordRun(a.id, result.ok ? "ok" : "error", result.message);
  return result;
}
