import { currentSsid, findProfileForSsid, activateProfile, getActiveProfile } from "@/lib/firewall/profiles";
import { insertEvent } from "@/lib/firewall/store";

const POLL_MS = 30_000;
const DEBOUNCE_MS = 2_500; // SSID skal være stabil i 2.5s før vi auto-aktiverer profil
const STATE_KEY = "__skynet_wifi_watcher_state__";

interface WifiWatcherState {
  timer: NodeJS.Timeout | null;
  started: boolean;
  /** Den SSID vi sidst rapporterede som "stabil" (efter debounce). */
  lastSsid: string | null;
  lastChangeAt: number | null;
  /** Pending SSID — set siden seneste tick. Skal være konstant i DEBOUNCE_MS før commit. */
  pendingSsid: string | null;
  pendingSinceAt: number | null;
}

function getState(): WifiWatcherState {
  const g = globalThis as unknown as Record<string, WifiWatcherState>;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      timer: null,
      started: false,
      lastSsid: null,
      lastChangeAt: null,
      pendingSsid: null,
      pendingSinceAt: null,
    };
  }
  return g[STATE_KEY];
}

async function commitSsidChange(s: WifiWatcherState, ssid: string | null, oldSsid: string | null): Promise<void> {
  s.lastSsid = ssid;
  s.lastChangeAt = Date.now();
  s.pendingSsid = null;
  s.pendingSinceAt = null;
  console.log(`[wifi-watcher] SSID change committed: ${oldSsid ?? "(none)"} → ${ssid ?? "(none)"}`);

  if (ssid) {
    const profile = findProfileForSsid(ssid);
    if (profile) {
      const active = getActiveProfile();
      if (!active || active.id !== profile.id) {
        try {
          const result = await activateProfile(profile.id, { reason: "ssid_change", ssid });
          console.log(
            `[wifi-watcher] Auto-activated profile '${profile.name}' (+${result.rulesAdded} -${result.rulesRemoved} regler)`
          );
        } catch (e) {
          console.error(`[wifi-watcher] activateProfile failed:`, e instanceof Error ? e.message : e);
        }
      }
    } else {
      insertEvent({
        kind: "suspicious",
        detail: {
          type: "unknown_ssid",
          ssid,
          old_ssid: oldSsid,
          hint: "Ingen profil matcher SSID. Brug suggest_profile_for_network for at få et forslag.",
        },
      });
    }
  } else if (oldSsid) {
    insertEvent({ kind: "profile_switch", detail: { type: "wifi_disconnected", old_ssid: oldSsid } });
  }
}

async function tick(): Promise<void> {
  const s = getState();
  try {
    const ssid = await currentSsid();
    const now = Date.now();

    if (ssid === s.lastSsid) {
      // Stadig samme SSID — nulstil pending hvis nogen
      if (s.pendingSsid !== null) {
        s.pendingSsid = null;
        s.pendingSinceAt = null;
      }
    } else if (ssid === s.pendingSsid) {
      // Pending SSID stabil — har den været i pending længe nok?
      if (s.pendingSinceAt !== null && now - s.pendingSinceAt >= DEBOUNCE_MS) {
        await commitSsidChange(s, ssid, s.lastSsid);
      }
      // else: vent på næste tick
    } else {
      // Nyt pending SSID (eller første gang vi ser den anden SSID) — start debounce-timer
      s.pendingSsid = ssid;
      s.pendingSinceAt = now;
      console.log(`[wifi-watcher] pending SSID change: ${s.lastSsid ?? "(none)"} → ${ssid ?? "(none)"} (debounce ${DEBOUNCE_MS}ms)`);
    }
  } catch (e) {
    console.error("[wifi-watcher] tick failed:", e instanceof Error ? e.message : e);
  } finally {
    // Hvis vi har en pending switch, tikker hurtigere (DEBOUNCE_MS) så vi commit'er snart.
    const nextInterval = s.pendingSsid !== null ? Math.min(POLL_MS, DEBOUNCE_MS) : POLL_MS;
    s.timer = setTimeout(() => void tick(), nextInterval);
  }
}

export function startWifiWatcher(): void {
  const s = getState();
  if (s.started) return;
  s.started = true;
  console.log(`[wifi-watcher] starter — poller ${POLL_MS / 1000}s`);
  void tick();
}

export function stopWifiWatcher(): void {
  const s = getState();
  s.started = false;
  if (s.timer) {
    clearTimeout(s.timer);
    s.timer = null;
  }
}

export function getWifiWatcherStatus() {
  const s = getState();
  return {
    running: s.started,
    lastSsid: s.lastSsid,
    lastChangeAt: s.lastChangeAt,
    pendingSsid: s.pendingSsid,
    pendingSinceAt: s.pendingSinceAt,
  };
}
