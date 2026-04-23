/**
 * macOS Reminders-integration via osascript.
 *
 * Læser og opretter påmindelser i Reminders.app. Ingen OAuth — bruger
 * systemets adgang direkte. Første kald kræver at brugeren giver Reminders-
 * tilgang til Terminal/Node (TCC-prompt).
 */

import { spawn } from "node:child_process";

/** Kør AppleScript via stdin (robust mod shell-escape og Unicode). */
function runOsaScript(script: string, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/osascript", [], { timeout: timeoutMs });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => stdout.push(c));
    child.stderr.on("data", (c: Buffer) => stderr.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
      } else {
        reject(
          new Error(
            `osascript exit ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`
          )
        );
      }
    });
    child.stdin.write(script);
    child.stdin.end();
  });
}

export interface Reminder {
  id: string;
  list: string;
  title: string;
  completed: boolean;
  dueDate?: string; // ISO 8601
  body?: string;
  priority: number; // 0=none, 1=low, 5=medium, 9=high
}

/**
 * List påmindelser. Default: kun ikke-afsluttede fra alle lister.
 *
 * @param options.list valgfri: kun denne liste
 * @param options.includeCompleted inkludér afsluttede (default: false)
 * @param options.limit max antal (default: 100)
 */
export async function listReminders(
  options: { list?: string; includeCompleted?: boolean; limit?: number } = {}
): Promise<Reminder[]> {
  const { list, includeCompleted = false, limit = 100 } = options;

  const listClause = list
    ? `set targetLists to {list "${escapeAS(list)}"}`
    : `set targetLists to lists`;

  const completedFilter = includeCompleted
    ? "every reminder of lst"
    : "reminders of lst whose completed is false";

  const script = `
    set output to ""
    set count to 0
    tell application "Reminders"
      ${listClause}
      repeat with lst in targetLists
        set lstName to name of lst
        try
          set rems to ${completedFilter}
          repeat with rem in rems
            if count ≥ ${limit} then exit repeat
            set rid to id of rem
            set rtitle to name of rem
            set rcompleted to completed of rem
            set rprio to priority of rem
            set rdue to ""
            try
              set rdue to (due date of rem as string)
            end try
            set rbody to ""
            try
              set rbody to body of rem
            end try
            set output to output & lstName & tab & rid & tab & rtitle & tab & (rcompleted as string) & tab & rprio & tab & rdue & tab & rbody & linefeed
            set count to count + 1
          end repeat
        end try
        if count ≥ ${limit} then exit repeat
      end repeat
    end tell
    return output
  `;

  const stdout = await runOsaScript(script, 30_000);
  return parseReminderLines(stdout);
}

/** Opret en ny påmindelse. */
export async function addReminder(params: {
  title: string;
  list?: string;
  dueDate?: string; // ISO 8601
  body?: string;
  priority?: number;
}): Promise<{ ok: boolean; id?: string; message: string }> {
  const { title, list, dueDate, body, priority = 0 } = params;
  if (!title.trim()) return { ok: false, message: "title mangler" };

  const escTitle = escapeAS(title);
  const listClause = list
    ? `set targetList to list "${escapeAS(list)}"`
    : `set targetList to default list`;

  let datePrelude = "";
  let dueClause = "";
  if (dueDate) {
    const d = new Date(dueDate);
    if (!isNaN(d.getTime())) {
      // Pre-beregn dato-komponenter i JS og inliner dem som AppleScript-literals
      datePrelude = `
    set dueDateVar to current date
    set year of dueDateVar to ${d.getFullYear()}
    set month of dueDateVar to ${d.getMonth() + 1}
    set day of dueDateVar to ${d.getDate()}
    set hours of dueDateVar to ${d.getHours()}
    set minutes of dueDateVar to ${d.getMinutes()}
    set seconds of dueDateVar to 0`;
      dueClause = `, due date:dueDateVar`;
    }
  }

  let bodyClause = "";
  if (body) {
    bodyClause = `, body:"${escapeAS(body)}"`;
  }

  const prioClause = priority > 0 ? `, priority:${priority}` : "";

  const script = `
    ${datePrelude}
    tell application "Reminders"
      ${listClause}
      set newRem to make new reminder at targetList with properties {name:"${escTitle}"${dueClause}${bodyClause}${prioClause}}
      return id of newRem
    end tell
  `;

  try {
    const stdout = await runOsaScript(script, 15_000);
    const id = stdout.trim();
    return { ok: true, id, message: `Oprettet: ${title}` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Markér en påmindelse som afsluttet. */
export async function completeReminder(
  id: string
): Promise<{ ok: boolean; message: string }> {
  if (!id) return { ok: false, message: "id mangler" };
  const script = `
    tell application "Reminders"
      set rem to (first reminder whose id is "${escapeAS(id)}")
      set completed of rem to true
    end tell
    return "ok"
  `;
  try {
    await runOsaScript(script, 10_000);
    return { ok: true, message: "Markeret som afsluttet" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** List alle lister. */
export async function listReminderLists(): Promise<string[]> {
  const script = `tell application "Reminders" to return name of lists`;
  try {
    const stdout = await runOsaScript(script, 10_000);
    return stdout
      .trim()
      .split(", ")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function escapeAS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseReminderLines(raw: string): Reminder[] {
  const reminders: Reminder[] = [];
  const lines = raw.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 5) continue;
    const [list, id, title, completed, priority, due, body] = parts;
    let dueISO: string | undefined;
    if (due && due.trim()) {
      const d = parseASDate(due);
      if (d) dueISO = d.toISOString();
    }
    reminders.push({
      id: id || "",
      list: list || "",
      title: title || "(uden titel)",
      completed: completed === "true",
      priority: parseInt(priority) || 0,
      dueDate: dueISO,
      body: body || undefined,
    });
  }
  // Sortér: først uafsluttede med dueDate, så uafsluttede uden, så afsluttede
  reminders.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return 0;
  });
  return reminders;
}

function parseASDate(s: string): Date | null {
  if (!s) return null;
  const str = s.trim();

  const daMatch = str.match(
    /(\d{1,2})\.\s*(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\s+(\d{4})\s+kl\.\s+(\d{1,2})[.:](\d{2})[.:](\d{2})/i
  );
  if (daMatch) {
    const [, day, monthName, year, hour, minute, second] = daMatch;
    const monthMap: Record<string, number> = {
      januar: 0, februar: 1, marts: 2, april: 3, maj: 4, juni: 5,
      juli: 6, august: 7, september: 8, oktober: 9, november: 10, december: 11,
    };
    const month = monthMap[monthName.toLowerCase()];
    if (month !== undefined) {
      return new Date(
        parseInt(year), month, parseInt(day),
        parseInt(hour), parseInt(minute), parseInt(second)
      );
    }
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return null;
}
