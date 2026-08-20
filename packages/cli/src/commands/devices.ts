import Table from "cli-table3";
import chalk from "chalk";
import type { Device } from "@netintel/shared";
import { apiGet } from "../api-client.js";

export async function devicesCommand(): Promise<void> {
  const devices = await apiGet<Device[]>("/api/devices");
  console.log(chalk.bold(`\nLive devices on LAN (${devices.length})\n`));

  if (devices.length === 0) {
    console.log(chalk.dim("  No active devices yet — waiting on DHCP/query-log sync.\n"));
    return;
  }

  const table = new Table({ head: ["Hostname", "IP", "MAC", "First seen", "Last seen"] });
  for (const d of devices) {
    table.push([
      d.hostname ?? chalk.dim("unknown"),
      d.currentIp ?? chalk.dim("-"),
      d.mac ?? chalk.dim("-"),
      new Date(d.firstSeen).toLocaleString(),
      new Date(d.lastSeen).toLocaleString(),
    ]);
  }
  console.log(table.toString() + "\n");
}
