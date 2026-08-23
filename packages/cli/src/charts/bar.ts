import chalk from "chalk";

const BAR_CHAR = "█";

export interface BarEntry {
  label: string;
  value: number;
}

/**
 * Horizontal bar chart using block characters, auto-scaled to the largest
 * value. For category/distribution data (query types, category shares,
 * top offenders) rather than time-series — see charts/timeseries.ts for
 * trend charts. Not style-switchable like time-series charts; a single
 * horizontal bar is already the clearest terminal-native fit for ranked
 * categorical data, so there's no meaningful alternate "style" to offer.
 */
export function renderBarChart(entries: BarEntry[], opts: { maxWidth?: number; valueFormatter?: (v: number) => string; color?: (s: string) => string } = {}): string {
  if (entries.length === 0) return chalk.dim("  No data yet.");

  const maxWidth = opts.maxWidth ?? 30;
  const color = opts.color ?? chalk.cyan;
  const format = opts.valueFormatter ?? ((v: number) => String(v));
  const maxLabelLen = Math.max(...entries.map((e) => e.label.length));
  const maxValue = Math.max(...entries.map((e) => e.value), 1);

  return entries
    .map((e) => {
      const barLen = Math.max(e.value > 0 ? 1 : 0, Math.round((e.value / maxValue) * maxWidth));
      const bar = BAR_CHAR.repeat(barLen);
      return `  ${e.label.padEnd(maxLabelLen)} ${color(bar)} ${chalk.dim(format(e.value))}`;
    })
    .join("\n");
}
