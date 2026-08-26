import { describe, it, expect } from "vitest";
import { db } from "../db/client.js";
import { dnsEvents, domains } from "../db/schema.js";
import { domainQueryBurstiness, domainRecencyDecayScore } from "./domain-metrics.js";

function insertEvents(domain: string, timestamps: string[]) {
  db.insert(dnsEvents)
    .values(
      timestamps.map((timestamp) => ({
        timestamp,
        clientId: null,
        clientIp: "192.168.1.10",
        protocol: "UDP",
        domain,
        registeredDomain: domain,
        queryType: "A",
        responseCode: "NOERROR",
        cached: false,
        blocked: false,
        recursive: true,
        responseTimeMs: 10,
      })) as any
    )
    .run();
}

describe("domainQueryBurstiness", () => {
  it("reports no data (not an error) for a domain with too few queries", () => {
    const result = domainQueryBurstiness("test-burstiness-empty.example");
    expect(result.fanoFactor).toBeNull();
    expect(result.note).not.toBeNull();
  });

  it("computes a low Fano factor for evenly-spaced queries (regular, not bursty)", () => {
    const domain = "test-burstiness-regular.example";
    const base = Date.now() - 100 * 60_000;
    // 10 queries exactly 5 minutes apart — as regular as it gets.
    const timestamps = Array.from({ length: 10 }, (_, i) => new Date(base + i * 5 * 60_000).toISOString());
    insertEvents(domain, timestamps);

    const result = domainQueryBurstiness(domain);
    expect(result.fanoFactor).not.toBeNull();
    // Perfectly even spacing -> variance of gaps is 0 -> Fano factor is 0.
    expect(result.fanoFactor).toBeCloseTo(0, 5);
  });

  it("computes a high Fano factor for bursty, irregularly-clustered queries", () => {
    const domain = "test-burstiness-bursty.example";
    const base = Date.now() - 1000 * 60_000;
    // Two tight clusters far apart — classic bursty pattern: long gap, then
    // several near-zero gaps, then another long gap.
    const timestamps = [
      new Date(base).toISOString(),
      new Date(base + 60_000).toISOString(),
      new Date(base + 61_000).toISOString(),
      new Date(base + 62_000).toISOString(),
      new Date(base + 500 * 60_000).toISOString(),
      new Date(base + 501 * 60_000).toISOString(),
      new Date(base + 501.5 * 60_000).toISOString(),
    ];
    insertEvents(domain, timestamps);

    const result = domainQueryBurstiness(domain);
    expect(result.fanoFactor).not.toBeNull();
    expect(result.fanoFactor!).toBeGreaterThan(1); // bursty patterns have Fano >> 1
  });

  it("only considers events for the requested domain, not others", () => {
    const domainA = "test-burstiness-isolation-a.example";
    const domainB = "test-burstiness-isolation-b.example";
    insertEvents(domainA, [new Date().toISOString(), new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() - 120_000).toISOString()]);
    insertEvents(domainB, [new Date().toISOString()]); // single event, shouldn't affect domainA's result at all

    const resultA = domainQueryBurstiness(domainA);
    expect(resultA.sampleSize).toBe(2); // 3 events -> 2 gaps
  });
});

describe("domainRecencyDecayScore", () => {
  const baseRow = { domain: "x", firstSeen: "", lastSeen: "", queryCount: 1, uniqueDays: 1, popularityScore: null, lifecycleState: null } as any;

  it("is 1.0 (no decay) for a domain last seen right now", () => {
    const score = domainRecencyDecayScore({ ...baseRow, lastSeen: new Date().toISOString() });
    expect(score).toBeCloseTo(1, 5);
  });

  it("decays monotonically as days-since-last-seen increases", () => {
    const recent = domainRecencyDecayScore({ ...baseRow, lastSeen: new Date(Date.now() - 1 * 86_400_000).toISOString() });
    const older = domainRecencyDecayScore({ ...baseRow, lastSeen: new Date(Date.now() - 10 * 86_400_000).toISOString() });
    const oldest = domainRecencyDecayScore({ ...baseRow, lastSeen: new Date(Date.now() - 60 * 86_400_000).toISOString() });
    expect(recent).toBeGreaterThan(older);
    expect(older).toBeGreaterThan(oldest);
  });

  it("never goes negative or above 1 regardless of how stale the domain is", () => {
    const veryOld = domainRecencyDecayScore({ ...baseRow, lastSeen: new Date(Date.now() - 5000 * 86_400_000).toISOString() });
    expect(veryOld).toBeGreaterThanOrEqual(0);
    expect(veryOld).toBeLessThanOrEqual(1);
  });

  it("a higher lambda decays faster than a lower lambda for the same staleness", () => {
    const lastSeen = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const slow = domainRecencyDecayScore({ ...baseRow, lastSeen }, 0.05);
    const fast = domainRecencyDecayScore({ ...baseRow, lastSeen }, 0.5);
    expect(fast).toBeLessThan(slow);
  });
});
