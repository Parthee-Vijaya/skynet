/**
 * Repository til automation-records. Wrapper om SQLite-tabellen.
 */

import { getDb } from "../db";
import type {
  Automation,
  AutomationRow,
  AutomationRun,
  Action,
  Trigger,
} from "./types";

function rowToAutomation(r: AutomationRow): Automation {
  let trigger: Trigger;
  let action: Action;
  try {
    trigger = JSON.parse(r.trigger_config) as Trigger;
  } catch {
    trigger = { type: "manual" };
  }
  try {
    action = JSON.parse(r.action_config) as Action;
  } catch {
    action = { type: "notify", title: "Invalid action", body: r.action_config };
  }
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    trigger,
    action,
    enabled: r.enabled === 1,
    lastRunAt: r.last_run_at ?? undefined,
    lastStatus: (r.last_status as Automation["lastStatus"]) ?? undefined,
    lastMessage: r.last_message ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listAutomations(): Automation[] {
  const rows = getDb()
    .prepare("SELECT * FROM automations ORDER BY enabled DESC, name ASC")
    .all() as AutomationRow[];
  return rows.map(rowToAutomation);
}

export function getAutomation(id: number): Automation | null {
  const row = getDb()
    .prepare("SELECT * FROM automations WHERE id = ?")
    .get(id) as AutomationRow | undefined;
  return row ? rowToAutomation(row) : null;
}

export interface CreateAutomationInput {
  name: string;
  description?: string;
  trigger: Trigger;
  action: Action;
  enabled?: boolean;
}

export function createAutomation(input: CreateAutomationInput): Automation {
  const now = Date.now();
  const stmt = getDb().prepare(
    `INSERT INTO automations
       (name, description, trigger_type, trigger_config, action_type, action_config, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    input.name,
    input.description ?? null,
    input.trigger.type,
    JSON.stringify(input.trigger),
    input.action.type,
    JSON.stringify(input.action),
    input.enabled === false ? 0 : 1,
    now,
    now
  );
  const id = Number(info.lastInsertRowid);
  const created = getAutomation(id);
  if (!created) throw new Error("kunne ikke læse nyoprettet automation");
  return created;
}

export interface UpdateAutomationInput {
  name?: string;
  description?: string;
  trigger?: Trigger;
  action?: Action;
  enabled?: boolean;
}

export function updateAutomation(
  id: number,
  input: UpdateAutomationInput
): Automation | null {
  const existing = getAutomation(id);
  if (!existing) return null;

  const merged = {
    name: input.name ?? existing.name,
    description: input.description ?? existing.description ?? null,
    trigger: input.trigger ?? existing.trigger,
    action: input.action ?? existing.action,
    enabled: input.enabled ?? existing.enabled,
  };

  getDb()
    .prepare(
      `UPDATE automations
         SET name = ?, description = ?, trigger_type = ?, trigger_config = ?,
             action_type = ?, action_config = ?, enabled = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      merged.name,
      merged.description,
      merged.trigger.type,
      JSON.stringify(merged.trigger),
      merged.action.type,
      JSON.stringify(merged.action),
      merged.enabled ? 1 : 0,
      Date.now(),
      id
    );
  return getAutomation(id);
}

export function deleteAutomation(id: number): boolean {
  const info = getDb().prepare("DELETE FROM automations WHERE id = ?").run(id);
  return info.changes > 0;
}

export function recordRun(
  automationId: number,
  status: "ok" | "error" | "skipped",
  message?: string
): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO automation_runs (automation_id, started_at, ended_at, status, message)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(automationId, now, now, status, message ?? null);
  getDb()
    .prepare(
      `UPDATE automations
         SET last_run_at = ?, last_status = ?, last_message = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(now, status, message ?? null, now, automationId);
}

export function listRuns(automationId: number, limit = 25): AutomationRun[] {
  const rows = getDb()
    .prepare(
      `SELECT id, automation_id, started_at, ended_at, status, message
         FROM automation_runs
         WHERE automation_id = ?
         ORDER BY started_at DESC
         LIMIT ?`
    )
    .all(automationId, limit) as Array<{
    id: number;
    automation_id: number;
    started_at: number;
    ended_at: number | null;
    status: string;
    message: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    automationId: r.automation_id,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? undefined,
    status: r.status as AutomationRun["status"],
    message: r.message ?? undefined,
  }));
}
