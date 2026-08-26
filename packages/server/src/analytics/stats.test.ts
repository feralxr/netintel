import { describe, it, expect } from "vitest";
import { mean, stddev, percentile, median, distribution, shannonEntropy, hhi } from "./stats.js";

describe("mean", () => {
  it("computes the arithmetic mean", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });
  it("returns 0 for an empty array rather than NaN", () => {
    expect(mean([])).toBe(0);
  });
});

describe("stddev", () => {
  it("computes population standard deviation", () => {
    // [2,4,4,4,5,5,7,9] has a well-known stddev of 2
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5);
  });
  it("returns 0 for fewer than 2 values rather than NaN", () => {
    expect(stddev([5])).toBe(0);
    expect(stddev([])).toBe(0);
  });
});

describe("percentile / median", () => {
  it("returns exact values at the boundaries", () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 100)).toBe(50);
  });
  it("interpolates between values for non-boundary percentiles", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5, 5);
  });
  it("median matches percentile(50)", () => {
    const values = [7, 1, 5, 3, 9];
    expect(median(values)).toBe(percentile(values, 50));
  });
  it("is order-independent (sorts internally)", () => {
    expect(percentile([5, 1, 3], 50)).toBe(percentile([1, 3, 5], 50));
  });
});

describe("distribution", () => {
  it("returns all-zero shape for empty input rather than throwing", () => {
    const d = distribution([]);
    expect(d).toEqual({ mean: 0, median: 0, p25: 0, p75: 0, p95: 0, min: 0, max: 0, stddev: 0, count: 0 });
  });
  it("computes a consistent full distribution", () => {
    const d = distribution([1, 2, 3, 4, 5]);
    expect(d.count).toBe(5);
    expect(d.min).toBe(1);
    expect(d.max).toBe(5);
    expect(d.mean).toBe(3);
    expect(d.median).toBe(3);
  });
});

describe("shannonEntropy", () => {
  it("is 0 for a single-outcome distribution (no uncertainty)", () => {
    expect(shannonEntropy([10])).toBe(0);
  });
  it("is exactly 1 bit for a fair two-outcome split", () => {
    expect(shannonEntropy([50, 50])).toBeCloseTo(1, 5);
  });
  it("is exactly log2(4) = 2 bits for a fair four-way split", () => {
    expect(shannonEntropy([25, 25, 25, 25])).toBeCloseTo(2, 5);
  });
  it("returns 0 for all-zero counts rather than NaN/-Infinity", () => {
    expect(shannonEntropy([0, 0, 0])).toBe(0);
  });
  it("ignores zero-count buckets without them corrupting the sum", () => {
    // Same effective distribution as [50,50] once the zero bucket is ignored.
    expect(shannonEntropy([50, 50, 0])).toBeCloseTo(1, 5);
  });
});

describe("hhi", () => {
  it("is 1 for a single-player monopoly (maximum concentration)", () => {
    expect(hhi([1])).toBe(1);
  });
  it("is 1/n for n equal shares (minimum concentration for n players)", () => {
    expect(hhi([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.25, 5);
  });
  it("is higher for a more concentrated distribution with the same number of players", () => {
    const concentrated = hhi([0.7, 0.1, 0.1, 0.1]);
    const even = hhi([0.25, 0.25, 0.25, 0.25]);
    expect(concentrated).toBeGreaterThan(even);
  });
});
