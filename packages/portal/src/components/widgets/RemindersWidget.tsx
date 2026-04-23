"use client";
import { useState } from "react";
import { usePoll } from "@/hooks/usePoll";
import { Card } from "@/components/ui/Card";

interface Reminder {
  id: string;
  list: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  priority: number;
}

interface RemindersResponse {
  reminders?: Reminder[];
  count?: number;
  error?: string;
}

function dueLabel(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (24 * 3600 * 1000));
  if (diffMs < 0) return "overskredet";
  if (diffDays === 0) return "i dag";
  if (diffDays === 1) return "i morgen";
  if (diffDays < 7) return `om ${diffDays}d`;
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

export function RemindersWidget() {
  const { data, error } = usePoll<RemindersResponse>(
    "/api/reminders?mode=list",
    120_000
  );
  const [completing, setCompleting] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const reminders = (data?.reminders ?? []).filter((r) => !hidden.has(r.id));
  const errorMsg = data?.error || (error ? "Fejl ved load" : null);

  async function complete(id: string) {
    setCompleting(id);
    try {
      await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", id }),
      });
      setHidden((prev) => new Set(prev).add(id));
    } finally {
      setCompleting(null);
    }
  }

  // Grupper pr. liste
  const groups: Record<string, Reminder[]> = {};
  for (const r of reminders) {
    (groups[r.list] ||= []).push(r);
  }

  return (
    <Card
      widget="reminders"
      title="Påmindelser"
      className="sm:col-span-2 lg:col-span-6"
      action={
        <span className="text-xs text-neutral-500 font-mono">
          {reminders.length} åbne
        </span>
      }
    >
      {errorMsg ? (
        <div className="text-xs text-red-400/70 py-2">
          {errorMsg}
          <div className="text-[10px] text-neutral-500 mt-1">
            Giv Reminders-adgang: Systemindstillinger → Privatliv & Sikkerhed → Automatisering
          </div>
        </div>
      ) : reminders.length === 0 ? (
        <div className="text-xs text-neutral-500 py-3 text-center">
          Ingen åbne påmindelser
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {Object.keys(groups).map((listName) => (
            <div key={listName}>
              <div className="text-[10px] uppercase tracking-wider text-cyan-400/60 mb-1.5">
                {listName}
              </div>
              <div className="space-y-1">
                {groups[listName].slice(0, 8).map((r) => {
                  const due = dueLabel(r.dueDate);
                  const overdue = due === "overskredet";
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-neutral-900/50 text-xs"
                    >
                      <button
                        onClick={() => complete(r.id)}
                        disabled={completing === r.id}
                        title="Markér som færdig"
                        className="w-4 h-4 rounded-full border border-neutral-600 hover:border-cyan-400 hover:bg-cyan-400/10 flex-shrink-0 transition-colors disabled:opacity-50"
                      />
                      <span className="truncate text-neutral-200 flex-1">{r.title}</span>
                      {due && (
                        <span
                          className={`text-[10px] font-mono ml-1 flex-shrink-0 ${
                            overdue ? "text-red-400" : "text-neutral-500"
                          }`}
                        >
                          {due}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
