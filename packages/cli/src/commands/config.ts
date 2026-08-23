import chalk from "chalk";
import { loadConfig, saveConfig, isChartStyle, CHART_STYLES, CONFIG_PATH } from "../config.js";

export function configCommand(key?: string, value?: string): void {
  if (!key) {
    const config = loadConfig();
    console.log(chalk.bold("\nnetintel CLI config\n"));
    console.log(`  chart-style   ${chalk.cyan(config.chartStyle)}`);
    console.log(chalk.dim(`\n  stored at ${CONFIG_PATH}`));
    console.log(chalk.dim(`  available chart styles: ${CHART_STYLES.join(", ")}`));
    console.log(chalk.dim(`  override for a single run with --chart <style>\n`));
    return;
  }

  if (key !== "chart-style") {
    console.log(chalk.red(`\nUnknown config key: "${key}"`));
    console.log(chalk.dim(`Currently the only setting is chart-style.\n`));
    return;
  }

  if (!value) {
    console.log(chalk.red(`\nUsage: netintel config chart-style <${CHART_STYLES.join("|")}>\n`));
    return;
  }

  if (!isChartStyle(value)) {
    console.log(chalk.red(`\nUnknown chart style: "${value}". Choose one of: ${CHART_STYLES.join(", ")}\n`));
    return;
  }

  const config = loadConfig();
  config.chartStyle = value;
  saveConfig(config);
  console.log(chalk.green(`\nchart-style set to "${value}"\n`));
}
