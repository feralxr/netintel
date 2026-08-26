import chalk from "chalk";
import { loadConfig, saveConfig, isChartStyle, CHART_STYLES, CONFIG_PATH, isJsonMode } from "../config.js";

export function configCommand(key?: string, value?: string): void {
  if (!key) {
    const config = loadConfig();
    if (isJsonMode()) {
      console.log(JSON.stringify({ ...config, configPath: CONFIG_PATH, availableChartStyles: CHART_STYLES }, null, 2));
      return;
    }
    console.log(chalk.bold("\nnetintel CLI config\n"));
    console.log(`  chart-style   ${chalk.cyan(config.chartStyle)}`);
    console.log(chalk.dim(`\n  stored at ${CONFIG_PATH}`));
    console.log(chalk.dim(`  available chart styles: ${CHART_STYLES.join(", ")}`));
    console.log(chalk.dim(`  override for a single run with --chart <style>\n`));
    return;
  }

  if (key !== "chart-style") {
    if (isJsonMode()) {
      console.log(JSON.stringify({ error: `Unknown config key: "${key}"` }, null, 2));
      return;
    }
    console.log(chalk.red(`\nUnknown config key: "${key}"`));
    console.log(chalk.dim(`Currently the only setting is chart-style.\n`));
    return;
  }

  if (!value) {
    if (isJsonMode()) {
      console.log(JSON.stringify({ error: "chart-style requires a value", availableChartStyles: CHART_STYLES }, null, 2));
      return;
    }
    console.log(chalk.red(`\nUsage: netintel config chart-style <${CHART_STYLES.join("|")}>\n`));
    return;
  }

  if (!isChartStyle(value)) {
    if (isJsonMode()) {
      console.log(JSON.stringify({ error: `Unknown chart style: "${value}"`, availableChartStyles: CHART_STYLES }, null, 2));
      return;
    }
    console.log(chalk.red(`\nUnknown chart style: "${value}". Choose one of: ${CHART_STYLES.join(", ")}\n`));
    return;
  }

  const config = loadConfig();
  config.chartStyle = value;
  saveConfig(config);
  if (isJsonMode()) {
    console.log(JSON.stringify({ ok: true, chartStyle: value }, null, 2));
    return;
  }
  console.log(chalk.green(`\nchart-style set to "${value}"\n`));
}
