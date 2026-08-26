import chalk from "chalk";
import Table from "cli-table3";
import { METRICS, getMetric, getMetricsByGroup, type MetricGroup } from "@netintel/shared";
import { isJsonMode } from "../config.js";

export function explainCommand(idOrGroup?: string): void {
  const json = isJsonMode();

  if (!idOrGroup) {
    if (json) {
      console.log(JSON.stringify(METRICS, null, 2));
      return;
    }
    console.log(chalk.bold(`\nAll ${METRICS.length} metrics (run 'netintel explain <id>' for details)\n`));
    const table = new Table({ head: ["#", "id", "name", "group"] });
    for (const m of METRICS) table.push([m.number, m.id, m.name, m.group]);
    console.log(table.toString() + "\n");
    return;
  }

  const asGroup = getMetricsByGroup(idOrGroup as MetricGroup);
  if (asGroup.length > 0) {
    if (json) {
      console.log(JSON.stringify(asGroup, null, 2));
      return;
    }
    console.log(chalk.bold(`\n${idOrGroup} metrics\n`));
    for (const m of asGroup) {
      console.log(`  ${chalk.cyan(m.id)} — ${m.name}`);
    }
    console.log();
    return;
  }

  const metric = getMetric(idOrGroup);
  if (!metric) {
    if (json) {
      console.log(JSON.stringify({ error: `Unknown metric or group: "${idOrGroup}"` }, null, 2));
      return;
    }
    console.log(chalk.red(`\nUnknown metric or group: "${idOrGroup}"`));
    console.log(`Run ${chalk.dim("netintel explain")} with no arguments to list all metrics.\n`);
    return;
  }

  if (json) {
    console.log(JSON.stringify(metric, null, 2));
    return;
  }

  console.log(chalk.bold(`\n#${metric.number} ${metric.name}`) + chalk.dim(` (${metric.group})\n`));
  console.log(`  ${metric.description}\n`);
  if (metric.formula) {
    console.log(chalk.dim("  Formula:"));
    console.log(`  ${chalk.yellow(metric.formula)}\n`);
  }
}
