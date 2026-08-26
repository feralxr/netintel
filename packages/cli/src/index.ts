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
import { securityCommand } from "./commands/security.js";
import { performanceCommand } from "./commands/performance.js";
import { protocolCommand } from "./commands/protocol.js";
import { dhcpCommand } from "./commands/dhcp.js";
import { systemCommand } from "./commands/system.js";
import { reportCommand } from "./commands/report.js";
import { behavioralCommand } from "./commands/behavioral.js";
import { configCommand } from "./commands/config.js";
import { CHART_STYLES } from "./config.js";

const program = new Command();

program
  .name("netintel")
  .description("Personal Network Intelligence CLI — self-hosted DNS observability, built on Technitium DNS Server.")
  .version("1.4.0")
  .option("--chart <style>", `chart style for time-series charts: ${CHART_STYLES.join("|")} (overrides the persisted default for this run only)`)
  .option("--json", "print raw JSON instead of formatted output, for scripting/piping (watch prints one JSON object per line)");

program.command("status").description("Engine health, live device count, uptime").action(statusCommand);

program.command("devices").description("List live devices, idle detection, vendor hints, query-rate ranking").action(devicesCommand);

program
  .command("domain <domain>")
  .description("Full metric drill-down for a single domain")
  .action(domainCommand);

program.command("security").description("Security signals: NXDOMAIN, entropy, tunneling heuristics, blocklist attribution, and more").action(securityCommand);

program.command("performance").description("DNS/cache/upstream performance, per-client latency, protocol feature usage").action(performanceCommand);

program.command("protocol").description("Query type mix, IPv4/IPv6 split, CNAME depth, PTR volume, DoH/DoT/DoQ bypass attempts").action(protocolCommand);

program.command("dhcp").description("DHCP lease churn, duration, identity continuity, DHCP-to-DNS activity gap").action(dhcpCommand);

program.command("system").description("Capacity forecasts and infrastructure health (host resources, restarts, collector uptime)").action(systemCommand);

program.command("report").description("Weekly/monthly reports, category momentum, domain churn/retention, storage footprint").action(reportCommand);

program.command("behavioral").description("Routine detection, periodicity, session overlap, recurring domain sequences").action(behavioralCommand);

program
  .command("config [key] [value]")
  .description("View or set CLI config (currently: chart-style)")
  .action(configCommand);

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
