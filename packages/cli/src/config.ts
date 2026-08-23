import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const CHART_STYLES = ["line", "sparkline", "braille"] as const;
export type ChartStyle = (typeof CHART_STYLES)[number];

const CONFIG_DIR = path.join(os.homedir(), ".netintel");
const CONFIG_PATH = path.join(CONFIG_DIR, "cli-config.json");

interface CliConfig {
  chartStyle: ChartStyle;
}

const DEFAULT_CONFIG: CliConfig = { chartStyle: "line" };

export function loadConfig(): CliConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: CliConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export function isChartStyle(value: string): value is ChartStyle {
  return (CHART_STYLES as readonly string[]).includes(value);
}

/**
 * Resolves the chart style for this invocation: an explicit `--chart <style>`
 * flag anywhere in argv wins, otherwise falls back to the persisted config
 * (set via `netintel config chart-style <style>`), otherwise "line".
 * Reads argv directly rather than going through commander's option parsing
 * so every command can call this without each one having to declare and
 * thread through its own --chart option.
 */
export function resolveChartStyle(): ChartStyle {
  const idx = process.argv.indexOf("--chart");
  const flagValue = idx !== -1 ? process.argv[idx + 1] : undefined;
  if (flagValue && isChartStyle(flagValue)) return flagValue;
  return loadConfig().chartStyle;
}

export { CONFIG_PATH };
