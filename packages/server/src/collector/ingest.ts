import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { dnsEvents, domains, domainDaily, clientDaily } from "../db/schema.js";
import { normalizeDomain, registeredDomain } from "./domain-utils.js";
import { resolveDeviceIdByIp } from "./identity.js";
import { ensureCategorized } from "../analytics/categorization.js";
import type { RawQueryLogEntry } from "./technitium-client.js";
import type { DnsProtocol, ResponseCode } from "@netintel/shared";

const PROTOCOL_MAP: Record<string, DnsProtocol> = {
  Udp: "UDP",
  Tcp: "TCP",
  Tls: "DoT",
  Https: "DoH",
  Quic: "DoQ",
};

const RCODE_MAP: Record<string, ResponseCode> = {
  NoError: "NOERROR",
  NxDomain: "NXDOMAIN",
  ServFail: "SERVFAIL",
  Refused: "REFUSED",
};

function toIsoDate(ts: string): string {
  return ts.slice(0, 10); // YYYY-MM-DD
}

/** Ingests one Technitium query-log row into the raw + rollup tables. */
export function ingestQueryLogEntry(entry: RawQueryLogEntry): void {
  const domain = normalizeDomain(entry.qname);
  const regDomain = registeredDomain(domain);
  const protocol = PROTOCOL_MAP[entry.protocol] ?? "UDP";
  const responseCode = RCODE_MAP[entry.rcode] ?? "OTHER";
  const cached = entry.responseType === "Cached";
  const blocked = entry.responseType === "Blocked";
  const recursive = entry.responseType === "Recursive";
  const timestamp = new Date(entry.timestamp).toISOString();
  const date = toIsoDate(timestamp);

  const clientId = resolveDeviceIdByIp(entry.clientIpAddress);

  db.insert(dnsEvents)
    .values({
      timestamp,
      clientId,
      clientIp: entry.clientIpAddress,
      protocol,
      domain,
      registeredDomain: regDomain,
      queryType: (entry.qtype as any) ?? "OTHER",
      responseCode,
      cached,
      blocked,
      recursive,
      responseTimeMs: entry.responseRtt ?? 0, // only populated for Recursive lookups; 0 for Cached/Blocked/Authoritative
      answerTtl: entry.answerTtl ?? null, // real collector: still a genuine gap, see README
      upstream: entry.upstream ?? null,
      upstreamProtocol: null,
      serverInstance: "primary",
    })
    .run();

  // Upsert domains (Level 1 running record)
  db.insert(domains)
    .values({ domain, firstSeen: timestamp, lastSeen: timestamp, queryCount: 1, uniqueDays: 1 })
    .onConflictDoUpdate({
      target: domains.domain,
      set: {
        lastSeen: timestamp,
        queryCount: sql`${domains.queryCount} + 1`,
      },
    })
    .run();

  ensureCategorized(domain, regDomain);

  // Upsert domain_daily rollup (Level 2)
  // NOTE (known v0.1 simplification): uniqueClients/uniqueDomains below are
  // NOT true distinct counts yet -- they increment naively. True uniqueness
  // needs either a periodic recompute-from-raw job or a HyperLogLog sketch
  // per bucket. Tracked for the v0.2 rollup pass; raw events remain the
  // source of truth in the meantime so this is fixable retroactively.
  db.insert(domainDaily)
    .values({
      date,
      domain,
      queries: 1,
      uniqueClients: 1,
      cacheHits: cached ? 1 : 0,
      blocked: blocked ? 1 : 0,
      nxdomain: responseCode === "NXDOMAIN" ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [domainDaily.date, domainDaily.domain],
      set: {
        queries: sql`${domainDaily.queries} + 1`,
        cacheHits: sql`${domainDaily.cacheHits} + ${cached ? 1 : 0}`,
        blocked: sql`${domainDaily.blocked} + ${blocked ? 1 : 0}`,
        nxdomain: sql`${domainDaily.nxdomain} + ${responseCode === "NXDOMAIN" ? 1 : 0}`,
      },
    })
    .run();

  // Upsert client_daily rollup (Level 2)
  db.insert(clientDaily)
    .values({
      date,
      clientId,
      queries: 1,
      uniqueDomains: 1,
      blocked: blocked ? 1 : 0,
      nxdomain: responseCode === "NXDOMAIN" ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [clientDaily.date, clientDaily.clientId],
      set: {
        queries: sql`${clientDaily.queries} + 1`,
        blocked: sql`${clientDaily.blocked} + ${blocked ? 1 : 0}`,
        nxdomain: sql`${clientDaily.nxdomain} + ${responseCode === "NXDOMAIN" ? 1 : 0}`,
      },
    })
    .run();
}