import { currentSsid, findProfileForSsid, activateProfile, getActiveProfile } from "@/lib/firewall/profiles";
import { insertEvent } from "@/lib/firewall/store";

const POLL_MS = 30_000;
const STATE_KEY = "__skynet_wifi_watcher_state__";

interface WifiWatcherState {
  timer: NodeJS.Timeout | null;
  started: boolean;
  lastSsid: string | null;
  lastChangeAt: number | null;
}

function getState(): WifiWatcherState {
  const g = globalThis as unknown as Record<string, WifiWatcherState>;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = { timer: null, started: false, lastSsid: null, lastChangeAt: null };
  }
  return g[STATE_KEY];
}

async function tick(): Promise<void> {
  const s = getState();
  try {
    const ssid = await currentSsid();
    if (ssid !== s.lastSsid) {
      const oldSsid = s.lastSsid;
      s.lastSsid = ssid;
      s.lastChangeAt = Date.now();
      console.log(`[wifi-watcher] SSID change: ${oldSsid ?? "(none)"} → ${ssid ?? "(none)"}`);

      if (ssid) {
        const profile = findProfileForSsid(ssid);
        if (profile) {
          const active = getActiveProfile();
          if (!active || active.id !== profile.id) {
            try {
              const result = await activateProfile(profile.id, {
                reason: "ssid_change",
                ssid,
              });
              console.log(
                `[wifi-watcher] Auto-activated profile '${profile.name}' (+${result.rulesAdded} -${result.rulesRemoved} regler)`
              );
            } catch (e) {
              console.error(`[wifi-watcher] activateProfile failed:`, e instanceof Error ? e.message : e);
            }
          }
        } else {
          // Unknown SSID — emit event so the UI can offer "Create profile?"
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
        // Wi-Fi went away (cable / airplane mode / asleep)
        insertEvent({
          kind: "profile_switch",
          detail: { type: "wifi_disconnected", old_ssid: oldSsid },
        });
      }
    }
  } catch (e) {
    console.error("[wifi-watcher] tick failed:", e instanceof Error ? e.message : e);
  } finally {
    s.timer = setTimeout(() => void tick(), POLL_MS);
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
  };
}
