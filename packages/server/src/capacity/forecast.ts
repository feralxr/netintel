import { asc } from "drizzle-orm";
import { db } from "../db/client.js";
import { systemMetricsDaily } from "../db/schema.js";

interface Point {
  x: number; // day index, 0 = first day of history
  y: number;
}

/** Ordinary least squares — real linear regression, not a hand-wave. Returns null if there aren't at least 2 distinct x values. */
function linearRegression(points: Point[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null; // all x values identical, no meaningful trend

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export interface ForecastResult {
  hasData: boolean;
  note: string | null;
  historyDays: number;
  currentValue: number | null;
  dailyChangeRate: number | null; // units per day
  projected7d: number | null;
  projected30d: number | null;
}

const MIN_HISTORY_DAYS = 3;

function forecastFromSeries(series: number[]): ForecastResult {
  if (series.length < MIN_HISTORY_DAYS) {
    return {
      hasData: false,
      note: `Need at least ${MIN_HISTORY_DAYS} days of history for a meaningful forecast (have ${series.length}).`,
      historyDays: series.length,
      currentValue: series.length > 0 ? series[series.length - 1] : null,
      dailyChangeRate: null,
      projected7d: null,
      projected30d: null,
    };
  }

  const points = series.map((y, x) => ({ x, y }));
  const regression = linearRegression(points);
  if (!regression) {
    return {
      hasData: false,
      note: "Not enough variation in history to compute a trend.",
      historyDays: series.length,
      currentValue: series[series.length - 1],
      dailyChangeRate: null,
      projected7d: null,
      projected30d: null,
    };
  }

  const lastX = series.length - 1;
  return {
    hasData: true,
    note: null,
    historyDays: series.length,
    currentValue: series[series.length - 1],
    dailyChangeRate: regression.slope,
    projected7d: regression.intercept + regression.slope * (lastX + 7),
    projected30d: regression.intercept + regression.slope * (lastX + 30),
  };
}

export function forecastQueryVolume(): ForecastResult {
  const rows = db.select().from(systemMetricsDaily).orderBy(asc(systemMetricsDaily.date)).all();
  return forecastFromSeries(rows.map((r) => r.totalQueries));
}

export function forecastDbSize(): ForecastResult {
  const rows = db.select().from(systemMetricsDaily).orderBy(asc(systemMetricsDaily.date)).all();
  return forecastFromSeries(rows.map((r) => r.dbSizeBytes));
}

export function forecastDeviceCount(): ForecastResult {
  const rows = db.select().from(systemMetricsDaily).orderBy(asc(systemMetricsDaily.date)).all();
  return forecastFromSeries(rows.map((r) => r.deviceCount));
}

/** Projects days until available disk space runs out, based on DB size growth rate. Null if disk stats aren't available on this platform. */
export function forecastDiskRunout(): { hasData: boolean; note: string | null; daysUntilFull: number | null } {
  const rows = db.select().from(systemMetricsDaily).orderBy(asc(systemMetricsDaily.date)).all();
  const withDisk = rows.filter((r) => r.availableDiskBytes !== null);

  if (withDisk.length === 0) {
    return { hasData: false, note: "Disk space stats aren't available on this platform/Node version.", daysUntilFull: null };
  }

  const dbSizeForecast = forecastDbSize();
  if (!dbSizeForecast.hasData || dbSizeForecast.dailyChangeRate === null || dbSizeForecast.dailyChangeRate <= 0) {
    return { hasData: false, note: "Database isn't growing (or not enough history) — no meaningful run-out projection.", daysUntilFull: null };
  }

  const latestAvailable = withDisk[withDisk.length - 1].availableDiskBytes!;
  const daysUntilFull = latestAvailable / dbSizeForecast.dailyChangeRate;
  return { hasData: true, note: null, daysUntilFull };
}
