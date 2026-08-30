import { describe, it, expect } from "vitest";
import { db } from "../db/client.js";
import { dnsEvents } from "../db/schema.js";
import { queryTypeDistribution, ipv4VsIpv6Mix, reverseDnsQueryVolume, malformedRefusedRate, dohDotDoqBypassAttempts, cnameChainDepth } from "./protocol.js";

function insertEvent(overrides: Partial<typeof dnsEvents.$inferInsert>) {
  db.insert(dnsEvents)
    .values({
      timestamp: new Date().toISOString(),
      clientId: "protocol-test-client",
      clientIp: "192.168.1.20",
      protocol: "UDP",
      domain: "protocol-test.example",
      registeredDomain: "protocol-test.example",
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

describe("queryTypeDistribution", () => {
  it("scoped to a single domain, only counts that domain's query types", () => {
    const domain = "query-type-scoped-test.example";
    insertEvent({ domain, queryType: "A" });
    insertEvent({ domain, queryType: "A" });
    insertEvent({ domain, queryType: "AAAA" });

    const result = queryTypeDistribution(domain);
    expect(result.totalQueries).toBe(3);
    const aEntry = result.breakdown.find((b) => b.queryType === "A");
    const aaaaEntry = result.breakdown.find((b) => b.queryType === "AAAA");
    expect(aEntry?.count).toBe(2);
    expect(aaaaEntry?.count).toBe(1);
    expect(aEntry?.share).toBeCloseTo(2 / 3, 5);
  });

  it("with no domain argument, includes queries from other domains too (network-wide)", () => {
    const domain = "query-type-networkwide-test.example";
    insertEvent({ domain, queryType: "TXT" });
    const scoped = queryTypeDistribution(domain);
    const networkWide = queryTypeDistribution();
    expect(networkWide.totalQueries).toBeGreaterThanOrEqual(scoped.totalQueries);
  });
});

describe("ipv4VsIpv6Mix", () => {
  it("classifies A queries as ipv4 and AAAA queries as ipv6", () => {
    const before = ipv4VsIpv6Mix();
    insertEvent({ queryType: "A", clientId: "ipv4-mix-test-client" });
    insertEvent({ queryType: "A", clientId: "ipv4-mix-test-client" });
    insertEvent({ queryType: "AAAA", clientId: "ipv4-mix-test-client" });
    const after = ipv4VsIpv6Mix();

    expect(after.aQueries - before.aQueries).toBe(2);
    expect(after.aaaaQueries - before.aaaaQueries).toBe(1);
  });

  it("a client that queries both A and AAAA counts as dual-stack", () => {
    const client = "dual-stack-test-client";
    insertEvent({ queryType: "A", clientId: client });
    insertEvent({ queryType: "AAAA", clientId: client });
    const result = ipv4VsIpv6Mix();
    expect(result.dualStackClients).toBeGreaterThanOrEqual(1);
  });
});

describe("reverseDnsQueryVolume", () => {
  it("counts PTR queries separately from other query types", () => {
    const before = reverseDnsQueryVolume();
    insertEvent({ queryType: "PTR", clientId: "ptr-test-client" });
    insertEvent({ queryType: "PTR", clientId: "ptr-test-client" });
    insertEvent({ queryType: "A", clientId: "ptr-test-client" });
    const after = reverseDnsQueryVolume();

    expect(after.ptrQueries - before.ptrQueries).toBe(2);
  });
});

describe("malformedRefusedRate", () => {
  it("counts only REFUSED responses, not other error codes", () => {
    const before = malformedRefusedRate();
    insertEvent({ responseCode: "REFUSED", clientId: "refused-test-client" });
    insertEvent({ responseCode: "NXDOMAIN", clientId: "refused-test-client" });
    const after = malformedRefusedRate();

    expect(after.refusedQueries - before.refusedQueries).toBe(1);
  });
});

describe("dohDotDoqBypassAttempts", () => {
  it("detects a query for a known public DoH provider hostname", () => {
    const before = dohDotDoqBypassAttempts();
    insertEvent({ domain: "cloudflare-dns.com", clientId: "doh-test-client" });
    const after = dohDotDoqBypassAttempts();

    expect(after.totalAttempts - before.totalAttempts).toBe(1);
  });

  it("does not flag an ordinary, unrelated domain", () => {
    const domain = "totally-ordinary-site.example";
    insertEvent({ domain, clientId: "doh-negative-test-client" });
    const result = dohDotDoqBypassAttempts();
    expect(result.recentAttempts.some((a) => a.domain === domain)).toBe(false);
  });
});

describe("cnameChainDepth", () => {
  it("reports honestly when answer_data is not populated, rather than fabricating a number", () => {
    const result = cnameChainDepth();
    if (!result.hasData) {
      expect(result.note).toBeTruthy();
      expect(result.avgDepth).toBeUndefined();
    } else {
      expect(typeof result.avgDepth).toBe("number");
    }
  });
});
