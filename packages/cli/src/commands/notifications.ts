import chalk from "chalk";
import type { Notification, NotificationSeverity } from "@netintel/shared";
import { apiGet } from "../api-client.js";
import { isJsonMode } from "../config.js";

const SEVERITY_COLOR: Record<NotificationSeverity, (s: string) => string> = {
  info: chalk.blue,
  warning: chalk.yellow,
  critical: chalk.red,
};

export async function notificationsCommand(): Promise<void> {
  const items = await apiGet<Notification[]>("/api/notifications?limit=30");

  if (isJsonMode()) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  console.log(chalk.bold(`\nNotifications (${items.length})\n`));

  if (items.length === 0) {
    console.log(chalk.dim("  Nothing yet.\n"));
    return;
  }

  const groups: Record<string, Notification[]> = {};
  for (const n of items) {
    (groups[n.category] ??= []).push(n);
  }

  for (const [category, list] of Object.entries(groups)) {
    console.log(chalk.bold.underline(`\n  ${category}`));
    for (const n of list) {
      const color = SEVERITY_COLOR[n.severity];
      console.log(`  ${color("●")} ${n.title}`);
      console.log(`    ${chalk.dim(n.explanation)}`);
      console.log(`    ${chalk.dim(new Date(n.timestamp).toLocaleString())}`);
    }
  }
  console.log();
}
