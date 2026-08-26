import { describe, it, beforeAll, expect } from "vitest";
import { db } from "../db/client.js";
import { domainDaily } from "../db/schema.js";
import { domainChurnRate } from "./trends.js";

// domainChurnRate() scans ALL of domain_daily within the last 14 days with
// no marker/prefix filter, so — unlike domain-metrics.test.ts's
// domain-scoped burstiness tests — this test needs exclusive ownership of
// that table's recent date range within the shared test DB. It's the only
// file in the suite that touches domain_daily, by design.
describe("domainChurnRate", () => {
  beforeAll(() => {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

    const rows: (typeof domainDaily.$inferInsert)[] = [
      // Last week only (8-9 days ago) -> should count as "dropped"
      { date: day(-9), domain: "churn-dropped-1.example", queries: 5 },
      { date: day(-8), domain: "churn-dropped-2.example", queries: 3 },
      // This week only (1-2 days ago) -> should count as "added"
      { date: day(-2), domain: "churn-added-1.example", queries: 4 },
      { date: day(-1), domain: "churn-added-2.example", queries: 2 },
      // Active in both weeks -> should NOT count as churn either direction
      { date: day(-9), domain: "churn-stable.example", queries: 10 },
      { date: day(-1), domain: "churn-stable.example", queries: 12 },
    ];
    db.insert(domainDaily).values(rows).run();
  });

  it("counts domains that only appear in the earlier week as dropped", () => {
    const result = domainChurnRate();
    expect(result.dropped).toBe(2);
  });

  it("counts domains that only appear in the recent week as added", () => {
    const result = domainChurnRate();
    expect(result.added).toBe(2);
  });

  it("does not count a domain active in both weeks as churn either direction", () => {
    const result = domainChurnRate();
    expect(result.totalDomainsEitherPeriod).toBe(5); // 2 dropped + 2 added + 1 stable
    expect(result.added + result.dropped).toBe(4); // stable domain contributes to neither
  });

  it("computes churn rate as (added + dropped) / total domains either period", () => {
    const result = domainChurnRate();
    expect(result.churnRate).toBeCloseTo((result.added + result.dropped) / result.totalDomainsEitherPeriod, 10);
  });
});
