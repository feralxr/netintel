import { describe, it, expect } from "vitest";
import { db } from "../db/client.js";
import { dnsEvents } from "../db/schema.js";
import { cachePerformance, networkReliability } from "./performance.js";
import { nxdomainAnalysis } from "./security-metrics.js";
import { weeklyReport } from "./reporting.js";

// cachePerformance/networkReliability/nxdomainAnalysis intentionally scan
// the WHOLE dns_events table with no per-test filter — that's their real
// job. Since this test file shares one DB with the rest of the suite
// (see test-db-path.ts), correctness here is verified via BEFORE/AFTER
// deltas from a known set of inserted rows, rather than asserting on an
// absolute total that other test files' rows would also contribute to.
// This is what the recent SQL rewrite of these functions needs verified —
// not just that they're fast, but that they're still correct.

function insertEvent(overrides: Partial<typeof dnsEvents.$inferInsert>) {
  db.insert(dnsEvents)
    .values({
      timestamp: new Date().toISOString(),
      clientId: null,
      clientIp: "192.168.1.10",
      protocol: "UDP",
      domain: "sql-rewrite-test.example",
      registeredDomain: "sql-rewrite-test.example",
      queryType: "A",
      responseCode: "NOERROR",
      cached: false,
      blocked: false,
      recursive: true,
      responseTimeMs: 10,
      ...overrides,
    })
    .run();
}

describe("cachePerformance (SQL-aggregated)", () => {
  it("total and cache-hit counts increase by exactly what was inserted", () => {
    const before = cachePerformance();
    insertEvent({ cached: true });
    insertEvent({ cached: true });
    insertEvent({ cached: false });
    const after = cachePerformance();

    expect(after.totalQueries - before.totalQueries).toBe(3);
    expect(after.cacheHits - before.cacheHits).toBe(2);
  });

  it("cacheHitRate is internally consistent with the counts it reports", () => {
    const result = cachePerformance();
    expect(result.cacheHitRate).toBeCloseTo(result.totalQueries > 0 ? result.cacheHits / result.totalQueries : 0, 10);
  });
});

describe("networkReliability (SQL-aggregated)", () => {
  it("failed-query count increases only for SERVFAIL/REFUSED/OTHER, not NOERROR", () => {
    const before = networkReliability();
    insertEvent({ responseCode: "SERVFAIL" });
    insertEvent({ responseCode: "REFUSED" });
    insertEvent({ responseCode: "NOERROR" }); // should NOT count as failed
    const after = networkReliability();

    expect(after.totalQueries - before.totalQueries).toBe(3);
    expect(after.failedQueries - before.failedQueries).toBe(2);
  });
});

describe("nxdomainAnalysis (SQL-aggregated + GROUP BY)", () => {
  it("nxdomainCount increases by exactly the number of NXDOMAIN rows inserted", () => {
    const before = nxdomainAnalysis();
    insertEvent({ responseCode: "NXDOMAIN" });
    insertEvent({ responseCode: "NXDOMAIN" });
    insertEvent({ responseCode: "NOERROR" }); // should not count
    const after = nxdomainAnalysis();

    expect(after.nxdomainCount - before.nxdomainCount).toBe(2);
    expect(after.totalQueries - before.totalQueries).toBe(3);
  });

  it("a domain with a large, distinctive NXDOMAIN volume appears in the top-10 GROUP BY result", () => {
    // Timestamped 30 days ago, well outside weeklyReport's week window
    // below — this test only cares about nxdomainAnalysis's all-time GROUP
    // BY, not about being "this week", and keeping it out of the current
    // week avoids skewing the peak-hour test that runs later in this file.
    const oldTimestamp = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const dominantDomain = "nxdomain-dominant-test.example";
    for (let i = 0; i < 500; i++) {
      insertEvent({ domain: dominantDomain, responseCode: "NXDOMAIN", timestamp: oldTimestamp });
    }
    const result = nxdomainAnalysis();
    const entry = result.topNxDomains.find((d) => d.domain === dominantDomain);
    expect(entry).toBeDefined();
    expect(entry!.count).toBeGreaterThanOrEqual(500);
  });
});

describe("weeklyReport — peak/quiet hour scoped to the report's own week", () => {
  it("runs without throwing and returns a well-shaped result", () => {
    // Doesn't assert on totalQueries/uniqueDomains here — those come from
    // domain_daily, which trends.test.ts has exclusive ownership of in
    // this shared test DB. This test only exercises the dns_events-scoped
    // peak/quiet-hour computation that was actually changed.
    const result = weeklyReport();
    expect(typeof result.peakHour).toBe("number");
    expect(result.peakHour).toBeGreaterThanOrEqual(0);
    expect(result.peakHour).toBeLessThanOrEqual(23);
    expect(typeof result.quietHour).toBe("number");
  });

  it("peakHour reflects a concentration of recent events at a specific hour", () => {
    // Insert a dominant burst of events all timestamped at the same
    // UTC hour, recently (within the report's week window), and confirm
    // that hour is reported back as the peak.
    const now = new Date();
    const targetHour = (now.getUTCHours() + 1) % 24; // an hour unlikely to already dominate from other tests' incidental inserts
    const targetDate = new Date(now);
    targetDate.setUTCHours(targetHour, 15, 0, 0);
    // If setting the hour pushed us into the future relative to "now", step back a day so it's still within the week window.
    if (targetDate.getTime() > now.getTime()) targetDate.setUTCDate(targetDate.getUTCDate() - 1);

    for (let i = 0; i < 200; i++) {
      insertEvent({ timestamp: new Date(targetDate.getTime() + i * 1000).toISOString() });
    }

    const result = weeklyReport();
    expect(result.peakHour).toBe(targetHour);
  });
});
