import { collect as collectSystem } from "@/lib/collectors/system";
import { writePoints, pruneOld } from "@/lib/history";
import { evaluateThresholds } from "@/lib/agent/thresholds";

const INTERVAL_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  try {
    const s = await collectSystem();
    const metrics = {
      cpu: s.cpu.load,
      mem: s.memory.percent,
      disk: s.disk.percent,
      disk_percent: s.disk.percent, // alias så threshold-templates er intuitive
      netIn: s.network.rxSec,
      netOut: s.network.txSec,
      temp: s.temperature ?? 0,
      temperature: s.temperature ?? 0, // alias
    };
    writePoints([
      { metric: "cpu", value: metrics.cpu },
      { metric: "mem", value: metrics.mem },
      { metric: "disk", value: metrics.disk },
      { metric: "netIn", value: metrics.netIn },
      { metric: "netOut", value: metrics.netOut },
      { metric: "temp", value: metrics.temp },
    ]);
    pruneOld();

    // Evaluér threshold-triggers med de samme metrics
    await evaluateThresholds(metrics);
  } catch (e) {
    console.error("[sparkline] tick failed", e);
  }
}

export function startSparklineCollector(): void {
  if (timer) return;
  console.log("[sparkline] starter — interval 60s");
  void tick();
  timer = setInterval(() => void tick(), INTERVAL_MS);
}

export function stopSparklineCollector(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
