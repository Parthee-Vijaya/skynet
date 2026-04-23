"use client";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";

interface CalendarEvent {
  uid: string;
  calendar: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

interface CalendarResponse {
  events?: CalendarEvent[];
  count?: number;
  error?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

function formatDateOrDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000);
  const dayAfter = new Date(today.getTime() + 48 * 3600 * 1000);
  const dStart = new Date(d);
  dStart.setHours(0, 0, 0, 0);

  if (dStart.getTime() === today.getTime()) return "I dag";
  if (dStart.getTime() === tomorrow.getTime()) return "I morgen";
  if (dStart.getTime() < dayAfter.getTime()) return "I overmorgen";
  return d.toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" });
}

function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

export function CalendarWidget() {
  const { data, error } = usePoll<CalendarResponse>("/api/calendar?mode=upcoming&hours=48", 120_000);

  const events = data?.events ?? [];
  const errorMsg = data?.error || (error ? "Fejl ved load" : null);

  // Grupper per dato-etiket
  const groups: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const key = formatDateOrDay(ev.start);
    (groups[key] ||= []).push(ev);
  }

  const groupKeys = Object.keys(groups);
  const next = events[0];
  const mins = next ? minutesUntil(next.start) : null;

  return (
    <Card
      widget="calendar"
      title="Kalender"
      className="sm:col-span-2 lg:col-span-6"
      action={
        <span className="text-xs text-neutral-500 font-mono">
          {events.length > 0 ? `${events.length} event${events.length === 1 ? "" : "s"}` : "ingen"}
        </span>
      }
    >
      {errorMsg ? (
        <div className="text-xs text-red-400/70 py-2">
          {errorMsg}
          <div className="text-[10px] text-neutral-500 mt-1">
            Giv Calendar-adgang: Systemindstillinger → Privatliv & Sikkerhed → Automatisering
          </div>
        </div>
      ) : events.length === 0 ? (
        <div className="text-xs text-neutral-500 py-3 text-center">
          Ingen events de næste 48 timer
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {next && mins !== null && mins >= 0 && mins <= 60 && (
            <div className="px-3 py-2 rounded border border-amber-400/40 bg-amber-400/5 text-xs">
              <div className="text-amber-300 font-medium">
                Næste om {mins} min
              </div>
              <div className="text-neutral-300 truncate">{next.title}</div>
            </div>
          )}
          {groupKeys.map((key) => (
            <div key={key}>
              <div className="text-[10px] uppercase tracking-wider text-cyan-400/60 mb-1.5">
                {key}
              </div>
              <div className="space-y-1">
                {groups[key].slice(0, 6).map((ev) => (
                  <div
                    key={ev.uid || `${ev.title}-${ev.start}`}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-neutral-900/50 text-xs"
                  >
                    <span className="font-mono text-[10px] text-neutral-400 w-20 flex-shrink-0">
                      {ev.allDay ? "hele dagen" : `${formatTime(ev.start)}–${formatTime(ev.end)}`}
                    </span>
                    <span className="truncate text-neutral-200 flex-1">{ev.title}</span>
                    <span className="text-[10px] text-neutral-500 ml-1 flex-shrink-0">
                      {ev.calendar}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
