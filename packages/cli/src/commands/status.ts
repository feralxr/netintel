import chalk from "chalk";
import type { EngineStatus } from "@netintel/shared";
import { apiGet } from "../api-client.js";
import { isJsonMode } from "../config.js";

export async function statusCommand(): Promise<void> {
  const status = await apiGet<EngineStatus>("/api/status");

  if (isJsonMode()) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(chalk.bold("\nnetintel engine status\n"));
  console.log(`  Technitium reachable   ${status.technitiumReachable ? chalk.green("yes") : chalk.red("no")}`);
  console.log(`  Collector running      ${status.collectorRunning ? chalk.green("yes") : chalk.red("no")}`);
  console.log(`  Live devices           ${chalk.cyan(status.liveDeviceCount)}`);
  console.log(`  Uptime                 ${status.uptimeSeconds}s`);
  console.log(`  Database size          ${(status.dbSizeBytes / 1024).toFixed(1)} KB`);
  console.log(`  Last event             ${status.lastEventAt ?? chalk.dim("none yet")}\n`);
}
