"use client";
import { usePoll } from "@/hooks/usePoll";
import type { SabnzbdData } from "@/lib/types";
import { Section } from "../primitives";

/**
 * SABnzbd queue-widget — viser aktive downloads, hastighed, resttid og
 * kortfattet history-sammenfatning. Placeret under Plex i cockpittet.
 *
 * Henter API-key auto fra ~/Library/Application Support/SABnzbd/sabnzbd.ini
 * eller manuelt sat som setting 'sabnzbd_api_key'.
 */

function fmtMb(mb: number): string {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " gb";
  return Math.round(mb) + " mb";
}

function fmtSpeed(kbps: number): string {
  if (kbps >= 1024) return (kbps / 1024).toFixed(1) + " mb/s";
  return Math.round(kbps) + " kb/s";
}

function fmtEta(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return seconds + "s";
  if (seconds < 3600) return Math.round(seconds / 60) + "m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m === 0 ? `${h}t` : `${h}t ${m}m`;
}

export function SabnzbdWidgetMinimal() {
  const { data } = usePoll<SabnzbdData>("/api/sabnzbd", 5_000);

  const right = (() => {
    if (!data) return undefined;
    if (!data.online) {
      return <span className="text-neutral-600">{data.configured ? "○ offline" : "○ ikke konfigureret"}</span>;
    }
    const activeCount = data.slots.filter((s) => s.status !== "paused" && s.status !== "completed").length;
    if (data.stats.paused) {
      return <span className="text-amber-400/80">⏸ pauset · {activeCount}</span>;
    }
    if (activeCount === 0) {
      return <span className="text-neutral-600">○ idle</span>;
    }
    return <span className="text-emerald-500/80">● {activeCount} aktiv{activeCount === 1 ? "" : "e"}</span>;
  })();

  return (
    <Section title="sabnzbd" right={right} className="col-span-12 lg:col-span-6">
      {!data ? (
        <div className="text-neutral-700 font-mono text-[12px]">indlæser…</div>
      ) : !data.configured ? (
        <div className="font-mono text-[11px] text-neutral-600 space-y-1">
          <div>api-key ikke fundet.</div>
          <div className="text-neutral-700">
            Start SABnzbd og lad Skynet auto-læse nøglen fra
            <code className="text-neutral-500 ml-1">~/Library/Application Support/SABnzbd/sabnzbd.ini</code>
            , eller sæt <code className="text-neutral-500">sabnzbd_api_key</code> i settings.
          </div>
        </div>
      ) : !data.online ? (
        <div className="font-mono text-[11px] text-neutral-600">
          SABnzbd svarer ikke ({data.reason ?? "ukendt fejl"}).
        </div>
      ) : data.slots.length === 0 ? (
        <div className="font-mono">
          <div className="text-neutral-600 text-[12px] mb-2">ingen aktive downloads</div>
          <div className="flex gap-4 text-[10px] text-neutral-600">
            <span>📦 i dag: {data.history.dayGb.toFixed(1)} gb</span>
            <span>uge: {data.history.weekGb.toFixed(1)} gb</span>
            <span>fri: {fmtMb(data.stats.freeMb)}</span>
          </div>
        </div>
      ) : (
        <div className="font-mono space-y-2">
          {/* Top-linje: speed + total rest + fri plads */}
          <div className="flex items-baseline gap-3 text-[11px]">
            <span className="text-neutral-100 text-[18px] font-extralight tabular-nums">
              {fmtSpeed(data.stats.kbpersec)}
            </span>
            <span className="text-neutral-500">
              rest: {fmtMb(data.stats.leftMb ?? 0)}
            </span>
            <span className="text-neutral-500">
              eta {fmtEta(data.stats.etaSeconds)}
            </span>
            <span className="text-neutral-700 ml-auto">
              fri {fmtMb(data.stats.freeMb)}
            </span>
          </div>

          {/* Slot-liste */}
          <div className="space-y-[3px]">
            {data.slots.slice(0, 3).map((slot) => {
              const pct = Math.max(0, Math.min(100, slot.percent));
              const tone = slot.status === "Downloading" ? "#9bd0ff" : slot.status === "Queued" ? "#6b6b6b" : "#e6b450";
              return (
                <div key={slot.id || slot.name} className="text-[10px]" data-sensitive>
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-neutral-300 truncate flex-1">{slot.name}</span>
                    <span className="text-neutral-600 tabular-nums shrink-0">
                      {pct.toFixed(0)}% · {slot.timeLeft || "—"}
                    </span>
                  </div>
                  <div className="h-[2px] bg-neutral-900 relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 transition-all duration-500"
                      style={{ width: `${pct}%`, background: tone }}
                    />
                  </div>
                </div>
              );
            })}
            {(data.queueCount ?? 0) > 3 && (
              <div className="text-[10px] text-neutral-700 pl-1">
                + {(data.queueCount ?? 0) - 3} i kø
              </div>
            )}
          </div>

          {/* History-footer */}
          <div className="flex gap-4 text-[10px] text-neutral-600 pt-1 border-t border-dashed border-neutral-900">
            <span>📦 i dag: {data.history.dayGb.toFixed(1)} gb</span>
            <span>uge: {data.history.weekGb.toFixed(1)}</span>
            <span>total: {data.history.totalGb.toFixed(0)}</span>
          </div>
        </div>
      )}
    </Section>
  );
}
