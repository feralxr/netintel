#!/usr/bin/env node
import "dotenv/config"; // loads .env from cwd (or packages/cli/.env if run from there) before anything reads process.env
import { Command } from "commander";
import chalk from "chalk";
import { statusCommand } from "./commands/status.js";
import { devicesCommand } from "./commands/devices.js";
import { domainCommand } from "./commands/domain.js";
import { explainCommand } from "./commands/explain.js";
import { notificationsCommand } from "./commands/notifications.js";
import { watchCommand } from "./commands/watch.js";
import { exportCommand } from "./commands/export.js";

const program = new Command();

program
  .name("netintel")
  .description("Personal Network Intelligence CLI — self-hosted DNS observability, built on Technitium DNS Server.")
  .version("0.1.0");

program.command("status").description("Engine health, live device count, uptime").action(statusCommand);

program.command("devices").description("List live devices currently on the LAN").action(devicesCommand);

program
  .command("domain <domain>")
  .description("Full metric drill-down for a single domain")
  .action(domainCommand);

program
  .command("explain [metricOrGroup]")
  .description("Explain any metric (or list a metric group) — same descriptions shown in the web dashboard")
  .action(explainCommand);

program.command("notifications").description("Categorized notification feed").action(notificationsCommand);

program.command("watch").description("Live streaming view of notifications and events").action(watchCommand);

program
  .command("export")
  .description("Export data at a given privacy level and format")
  .requiredOption("--level <1-4>", "privacy level: 1 full, 2 pseudonymized, 3 aggregated, 4 anonymous research")
  .option("--format <format>", "json | csv | md | html | sqlite | parquet | pdf (sqlite only valid at --level 1)", "json")
  .option("--out <path>", "output file path")
  .action(exportCommand);

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red(`\nError: ${err.message}\n`));
  process.exitCode = 1;
});
