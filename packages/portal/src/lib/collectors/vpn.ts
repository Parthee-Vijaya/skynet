import { exec } from "child_process";
import { promisify } from "util";
import type { VpnData } from "@/lib/types";

const execAsync = promisify(exec);

async function getActiveUtun(): Promise<string | null> {
  try {
    const { stdout } = await execAsync("ifconfig", { timeout: 3000 });
    const lines = stdout.split("\n");
    let currentInterface: string | null = null;
    for (const line of lines) {
      const ifMatch = line.match(/^(utun\d+):/);
      if (ifMatch) {
        currentInterface = ifMatch[1];
        continue;
      }
      if (currentInterface && line.trim().startsWith("inet ") && !line.includes("::")) {
        const isWireGuardLike = line.includes("--> 10.") || line.match(/inet 10\.\d+/);
        if (isWireGuardLike) return currentInterface;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function getExternalIp(): Promise<{ ip?: string; country?: string; countryCode?: string }> {
  try {
    const res = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("ipapi failed");
    const data = (await res.json()) as {
      ip?: string;
      country_name?: string;
      country_code?: string;
    };
    return {
      ip: data.ip,
      country: data.country_name,
      countryCode: data.country_code,
    };
  } catch {
    try {
      const res = await fetch("https://api.ipify.org?format=json", {
        signal: AbortSignal.timeout(3000),
      });
      const data = (await res.json()) as { ip?: string };
      return { ip: data.ip };
    } catch {
      return {};
    }
  }
}

export async function collect(): Promise<VpnData> {
  const [utun, ipInfo] = await Promise.all([getActiveUtun(), getExternalIp()]);

  return {
    connected: Boolean(utun),
    interface: utun ?? undefined,
    externalIp: ipInfo.ip,
    country: ipInfo.country,
    countryCode: ipInfo.countryCode,
  };
}
