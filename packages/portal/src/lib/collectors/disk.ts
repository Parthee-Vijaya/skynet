import si from "systeminformation";
import { exec } from "child_process";
import { promisify } from "util";
import type { DiskData, DiskDevice } from "@/lib/types";

const execAsync = promisify(exec);

async function iostatSample(devices: string[]): Promise<Map<string, { rateMbs: number; totalMb: number }>> {
  const out = new Map<string, { rateMbs: number; totalMb: number }>();
  if (devices.length === 0) return out;

  const [sample, cumulative] = await Promise.all([
    execAsync(`iostat -d -c 2 -w 1 ${devices.join(" ")}`, { timeout: 3500 }).catch(() => ({ stdout: "" })),
    execAsync(`iostat -I -d ${devices.join(" ")}`, { timeout: 2000 }).catch(() => ({ stdout: "" })),
  ]);

  const parseMatrix = (text: string, colsPerDevice: number): number[][] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 3) return [];
    const dataRows = lines.slice(2);
    return dataRows.map((row) =>
      row
        .trim()
        .split(/\s+/)
        .map((v) => Number(v) || 0)
    );
  };

  const sampleMatrix = parseMatrix(sample.stdout, 3);
  if (sampleMatrix.length >= 2) {
    const latest = sampleMatrix[sampleMatrix.length - 1];
    devices.forEach((dev, i) => {
      const mbPerSec = latest[i * 3 + 2] ?? 0;
      out.set(dev, { rateMbs: mbPerSec, totalMb: 0 });
    });
  }

  const cumMatrix = parseMatrix(cumulative.stdout, 3);
  if (cumMatrix.length >= 1) {
    const cumRow = cumMatrix[0];
    devices.forEach((dev, i) => {
      const prev = out.get(dev) ?? { rateMbs: 0, totalMb: 0 };
      const totalMb = cumRow[i * 3 + 2] ?? 0;
      out.set(dev, { rateMbs: prev.rateMbs, totalMb });
    });
  }

  return out;
}

interface DiskUsage {
  usedBytes: number;
  percent: number;
  mount: string;
}

function internalUsage(fsSizes: si.Systeminformation.FsSizeData[]): DiskUsage {
  const dataVol = fsSizes.find((f) => f.mount === "/System/Volumes/Data");
  const rootVol = fsSizes.find((f) => f.mount === "/");
  const vol = dataVol ?? rootVol;
  return {
    usedBytes: vol?.used ?? 0,
    percent: vol ? Math.round(vol.use) : 0,
    mount: vol?.mount ?? "/",
  };
}

function externalUsages(fsSizes: si.Systeminformation.FsSizeData[]): si.Systeminformation.FsSizeData[] {
  return fsSizes.filter((f) => f.mount.startsWith("/Volumes/"));
}

export async function collect(): Promise<DiskData> {
  const [layout, fsSizes] = await Promise.all([
    si.diskLayout().catch(() => []),
    si.fsSize().catch(() => []),
  ]);

  const sortedPhysical = [...layout].sort((a, b) => {
    const an = Number((a.device ?? "").replace(/\D/g, "") || 0);
    const bn = Number((b.device ?? "").replace(/\D/g, "") || 0);
    return an - bn;
  });

  const internalDevice = sortedPhysical.find((d) => d.interfaceType === "PCIe" || d.type === "NVMe") ?? sortedPhysical[0];
  const externalCandidates = sortedPhysical.filter((d) => d.device !== internalDevice?.device);
  const externals = externalUsages(fsSizes);

  const deviceIds = sortedPhysical.map((d) => d.device).filter(Boolean);
  const ioMap = await iostatSample(deviceIds).catch(() => new Map());

  const devices: DiskDevice[] = [];

  if (internalDevice) {
    const u = internalUsage(fsSizes);
    const io = ioMap.get(internalDevice.device) ?? { rateMbs: 0, totalMb: 0 };
    devices.push({
      id: internalDevice.device,
      name: internalDevice.name,
      interfaceType: internalDevice.interfaceType,
      mount: u.mount,
      totalBytes: internalDevice.size,
      usedBytes: u.usedBytes,
      percentUsed: u.percent,
      isInternal: true,
      rateMBs: io.rateMbs,
      totalMB: io.totalMb,
    });
  }

  externalCandidates.forEach((d, idx) => {
    const vol = externals[idx] ?? externals.find((v) => v.size > 0.5 * d.size);
    const io = ioMap.get(d.device) ?? { rateMbs: 0, totalMb: 0 };
    devices.push({
      id: d.device,
      name: d.name,
      interfaceType: d.interfaceType,
      mount: vol?.mount ?? "",
      totalBytes: d.size,
      usedBytes: vol?.used ?? 0,
      percentUsed: vol ? Math.round(vol.use) : 0,
      isInternal: false,
      rateMBs: io.rateMbs,
      totalMB: io.totalMb,
    });
  });

  const visibleMounts = fsSizes
    .filter((f) => f.mount === "/" || f.mount === "/System/Volumes/Data" || f.mount.startsWith("/Volumes/"))
    .map((f) => ({
      path: f.mount,
      fs: f.fs,
      totalBytes: f.size,
      usedBytes: f.used,
      percentUsed: Math.round(f.use),
      type: f.type,
    }));

  return { devices, mounts: visibleMounts };
}
