export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [
    { startSparklineCollector },
    { autoImportPlexToken },
    { startScheduler },
    { startMeetingPrep },
    { startTerminalServer },
  ] = await Promise.all([
    import("@/jobs/sparkline-collector"),
    import("@/jobs/plex-token-import"),
    import("@/jobs/scheduler"),
    import("@/jobs/meeting-prep"),
    import("@/jobs/terminal-server"),
  ]);

  await autoImportPlexToken();
  startSparklineCollector();
  startScheduler();
  startMeetingPrep();
  // Terminal-WS — best-effort, fejler tavst hvis node-pty mangler
  startTerminalServer().catch((e) => console.error("[terminal-ws] startup failed:", e));
}
