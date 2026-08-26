import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../db/client.js";
import { hostHealthSamples, dhcpLeaseEvents } from "../db/schema.js";
import { evaluateCondition, evaluatePolicy, type AlertCondition, type AlertPolicyDefinition } from "./policy-engine.js";

// Unique markers so this file's assertions are unambiguous even though it
// shares one real DB with other test files (see test-db-path.ts / vitest.config.ts's
// fileParallelism: false, which keeps files from interleaving writes).
const MARKER_MAC_PREFIX = "TEST:PE:";

beforeAll(() => {
  const now = new Date().toISOString();

  // A single fresh host_health_samples row with a known, distinctive
  // memory value — "latest" semantics mean whatever this test file inserts
  // last becomes the metric's current reading for the rest of this file's tests.
  db.insert(hostHealthSamples)
    .values({
      timestamp: now,
      cpuLoadAvg1m: 0.42,
      memoryUsedPercent: 87.5,
      diskAvailableBytes: 5_000_000_000,
      technitiumReachable: true,
      technitiumLastError: null,
    })
    .run();

  // DHCP churn events dated today, tagged with a unique MAC prefix so a
  // count-by-marker assertion (if ever added) can't collide with other tests.
  for (let i = 0; i < 3; i++) {
    db.insert(dhcpLeaseEvents)
      .values({
        mac: `${MARKER_MAC_PREFIX}${i}`,
        ipAddress: `10.99.0.${i}`,
        leaseObtained: now,
        leaseExpires: now,
        eventType: "new",
        recordedAt: now,
      })
      .run();
  }
});

describe("evaluateCondition — metric_snapshot", () => {
  it("breaches when the current value satisfies the comparison", () => {
    const result = evaluateCondition({
      source: "metric_snapshot",
      metricId: "host_memory_used_percent",
      comparison: { operator: "gt", threshold: 50 },
    });
    expect(result.breached).toBe(true);
    expect(result.value).toBeGreaterThan(50);
  });

  it("does not breach when the current value does not satisfy the comparison", () => {
    const result = evaluateCondition({
      source: "metric_snapshot",
      metricId: "host_memory_used_percent",
      comparison: { operator: "gt", threshold: 99.9 },
    });
    expect(result.breached).toBe(false);
  });

  it("handles every comparison operator correctly against a known value", () => {
    // memoryUsedPercent is 87.5 from beforeAll's most recent insert.
    const cases: [AlertCondition["comparison"]["operator"], number, boolean][] = [
      ["gt", 87, true],
      ["gt", 88, false],
      ["lt", 88, true],
      ["lt", 87, false],
      ["gte", 87.5, true],
      ["lte", 87.5, true],
      ["eq", 87.5, true],
      ["ne", 87.5, false],
      ["ne", 1, true],
    ];
    for (const [operator, threshold, expected] of cases) {
      const result = evaluateCondition({ source: "metric_snapshot", metricId: "host_memory_used_percent", comparison: { operator, threshold } });
      expect(result.breached, `operator=${operator} threshold=${threshold}`).toBe(expected);
    }
  });

  it("gracefully reports an unknown metric id without throwing", () => {
    const result = evaluateCondition({
      source: "metric_snapshot",
      metricId: "totally_made_up_metric_id",
      comparison: { operator: "gt", threshold: 0 },
    });
    expect(result.breached).toBe(false);
    expect(result.explanation).toContain("unknown");
  });
});

describe("evaluateCondition — backward compatibility", () => {
  it("treats a condition object with NO 'source' field at all as an explorer condition", () => {
    // This is the exact shape every policy stored before the
    // metric_snapshot type existed has — 'source' didn't exist as a field
    // yet, so it's genuinely absent, not just undefined-by-default.
    const legacyCondition = {
      query: { metric: "count" },
      windowMinutes: 1440,
      comparison: { operator: "gte", threshold: 0 },
    } as AlertCondition;

    // Should not throw, and should take the explorer path (a real query
    // against dns_events) rather than misinterpreting it as metric_snapshot.
    expect(() => evaluateCondition(legacyCondition)).not.toThrow();
    const result = evaluateCondition(legacyCondition);
    // count >= 0 over any window is always true against a real (possibly
    // empty) dns_events table — confirms it actually ran the explorer path.
    expect(result.breached).toBe(true);
  });
});

describe("evaluatePolicy — AND/OR combination logic", () => {
  const breaching: AlertCondition = { source: "metric_snapshot", metricId: "host_memory_used_percent", comparison: { operator: "gt", threshold: 50 } };
  const nonBreaching: AlertCondition = { source: "metric_snapshot", metricId: "host_memory_used_percent", comparison: { operator: "gt", threshold: 999 } };

  it("AND requires every condition to breach", () => {
    const both: AlertPolicyDefinition = { logic: "AND", conditions: [breaching, breaching] };
    const mixed: AlertPolicyDefinition = { logic: "AND", conditions: [breaching, nonBreaching] };
    expect(evaluatePolicy(both).triggered).toBe(true);
    expect(evaluatePolicy(mixed).triggered).toBe(false);
  });

  it("OR requires only one condition to breach", () => {
    const mixed: AlertPolicyDefinition = { logic: "OR", conditions: [breaching, nonBreaching] };
    const neither: AlertPolicyDefinition = { logic: "OR", conditions: [nonBreaching, nonBreaching] };
    expect(evaluatePolicy(mixed).triggered).toBe(true);
    expect(evaluatePolicy(neither).triggered).toBe(false);
  });

  it("reports the breaching value and a non-empty explanation when triggered", () => {
    const result = evaluatePolicy({ logic: "AND", conditions: [breaching] });
    expect(result.triggered).toBe(true);
    expect(result.value).not.toBeNull();
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it("reports 'no conditions breached' and a null value when nothing triggers", () => {
    const result = evaluatePolicy({ logic: "AND", conditions: [nonBreaching] });
    expect(result.triggered).toBe(false);
    expect(result.value).toBeNull();
    expect(result.explanation).toBe("no conditions breached");
  });
});
