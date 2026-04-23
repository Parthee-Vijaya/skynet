/**
 * macOS Calendar-integration via osascript.
 *
 * Læser events fra Calendar.app. Ingen OAuth — bruger systemets kalender-
 * adgang direkte. Brugeren skal give Calendar-tilgang til Terminal/Node
 * første gang (TCC-prompt).
 *
 * Bemærk: osascript mod Calendar kan være langsom (~1-3 sek) hvis Calendar
 * ikke allerede kører. Vi cacher ikke her — callers kan selv cache.
 */

import { spawn } from "node:child_process";

/**
 * Kør et AppleScript via stdin (mere robust end `osascript -e` fordi shell-
 * escape ikke er nødvendig, og alle Unicode-tegn som ≥/≤ overlever).
 */
function runOsaScript(script: string, timeoutMs = 30_000): Promise<string> {
  return runScript([], script, timeoutMs);
}

/** JavaScript for Automation (hurtigere på tunge kalender-queries). */
function runJXA(script: string, timeoutMs = 45_000): Promise<string> {
  return runScript(["-l", "JavaScript"], script, timeoutMs);
}

function runScript(
  args: string[],
  script: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/osascript", args, { timeout: timeoutMs });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => stdout.push(c));
    child.stderr.on("data", (c: Buffer) => stderr.push(c));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8").trim();
      if (code === 0) {
        resolve(out);
      } else if (signal === "SIGTERM" || code === null) {
        reject(
          new Error(
            `Calendar.app svarer ikke indenfor ${Math.round(timeoutMs / 1000)}s. ` +
              `Hvis det er første gang: Giv Node/Terminal Calendar-adgang i Systemindstillinger → Privatliv & Sikkerhed → Automatisering.`
          )
        );
      } else {
        reject(new Error(`osascript exit ${code}: ${err || "(tom)"}`));
      }
    });
    child.stdin.write(script);
    child.stdin.end();
  });
}

export interface CalendarEvent {
  uid: string;
  calendar: string;
  title: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  location?: string;
  notes?: string;
  allDay: boolean;
}

/**
 * Henter events indenfor et tidsvindue.
 *
 * @param fromISO start (ISO 8601)
 * @param toISO slut (ISO 8601)
 * @param calendars valgfri filter — kun disse kalendere. Default: alle.
 */
export async function listEvents(
  fromISO: string,
  toISO: string,
  calendars?: string[]
): Promise<CalendarEvent[]> {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error("ugyldige ISO-datoer");
  }

  // Vi bruger JXA (JavaScript for Automation) fordi den er væsentligt hurtigere
  // end AppleScript's `whose`-predicater, der kan hænge i 30+ sek på store
  // kalendere. Vi henter alle events og filtrerer i JS.
  //
  // Bemærk: første gang Node kalder Calendar.app vil macOS vise en TCC-prompt.
  // Hvis den afvises returneres der enten tom output eller en fejl.
  const calendarFilter = calendars && calendars.length > 0
    ? `[${calendars.map((c) => `"${c.replace(/"/g, '\\"')}"`).join(",")}]`
    : "null";

  const script = `
    const targetCals = ${calendarFilter};
    const startMs = ${from.getTime()};
    const endMs = ${to.getTime()};
    const Cal = Application("Calendar");
    const lines = [];
    const cals = Cal.calendars();
    for (let i = 0; i < cals.length; i++) {
      const cal = cals[i];
      const calName = cal.name();
      if (targetCals && targetCals.indexOf(calName) === -1) continue;
      try {
        // JXA whose() er hurtigere end AppleScript's whose — men stadig
        // lidt tungt. Vi begrænser til dette kalender og dette vindue.
        const evts = cal.events.whose({
          _and: [
            { startDate: { _greaterThanEquals: new Date(startMs) } },
            { startDate: { _lessThanEquals: new Date(endMs) } }
          ]
        })();
        for (let j = 0; j < evts.length; j++) {
          const ev = evts[j];
          try {
            const uid = ev.uid();
            const title = ev.summary() || "";
            const s = ev.startDate();
            const e = ev.endDate();
            const allDay = ev.alldayEvent();
            let loc = "";
            try { loc = ev.location() || ""; } catch(_) {}
            lines.push([
              calName, uid, title,
              s ? s.toISOString() : "",
              e ? e.toISOString() : "",
              allDay ? "true" : "false",
              loc
            ].join("\\t"));
          } catch(_) {}
        }
      } catch(_) {}
    }
    lines.join("\\n");
  `;

  const stdout = await runJXA(script, 45_000);
  return parseEventLinesISO(stdout);
}

/** Events i dag (lokal midnat → næste midnat). */
export async function listTodayEvents(
  calendars?: string[]
): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 3600 * 1000);
  return listEvents(startOfDay.toISOString(), endOfDay.toISOString(), calendars);
}

/** Events de næste N timer fra nu. */
export async function listUpcomingEvents(
  hours: number,
  calendars?: string[]
): Promise<CalendarEvent[]> {
  const now = new Date();
  const end = new Date(now.getTime() + hours * 3600 * 1000);
  return listEvents(now.toISOString(), end.toISOString(), calendars);
}

/** Events der starter indenfor N minutter fra nu. Bruges til pre-meeting triggers. */
export async function listEventsWithinMinutes(
  minutes: number,
  calendars?: string[]
): Promise<CalendarEvent[]> {
  const now = new Date();
  const end = new Date(now.getTime() + minutes * 60 * 1000);
  const events = await listEvents(now.toISOString(), end.toISOString(), calendars);
  return events.filter((e) => {
    const start = new Date(e.start).getTime();
    return start >= now.getTime() && start <= end.getTime();
  });
}

/** List kalendernavne. */
export async function listCalendars(): Promise<string[]> {
  const script = `tell application "Calendar" to return name of calendars`;
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

/** Parser JXA output — datoer er allerede ISO 8601-strings. */
function parseEventLinesISO(raw: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = raw.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 6) continue;
    const [calendar, uid, title, startISO, endISO, allDayStr, location] = parts;
    if (!startISO || !endISO) continue;
    const start = new Date(startISO);
    const end = new Date(endISO);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
    events.push({
      uid: uid || "",
      calendar: calendar || "",
      title: title || "(uden titel)",
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: allDayStr === "true",
      location: location || undefined,
    });
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}

function parseEventLines(raw: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = raw.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 6) continue;
    const [calendar, uid, title, startStr, endStr, allDayStr, location] = parts;
    const start = parseASDate(startStr);
    const end = parseASDate(endStr);
    if (!start || !end) continue;
    events.push({
      uid: uid || "",
      calendar: calendar || "",
      title: title || "(uden titel)",
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: allDayStr === "true",
      location: location || undefined,
    });
  }
  // Sortér efter start
  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}

/**
 * Parser AppleScript date-strenge som fx:
 *   "torsdag den 23. april 2026 kl. 14.00.00"
 *   "Thursday, April 23, 2026 at 2:00:00 PM"
 * Bruger Date(Date.parse) som fallback, men først heuristisk dansk-parsing.
 */
function parseASDate(s: string): Date | null {
  if (!s) return null;
  const str = s.trim();

  // Dansk format: "torsdag den 23. april 2026 kl. 14.00.00"
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
        parseInt(year),
        month,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );
    }
  }

  // Engelsk fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  return null;
}
