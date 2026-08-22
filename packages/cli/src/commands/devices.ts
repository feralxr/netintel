import Table from "cli-table3";
import chalk from "chalk";
import type { Device } from "@netintel/shared";
import { apiGet } from "../api-client.js";
import { section, table, noDataNote } from "../output.js";

interface IdleDevice {
  hostname: string | null;
  idleHours: number;
}
interface VendorHint {
  deviceId: string;
  vendorHint: string | null;
}
interface RateRank {
  deviceId: string;
  queries: number;
  percentileRank: number;
}

export async function devicesCommand(): Promise<void> {
  const devices = await apiGet<Device[]>("/api/devices");
  const [idle, vendors, rateRank] = await Promise.all([
    apiGet<IdleDevice[]>("/api/devices/idle"), // #70
    apiGet<VendorHint[]>("/api/devices/vendor-hints"), // #72
    apiGet<RateRank[]>("/api/devices/rate-rank"), // #73
  ]);

  console.log(chalk.bold(`\nLive devices on LAN (${devices.length})\n`));

  if (devices.length === 0) {
    console.log(chalk.dim("  No active devices yet — waiting on DHCP/query-log sync.\n"));
    return;
  }

  const vendorByDevice = new Map(vendors.map((v) => [v.deviceId, v.vendorHint]));
  const rankByDevice = new Map(rateRank.map((r) => [r.deviceId, r]));

  const t = new Table({ head: ["Hostname", "IP", "MAC", "Vendor hint", "Queries", "Rate %ile", "Last seen"] });
  for (const d of devices) {
    const rank = rankByDevice.get(d.deviceId);
    t.push([
      d.hostname ?? chalk.dim("unknown"),
      d.currentIp ?? chalk.dim("-"),
      d.mac ?? chalk.dim("-"),
      vendorByDevice.get(d.deviceId) ?? chalk.dim("-"),
      rank?.queries ?? chalk.dim("-"),
      rank ? `${rank.percentileRank.toFixed(0)}th` : chalk.dim("-"),
      new Date(d.lastSeen).toLocaleString(),
    ]);
  }
  console.log(t.toString() + "\n");

  section("Idle devices");
  table(
    idle.map((d) => ({ hostname: d.hostname ?? "(unknown)", idleHours: d.idleHours.toFixed(1) })),
    [
      { key: "hostname", label: "Device" },
      { key: "idleHours", label: "Idle (hours)" },
    ],
    "No idle devices — everything's been active recently."
  );
  console.log();
}
