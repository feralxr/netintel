export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

export function median(values: number[]): number {
  return percentile(values, 50);
}

export interface Distribution {
  mean: number;
  median: number;
  p25: number;
  p75: number;
  p95: number;
  min: number;
  max: number;
  stddev: number;
  count: number;
}

export function distribution(values: number[]): Distribution {
  if (values.length === 0) {
    return { mean: 0, median: 0, p25: 0, p75: 0, p95: 0, min: 0, max: 0, stddev: 0, count: 0 };
  }
  // Single sort shared across every percentile lookup below, rather than
  // percentile()'s own [...values].sort() being called 3 separate times
  // (p25/p75/p95) — at real scale (hundreds of thousands of dns_events
  // rows) that was 3x more sorting work than necessary for one call.
  // min/max also no longer use Math.min(...values)/Math.max(...values):
  // spreading a large array into a function call blows JS's call-stack
  // argument limit and throws "Maximum call stack size exceeded" well
  // before a real long-running install's event count would get there —
  // confirmed by reproducing the crash directly against a 1M-row dataset.
  const sorted = [...values].sort((a, b) => a - b);
  const percentileOfSorted = (p: number): number => {
    const idx = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
  };
  return {
    mean: mean(values),
    median: percentileOfSorted(50),
    p25: percentileOfSorted(25),
    p75: percentileOfSorted(75),
    p95: percentileOfSorted(95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stddev: stddev(values),
    count: values.length,
  };
}

/** Shannon entropy in bits, given a set of counts (not pre-normalized probabilities). */
export function shannonEntropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Herfindahl-Hirschman Index over a set of shares (0-1, should sum to ~1). */
export function hhi(shares: number[]): number {
  return shares.reduce((sum, s) => sum + s * s, 0);
}
