import { exec } from "child_process";
import { promisify } from "util";
import type { DevicesData, DeviceItem } from "@/lib/types";

const execAsync = promisify(exec);

interface UsbItem {
  _name?: string;
  manufacturer?: string;
  product_id?: string;
  _items?: UsbItem[];
}

interface BtItem {
  device_address?: string;
  device_name?: string;
  device_isconnected?: string;
}

interface BtProfileHub {
  device_title?: string;
  device_connected?: Array<Record<string, BtItem>>;
  device_not_connected?: Array<Record<string, BtItem>>;
}

function flattenUsb(items: UsbItem[], out: DeviceItem[] = []): DeviceItem[] {
  for (const it of items) {
    if (it._name && !it._name.toLowerCase().includes("hub") && !it._name.toLowerCase().includes("bus")) {
      out.push({
        name: it._name,
        type: "usb",
        detail: it.manufacturer,
      });
    }
    if (it._items) flattenUsb(it._items, out);
  }
  return out;
}

async function getUsb(): Promise<DeviceItem[]> {
  try {
    const { stdout } = await execAsync("system_profiler SPUSBDataType -json", {
      timeout: 8000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const data = JSON.parse(stdout) as { SPUSBDataType?: UsbItem[] };
    return flattenUsb(data.SPUSBDataType ?? []);
  } catch {
    return [];
  }
}

async function getBluetooth(): Promise<DeviceItem[]> {
  try {
    const { stdout } = await execAsync("system_profiler SPBluetoothDataType -json", {
      timeout: 8000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const data = JSON.parse(stdout) as { SPBluetoothDataType?: BtProfileHub[] };
    const connected: DeviceItem[] = [];
    for (const hub of data.SPBluetoothDataType ?? []) {
      for (const group of hub.device_connected ?? []) {
        for (const [name, item] of Object.entries(group)) {
          connected.push({
            name,
            type: "bluetooth",
            detail: item?.device_address,
          });
        }
      }
    }
    return connected;
  } catch {
    return [];
  }
}

async function getNetwork(): Promise<DeviceItem[]> {
  try {
    const { stdout } = await execAsync("arp -an", { timeout: 3000 });
    const devices: DeviceItem[] = [];
    for (const line of stdout.split("\n")) {
      const match = line.match(/\(([^)]+)\) at ([\da-f:]+) on/i);
      if (match && !match[2].includes("incomplete")) {
        devices.push({
          name: match[1],
          type: "network",
          detail: match[2],
        });
      }
    }
    return devices;
  } catch {
    return [];
  }
}

export async function collect(): Promise<DevicesData> {
  const [usb, bluetooth, network] = await Promise.all([getUsb(), getBluetooth(), getNetwork()]);
  return { usb, bluetooth, network };
}
