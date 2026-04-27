import si from "systeminformation";
import { exec } from "child_process";
import { promisify } from "util";
import nodeOs from "node:os";
import type { SystemData, ProcessInfo, MachineInfo, DisplayInfo } from "@/lib/types";

const execAsync = promisify(exec);

// Cache hardware-info i 5 min — system_profiler er langsom og spec'en ændrer sig sjældent
const HARDWARE_TTL_MS = 5 * 60_000;
let machineCache: { data: MachineInfo | null; ts: number } | null = null;
let displaysCache: { data: DisplayInfo[]; ts: number } | null = null;

async function readMachine(): Promise<MachineInfo | null> {
  if (machineCache && Date.now() - machineCache.ts < HARDWARE_TTL_MS) return machineCache.data;
  try {
    const [{ stdout }, osInfo] = await Promise.all([
      execAsync("system_profiler SPHardwareDataType -json", { timeout: 5000 }),
      si.osInfo(),
    ]);
    const data = JSON.parse(stdout).SPHardwareDataType?.[0] ?? {};
    const info: MachineInfo = {
      model: data.machine_model ?? data.machine_name ?? "?",
      chip: data.chip_type ?? "?",
      ram: data.physical_memory ?? "?",
      osVersion: `${osInfo.distro} ${osInfo.release}`.trim(),
    };
    machineCache = { data: info, ts: Date.now() };
    return info;
  } catch {
    machineCache = { data: null, ts: Date.now() };
    return null;
  }
}

interface SpDisplay {
  _name?: string;
  _spdisplays_resolution?: string;
  spdisplays_resolution?: string;
  _spdisplays_pixels?: string;
  spdisplays_pixels?: string;
  spdisplays_main?: string;
}
interface SpGpu { spdisplays_ndrvs?: SpDisplay[] }

async function readDisplays(): Promise<DisplayInfo[]> {
  if (displaysCache && Date.now() - displaysCache.ts < HARDWARE_TTL_MS) return displaysCache.data;
  try {
    const { stdout } = await execAsync("system_profiler SPDisplaysDataType -json", { timeout: 5000 });
    const data = JSON.parse(stdout) as { SPDisplaysDataType?: SpGpu[] };
    const result: DisplayInfo[] = [];
    for (const gpu of data.SPDisplaysDataType ?? []) {
      for (const d of gpu.spdisplays_ndrvs ?? []) {
        const resStr = d._spdisplays_resolution ?? d.spdisplays_resolution ?? "";
        const m = resStr.match(/(\d+)\s*x\s*(\d+)\s*@\s*([\d.]+)\s*Hz/);
        const nativeStr = d._spdisplays_pixels ?? d.spdisplays_pixels ?? "";
        result.push({
          name: d._name ?? "Display",
          resolution: m ? `${m[1]}×${m[2]}` : resStr,
          native: nativeStr.replace(/\s*x\s*/, "×"),
          refreshRate: m ? Math.round(Number(m[3])) : 0,
          isMain: d.spdisplays_main === "spdisplays_yes",
        });
      }
    }
    displaysCache = { data: result, ts: Date.now() };
    return result;
  } catch {
    displaysCache = { data: [], ts: Date.now() };
    return [];
  }
}

async function readBatteryWatts(): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      "ioreg -rw0 -c AppleSmartBattery 2>/dev/null",
      { timeout: 1500 }
    );
    const amp = stdout.match(/"InstantAmperage"\s*=\s*(-?\d+)/);
    const volt = stdout.match(/"Voltage"\s*=\s*(\d+)/);
    if (!amp || !volt) return null;
    // InstantAmperage: mA (negative = discharging). Voltage: mV.
    const mA = Math.abs(parseInt(amp[1], 10));
    const mV = parseInt(volt[1], 10);
    const watts = (mA * mV) / 1_000_000;
    return Math.round(watts * 10) / 10;
  } catch {
    return null;
  }
}

/** Parse fx "5235M" → bytes */
function parseTopSize(s: string): number {
  const m = s.match(/^([\d.]+)([KMGT])?$/i);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const unit = (m[2] || "").toUpperCase();
  const mult = unit === "K" ? 1024 : unit === "M" ? 1024 ** 2 : unit === "G" ? 1024 ** 3 : unit === "T" ? 1024 ** 4 : 1;
  return num * mult;
}

interface MacMemDetails { wired: number; compressor: number; unused: number; swapIns: number; swapOuts: number }

async function readMacMemDetails(): Promise<MacMemDetails | null> {
  try {
    const { stdout } = await execAsync("top -l 1 -s 0", { timeout: 2000 });
    // PhysMem: 62G used (5235M wired, 21G compressor), 1615M unused.
    const phys = stdout.match(/PhysMem:.+?\(([\d.]+[KMGT]?)\s+wired,\s+([\d.]+[KMGT]?)\s+compressor\),\s+([\d.]+[KMGT]?)\s+unused/i);
    // VM: ... 168(0) swapins, 212(0) swapouts.
    const vm = stdout.match(/VM:.*?(\d+)\(\d+\)\s+swapins,\s+(\d+)\(\d+\)\s+swapouts/);
    if (!phys) return null;
    return {
      wired: parseTopSize(phys[1]),
      compressor: parseTopSize(phys[2]),
      unused: parseTopSize(phys[3]),
      swapIns: vm ? Number(vm[1]) : 0,
      swapOuts: vm ? Number(vm[2]) : 0,
    };
  } catch {
    return null;
  }
}

async function readPower(): Promise<{ source: "ac" | "battery" | "unknown"; thermalWarning: boolean; watts: number | null }> {
  try {
    const [ps, therm, watts] = await Promise.all([
      execAsync("pmset -g ps", { timeout: 1500 }).catch(() => ({ stdout: "" })),
      execAsync("pmset -g therm", { timeout: 1500 }).catch(() => ({ stdout: "" })),
      readBatteryWatts(),
    ]);
    const source = ps.stdout.includes("AC Power")
      ? "ac"
      : ps.stdout.includes("Battery Power")
      ? "battery"
      : "unknown";
    const thermalWarning =
      /CPU_Scheduler_Limit\s*=\s*([0-9]+)/.test(therm.stdout) &&
      !/CPU_Scheduler_Limit\s*=\s*100/.test(therm.stdout);
    return { source, thermalWarning, watts };
  } catch {
    return { source: "unknown", thermalWarning: false, watts: null };
  }
}

function topBy(list: si.Systeminformation.ProcessesProcessData[], key: "cpu" | "mem"): ProcessInfo[] {
  return [...list]
    .filter((p) => p[key] > 0.05 && p.name !== "kernel_task")
    .sort((a, b) => b[key] - a[key])
    .slice(0, 3)
    .map((p) => ({ name: p.name, cpu: Math.round(p.cpu * 10) / 10, mem: Math.round(p.mem * 10) / 10, pid: p.pid }));
}

export async function collect(): Promise<SystemData> {
  const [load, mem, fsSizes, cpuInfo, temp, net, battery, osInfo, procs, power, machine, displays, memDetails] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.cpu(),
    si.cpuTemperature().catch(() => ({ main: null } as { main: number | null })),
    si.networkStats().catch(() => []),
    si.battery().catch(() => null),
    si.osInfo(),
    si.processes().catch(
      () =>
        ({
          list: [],
          all: 0,
          running: 0,
          blocked: 0,
          sleeping: 0,
          unknown: 0,
        }) as unknown as si.Systeminformation.ProcessesData
    ),
    readPower(),
    readMachine(),
    readDisplays(),
    readMacMemDetails(),
  ]);
  // bytt order skal matche destructuring

  const mainFs = fsSizes.sort((a, b) => b.size - a.size)[0] ?? { size: 1, used: 0, use: 0 };
  const mainNet = net[0] ?? { rx_sec: 0, tx_sec: 0 };

  return {
    cpu: {
      load: Math.round(load.currentLoad),
      cores: cpuInfo.cores,
      brand: `${cpuInfo.manufacturer} ${cpuInfo.brand}`.trim(),
    },
    memory: {
      used: mem.active,
      total: mem.total,
      percent: Math.round((mem.active / mem.total) * 100),
      wired: memDetails?.wired,
      compressor: memDetails?.compressor,
      unused: memDetails?.unused,
      swapIns: memDetails?.swapIns,
      swapOuts: memDetails?.swapOuts,
    },
    disk: {
      used: mainFs.used,
      total: mainFs.size,
      percent: Math.round(mainFs.use),
    },
    temperature: typeof temp.main === "number" ? Math.round(temp.main) : null,
    network: {
      rxSec: Math.max(0, mainNet.rx_sec ?? 0),
      txSec: Math.max(0, mainNet.tx_sec ?? 0),
    },
    battery: {
      hasBattery: Boolean(battery?.hasBattery),
      percent: battery?.hasBattery ? battery.percent ?? null : null,
      charging: Boolean(battery?.isCharging),
    },
    host: {
      hostname: osInfo.hostname,
      uptime: Math.floor(si.time().uptime),
      platform: `${osInfo.distro} ${osInfo.release}`.trim(),
    },
    power,
    processes: {
      topCpu: topBy(procs.list, "cpu"),
      topMem: topBy(procs.list, "mem"),
      total: procs.all,
    },
    loadAvg: nodeOs.loadavg() as [number, number, number],
    machine,
    displays,
  };
}
