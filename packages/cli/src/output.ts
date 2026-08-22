import chalk from "chalk";
import Table from "cli-table3";

/** Section header used consistently across the new metric-heavy commands. */
export function section(title: string): void {
  console.log(chalk.bold.underline(`\n  ${title}`));
}

/** Renders an array of flat objects as a cli-table3 table, or a dim "no data" line. */
export function table<T>(
  rows: T[] | undefined,
  columns: { key: keyof T; label: string; format?: (v: T[keyof T]) => string }[],
  emptyMessage = "No data yet."
): void {
  if (!rows || rows.length === 0) {
    console.log(chalk.dim(`  ${emptyMessage}`));
    return;
  }
  const t = new Table({ head: columns.map((c) => c.label) });
  for (const row of rows) {
    t.push(columns.map((c) => formatCell(c.format ? c.format(row[c.key]) : row[c.key])));
  }
  console.log(t.toString());
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return chalk.dim("–");
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

/** A single labeled stat line, matching status.ts's existing left-padded style. */
export function stat(label: string, value: string | number, padTo = 24): void {
  console.log(`  ${label.padEnd(padTo)}${chalk.cyan(value)}`);
}

/** Renders a "not currently available" note consistently for honestly-flagged data gaps. */
export function noDataNote(note: string | null | undefined): void {
  if (note) console.log(chalk.dim(`  ${note}`));
}
