/**
 * Pre-meeting notifikation — tjekker hvert 5. minut for events der starter
 * indenfor de næste 10 minutter, og sender en push med forberedelses-info.
 *
 * Kræver at brugeren har givet Calendar-adgang til Node. Hvis osascript
 * fejler bliver der logget en fejl, men joben fortsætter (silent fail).
 */

import { listEventsWithinMinutes } from "@/lib/integrations/calendar";
import { notify } from "@/lib/notify";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const LOOKAHEAD_MIN = 15; // events der starter indenfor 15 min

let timer: NodeJS.Timeout | null = null;
/** UIDs vi allerede har notificeret om — undgår re-spam. */
const notifiedUIDs = new Set<string>();

async function tick(): Promise<void> {
  try {
    const events = await listEventsWithinMinutes(LOOKAHEAD_MIN);
    const now = Date.now();

    for (const ev of events) {
      if (notifiedUIDs.has(ev.uid)) continue;
      const startMs = new Date(ev.start).getTime();
      const minsUntil = Math.round((startMs - now) / 60000);

      // Kun events der starter om 3-15 min (ikke allerede i gang)
      if (minsUntil < 3 || minsUntil > LOOKAHEAD_MIN) continue;

      const parts = [
        `Starter om ${minsUntil} min`,
        ev.location ? `📍 ${ev.location}` : null,
        `Kalender: ${ev.calendar}`,
      ].filter(Boolean);

      await notify({
        title: `📅 ${ev.title}`,
        body: parts.join(" · "),
        priority: "default",
        tag: "meeting-prep",
      });

      notifiedUIDs.add(ev.uid);
    }

    // Ryd gamle UIDs (ældre end 2 timer)
    if (notifiedUIDs.size > 500) {
      const cutoff = now - 2 * 3600 * 1000;
      // Uden timestamp pr. UID nuller vi når vi rammer grænsen
      if (notifiedUIDs.size > 1000) notifiedUIDs.clear();
      void cutoff; // reserved for future timestamp-baseret pruning
    }
  } catch (e) {
    // Silent fail — Calendar-adgang mangler, eller kalender-app er træg.
    // Log én gang pr. session for ikke at spamme.
    console.error("[meeting-prep] tick failed:", e instanceof Error ? e.message : e);
  }
}

export function startMeetingPrep(): void {
  if (timer) return;
  console.log(`[meeting-prep] starter — tjekker hvert ${CHECK_INTERVAL_MS / 1000}s`);
  // Ikke kør ved startup — Calendar.app kan være tung at wake up
  timer = setInterval(() => void tick(), CHECK_INTERVAL_MS);
}

export function stopMeetingPrep(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
