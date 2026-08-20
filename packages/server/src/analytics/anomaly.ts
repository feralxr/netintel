import { db } from "../db/client.js";
import { domainDaily } from "../db/schema.js";
import { mean, stddev } from "./stats.js";
import { emitNotification } from "../notifications/engine.js";

const MIN_BASELINE_DAYS = 5; // below this, we don't have a real baseline yet

interface DailyTotals {
  date: string;
  queries: number;
  blocked: number;
  nxdomain: number;
  cacheHits: number;
}

function dailyTotals(): DailyTotals[] {
  const rows = db.select().from(domainDaily).all();
  const byDate = new Map<string, DailyTotals>();
  for (const r of rows) {
    const bucket = byDate.get(r.date) ?? { date: r.date, queries: 0, blocked: 0, nxdomain: 0, cacheHits: 0 };
    bucket.queries += r.queries;
    bucket.blocked += r.blocked;
    bucket.nxdomain += r.nxdomain;
    bucket.cacheHits += r.cacheHits;
    byDate.set(r.date, bucket);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// -----------------------------------------------------------------------
// Metric #30 — Behavioral Anomaly Detection
//   Builds a baseline from historical daily totals and compares today
//   against it across several metric streams at once.
// -----------------------------------------------------------------------
export function behavioralBaseline() {
  const totals = dailyTotals();
  if (totals.length < MIN_BASELINE_DAYS + 1) {
    return {
      hasBaseline: false,
      note: `Need at least ${MIN_BASELINE_DAYS} days of history before a behavioral baseline is meaningful (have ${Math.max(0, totals.length - 1)}).`,
      streams: null,
    };
  }

  const historical = totals.slice(0, -1); // everything except today
  const today = totals[totals.length - 1];

  const nxRate = (t: DailyTotals) => (t.queries > 0 ? t.nxdomain / t.queries : 0);
  const blockRate = (t: DailyTotals) => (t.queries > 0 ? t.blocked / t.queries : 0);

  const streams = {
    queries: baselineCompare(historical.map((t) => t.queries), today.queries),
    nxRate: baselineCompare(historical.map(nxRate), nxRate(today)),
    blockRate: baselineCompare(historical.map(blockRate), blockRate(today)),
  };

  return { hasBaseline: true, note: null, streams };
}

function baselineCompare(historicalValues: number[], currentValue: number) {
  const m = mean(historicalValues);
  const sd = stddev(historicalValues);
  const z = sd > 0 ? (currentValue - m) / sd : 0;
  return { baselineMean: m, baselineStddev: sd, currentValue, zScore: z, deviating: Math.abs(z) > 2 };
}

// -----------------------------------------------------------------------
// Metric #31 — Z-Score Anomaly Detection
//   z = (x - mean) / stddev ; |z| > 3 flagged as a candidate strong anomaly.
//   Explicitly a candidate signal, never proof of compromise.
// -----------------------------------------------------------------------
export interface Anomaly {
  stream: string;
  zScore: number;
  currentValue: number;
  baselineMean: number;
}

export function detectZScoreAnomalies(): { hasBaseline: boolean; note: string | null; anomalies: Anomaly[] } {
  const baseline = behavioralBaseline();
  if (!baseline.hasBaseline || !baseline.streams) {
    return { hasBaseline: false, note: baseline.note, anomalies: [] };
  }

  const anomalies: Anomaly[] = [];
  for (const [stream, result] of Object.entries(baseline.streams)) {
    if (Math.abs(result.zScore) > 3) {
      anomalies.push({
        stream,
        zScore: result.zScore,
        currentValue: result.currentValue,
        baselineMean: result.baselineMean,
      });
    }
  }
  return { hasBaseline: true, note: null, anomalies };
}

/** Runs detection and emits a notification for any new strong anomaly. Call periodically, not per-request. */
const alreadyNotifiedToday = new Set<string>(); // "YYYY-MM-DD:stream" — avoids re-notifying every scheduler tick for the same ongoing anomaly

export function runAnomalyDetectionAndNotify(): void {
  const { anomalies } = detectZScoreAnomalies();
  const today = new Date().toISOString().slice(0, 10);

  for (const a of anomalies) {
    const key = `${today}:${a.stream}`;
    if (alreadyNotifiedToday.has(key)) continue;
    alreadyNotifiedToday.add(key);

    emitNotification({
      category: "security",
      severity: "warning",
      title: `Anomaly detected in ${a.stream}`,
      explanation: `${a.stream} is at ${a.currentValue.toFixed(2)} today vs. a baseline average of ${a.baselineMean.toFixed(2)} (z-score ${a.zScore.toFixed(2)}). This is a statistical candidate, not confirmed proof of an issue.`,
      metricId: "zscore_anomaly_detection",
    });
  }
}
