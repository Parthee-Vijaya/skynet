import {
  activeFlowCount,
  topTalkers,
  listEvents,
  type TopTalker,
  type NetEventRow,
} from "@/lib/firewall/store";
import { getMarkDashboardActive, getNetworkCollectorStatus } from "@/jobs/network-collector";

export interface FirewallSummary {
  /** Pulse the dashboard so the collector polls more aggressively. */
  active: boolean;
  collector: {
    running: boolean;
    lastTickAt: number | null;
    lastTickOk: boolean;
    intervalMs: number;
  };
  /** "monitor-only" until LuLu-integration lands in Fase 2. */
  enforcement: "monitor" | "lulu";
  activeFlows: number;
  topTalkers: TopTalker[];
  recentNewApps: NetEventRow[];
  unackedAlertCount: number;
}

export async function collect(): Promise<FirewallSummary> {
  // Mark UI-active so the collector ticks at the active interval next time.
  getMarkDashboardActive()();

  const status = getNetworkCollectorStatus();
  const flows = activeFlowCount(30_000);
  const talkers = topTalkers(60_000, 5);
  const newApps = listEvents({ kind: "new_app", sinceMs: Date.now() - 30 * 60_000, limit: 5 });
  const unacked = listEvents({ unackedOnly: true, sinceMs: Date.now() - 60 * 60_000, limit: 100 }).length;

  return {
    active: true,
    collector: status,
    enforcement: "monitor",
    activeFlows: flows,
    topTalkers: talkers,
    recentNewApps: newApps,
    unackedAlertCount: unacked,
  };
}
