import * as asciichart from "asciichart";
import chalk from "chalk";
import type { ChartStyle } from "../config.js";

const SPARK_BLOCKS = "▁▂▃▄▅▆▇█";
const ASCIICHART_COLORS = [asciichart.cyan, asciichart.yellow, asciichart.magenta, asciichart.green, asciichart.red];

export interface Series {
  label: string;
  values: number[];
}

/** Renders one or more named series as a full-height asciichart line plot with a legend. */
function renderLine(series: Series[], height: number): string {
  const plot = asciichart.plot(
    series.map((s) => s.values),
    { height, colors: series.map((_, i) => ASCIICHART_COLORS[i % ASCIICHART_COLORS.length]) }
  );
  const legend =
    series.length > 1
      ? "\n  " + series.map((s, i) => chalk.hex(colorHexFor(i))(`■ ${s.label}`)).join("   ")
      : "";
  return plot + legend;
}

// Rough hex approximations of asciichart's ANSI colors, only used for the legend text.
function colorHexFor(i: number): string {
  return ["#4dd0e1", "#ffd54f", "#ba68c8", "#81c784", "#e57373"][i % 5];
}

/** Compact single-row block-character sparkline — one per series, stacked with labels. */
function renderSparkline(series: Series[]): string {
  return series
    .map((s) => {
      const { values, label } = s;
      if (values.length === 0) return `  ${label}: ${chalk.dim("no data")}`;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      const line = values
        .map((v) => SPARK_BLOCKS[Math.min(SPARK_BLOCKS.length - 1, Math.floor(((v - min) / range) * (SPARK_BLOCKS.length - 1)))])
        .join("");
      return `  ${label.padEnd(12)} ${chalk.cyan(line)}  ${chalk.dim(`(${min.toFixed(1)}–${max.toFixed(1)})`)}`;
    })
    .join("\n");
}

// Braille dot bit positions within a 2-wide x 4-tall cell, standard Unicode braille layout.
const BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];
const BRAILLE_BASE = 0x2800;

/**
 * Hand-rolled braille dot-matrix line plot (drawille-style). Each character
 * cell packs a 2x4 dot grid, giving roughly 2x the horizontal and vertical
 * resolution of the block sparkline in the same terminal space — reads more
 * like an actual line curve than a bar-height strip. Consecutive x-columns
 * are connected with a vertical run of dots so the line looks continuous
 * rather than a scatter of single points.
 */
function renderBraille(series: Series[], widthCols: number, heightRows: number): string {
  return series
    .map((s) => {
      const { values, label } = s;
      if (values.length < 2) return `  ${label}: ${chalk.dim("not enough data points")}`;

      const dotWidth = widthCols * 2;
      const dotHeight = heightRows * 4;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;

      // Interpolate the series onto dotWidth pixel-columns, then map each to a dot row.
      const dotRows: number[] = [];
      for (let px = 0; px < dotWidth; px++) {
        const t = (px / (dotWidth - 1)) * (values.length - 1);
        const i0 = Math.floor(t);
        const i1 = Math.min(values.length - 1, i0 + 1);
        const frac = t - i0;
        const v = values[i0] + (values[i1] - values[i0]) * frac;
        const normalized = (v - min) / range; // 0..1, 0 = bottom
        dotRows.push(Math.min(dotHeight - 1, Math.round((1 - normalized) * (dotHeight - 1))));
      }

      // Vertical-run fill between consecutive columns so the plot reads as a connected line.
      const grid: boolean[][] = Array.from({ length: dotHeight }, () => Array(dotWidth).fill(false));
      for (let px = 0; px < dotWidth; px++) {
        const y = dotRows[px];
        grid[y][px] = true;
        if (px > 0) {
          const prevY = dotRows[px - 1];
          const [lo, hi] = prevY < y ? [prevY, y] : [y, prevY];
          for (let yy = lo; yy <= hi; yy++) grid[yy][px] = true;
        }
      }

      let out = "";
      for (let cellRow = 0; cellRow < heightRows; cellRow++) {
        let line = "";
        for (let cellCol = 0; cellCol < widthCols; cellCol++) {
          let byte = 0;
          for (let sub = 0; sub < 4; sub++) {
            const y = cellRow * 4 + sub;
            for (let col = 0; col < 2; col++) {
              const x = cellCol * 2 + col;
              if (grid[y]?.[x]) byte |= BRAILLE_BITS[sub][col];
            }
          }
          line += String.fromCodePoint(BRAILLE_BASE + byte);
        }
        out += (cellRow === 0 ? `  ${label.padEnd(12)} ` : " ".repeat(15)) + chalk.cyan(line) + "\n";
      }
      return out.trimEnd();
    })
    .join("\n");
}

/**
 * Renders time-series data in whichever style is active (line/sparkline/braille
 * — see config.ts::resolveChartStyle). This is the single entry point every
 * command should use for trend/time-series charts, so switching styles via
 * `--chart <style>` or `netintel config chart-style <style>` affects every
 * chart in the CLI uniformly.
 */
export function renderTimeSeries(series: Series[], style: ChartStyle, opts: { height?: number; width?: number } = {}): string {
  const nonEmpty = series.filter((s) => s.values.length > 0);
  if (nonEmpty.length === 0) return chalk.dim("  No data yet.");

  switch (style) {
    case "sparkline":
      return renderSparkline(nonEmpty);
    case "braille":
      return renderBraille(nonEmpty, opts.width ?? 40, opts.height ?? 4);
    case "line":
    default:
      return renderLine(nonEmpty, opts.height ?? 10);
  }
}
