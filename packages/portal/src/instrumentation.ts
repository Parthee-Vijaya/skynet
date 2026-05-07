export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [
    { startSparklineCollector },
    { autoImportPlexToken },
    { startScheduler },
    { startMeetingPrep },
    { startPoller: startImessagePoller },
    { startPoller: startTelegramPoller },
    { startSubscriber: startNtfySubscriber },
    { startNetworkCollector },
  ] = await Promise.all([
    import("@/jobs/sparkline-collector"),
    import("@/jobs/plex-token-import"),
    import("@/jobs/scheduler"),
    import("@/jobs/meeting-prep"),
    import("@/jobs/imessage-poller"),
    import("@/jobs/telegram-poller"),
    import("@/jobs/ntfy-subscriber"),
    import("@/jobs/network-collector"),
  ]);

  await autoImportPlexToken();
  startSparklineCollector();
  startScheduler();
  startMeetingPrep();
  // iMessage-poller — best-effort, fejler tavst hvis FDA mangler
  try { startImessagePoller(); } catch (e) { console.warn("[imessage-poller] startup failed:", e); }
  // Telegram-poller — best-effort, kun aktiv hvis token + toggle er sat
  try { startTelegramPoller(); } catch (e) { console.warn("[telegram-poller] startup failed:", e); }
  // ntfy-subscriber — kun aktiv hvis topic + toggle er sat
  try { startNtfySubscriber(); } catch (e) { console.warn("[ntfy-subscriber] startup failed:", e); }
  // Network-collector — adaptive 10s aktiv / 60s idle, lsof+nettop polling
  try { startNetworkCollector(); } catch (e) { console.warn("[network-collector] startup failed:", e); }
}
