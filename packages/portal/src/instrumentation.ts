export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [
    { startSparklineCollector },
    { autoImportPlexToken },
    { startScheduler },
    { startMeetingPrep },
  ] = await Promise.all([
    import("@/jobs/sparkline-collector"),
    import("@/jobs/plex-token-import"),
    import("@/jobs/scheduler"),
    import("@/jobs/meeting-prep"),
  ]);

  await autoImportPlexToken();
  startSparklineCollector();
  startScheduler();
  startMeetingPrep();
}
