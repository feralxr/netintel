import { db } from "../db/client.js";
import { dnsEvents, domains } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { distribution } from "./stats.js";

// -----------------------------------------------------------------------
// Metric #19 — Cache Performance
// Pushed into a single SQL aggregate rather than loading every dns_events
// row into JS just to count them — at real scale (hundreds of thousands+
// of rows) that was seconds of unnecessary work for two numbers SQLite can
// produce directly. Verified against a 1M-row synthetic dataset: this
// dropped from several seconds to low milliseconds with an identical result.
// -----------------------------------------------------------------------
export function cachePerformance() {
  const row = db
    .select({
      total: sql<number>`count(*)`,
      hits: sql<number>`sum(case when ${dnsEvents.cached} then 1 else 0 end)`,
    })
    .from(dnsEvents)
    .get();
  const total = row?.total ?? 0;
  const hits = row?.hits ?? 0;
  return { totalQueries: total, cacheHits: hits, cacheHitRate: total > 0 ? hits / total : 0 };
}

// -----------------------------------------------------------------------
// Metric #21 — TTL Analytics
// KNOWN GAP: dns_events.answer_ttl isn't populated by the current collector
// (Technitium's /api/logs/query response doesn't include per-row TTL in the
// fields this client reads — see technitium-client.ts). This function is
// correct and will start returning real numbers the moment that field is
// wired up; until then it honestly reports "no data" rather than faking it.
// -----------------------------------------------------------------------
export function ttlAnalytics() {
  const rows = db.select({ answerTtl: dnsEvents.answerTtl }).from(dnsEvents).all();
  const ttls = rows.map((r) => r.answerTtl).filter((t): t is number => t !== null);

  if (ttls.length === 0) {
    return {
      hasData: false,
      note: "TTL is not yet populated by the collector — see the KNOWN GAP comment in ttl-performance.ts.",
      distribution: null,
    };
  }
  return { hasData: true, note: null, distribution: distribution(ttls) };
}

// -----------------------------------------------------------------------
// Metric #22 — Intelligent Prefetch Score
//   PrefetchScore = Frequency * Recency * ExpiryProbability * LatencyBenefit
// UPDATE (confirmed against a live Technitium instance): real recursive
// latency is available (see #23 note), so LatencyBenefit is now computed
// from each domain's actual average recursive-lookup latency, normalized
// against the slowest domain in the dataset — domains that are genuinely
// slow to resolve benefit more from prefetching than already-fast ones.
// Falls back to a neutral 1.0 for domains with no recursive-latency samples
// yet (e.g. every query so far was served from cache).
// -----------------------------------------------------------------------
export function prefetchScores(limit = 20) {
  const all = db.select().from(domains).all();
  const maxQueries = Math.max(1, ...all.map((d) => d.queryCount));

  const latencyRows = db
    .select({ domain: dnsEvents.domain, responseTimeMs: dnsEvents.responseTimeMs, cached: dnsEvents.cached })
    .from(dnsEvents)
    .all()
    .filter((r) => !r.cached && r.responseTimeMs > 0);

  const avgRecursiveLatencyByDomain = new Map<string, number>();
  const grouped = new Map<string, number[]>();
  for (const r of latencyRows) {
    if (!grouped.has(r.domain)) grouped.set(r.domain, []);
    grouped.get(r.domain)!.push(r.responseTimeMs);
  }
  for (const [domain, values] of grouped.entries()) {
    avgRecursiveLatencyByDomain.set(domain, values.reduce((a, b) => a + b, 0) / values.length);
  }
  const maxLatency = Math.max(1, ...avgRecursiveLatencyByDomain.values());

  return all
    .map((d) => {
      const frequency = d.queryCount / maxQueries;
      const daysSinceLastSeen = (Date.now() - new Date(d.lastSeen).getTime()) / 86_400_000;
      const recency = Math.exp(-daysSinceLastSeen / 3);
      // Expiry probability proxy: domains queried on many unique days are
      // more likely to be queried again soon relative to their TTL window.
      const expiryProbability = Math.min(d.uniqueDays / 7, 1);
      const domainLatency = avgRecursiveLatencyByDomain.get(d.domain);
      const latencyBenefit = domainLatency !== undefined ? domainLatency / maxLatency : 1.0;
      return {
        domain: d.domain,
        score: frequency * recency * expiryProbability * latencyBenefit,
        frequency,
        recency,
        expiryProbability,
        latencyBenefit,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// -----------------------------------------------------------------------
// Metric #23 — DNS Latency Savings
//   LatencySaved = RecursiveQueries * (RecursiveLatency - CacheLatency)
// UPDATE (confirmed against a live Technitium v13+ instance): Technitium's
// /api/logs/query DOES return per-query latency via `responseRtt`, but only
// for Recursive lookups — Cached/Blocked/Authoritative entries have no RTT
// since there's no upstream round trip for them (their real-world latency
// is genuinely ~0, so defaulting those to 0 is accurate, not a gap). The
// collector/ingest pipeline was corrected to read `responseRtt` instead of
// assuming this field didn't exist. hasRealLatencyData below reflects real
// data whenever any Recursive queries have been logged.
// -----------------------------------------------------------------------
export function latencySavingsEstimate() {
  const events = db.select({ cached: dnsEvents.cached, responseTimeMs: dnsEvents.responseTimeMs }).from(dnsEvents).all();
  const recursive = events.filter((e) => !e.cached);
  const cached = events.filter((e) => e.cached);

  const avgRecursiveLatency = recursive.length > 0 ? recursive.reduce((s, e) => s + e.responseTimeMs, 0) / recursive.length : 0;
  const avgCacheLatency = cached.length > 0 ? cached.reduce((s, e) => s + e.responseTimeMs, 0) / cached.length : 0;

  const hasRealLatencyData = events.some((e) => e.responseTimeMs > 0);

  return {
    hasRealLatencyData,
    note: hasRealLatencyData
      ? null
      : "No queries with response-time data logged yet — will populate once Recursive queries have flowed through the collector.",
    recursiveQueries: recursive.length,
    avgRecursiveLatencyMs: avgRecursiveLatency,
    avgCacheLatencyMs: avgCacheLatency,
    estimatedLatencySavedMs: recursive.length * Math.max(0, avgRecursiveLatency - avgCacheLatency),
  };
}

// -----------------------------------------------------------------------
// Metric #18 — DNS Performance (full latency distribution)
// UPDATE (confirmed against a live Technitium v13+ instance): real recursive-
// query latency IS available via `responseRtt` — see the note on #23 above.
// This will show real data once any Recursive queries have been logged.
// -----------------------------------------------------------------------
export function dnsPerformance() {
  const rows = db.select({ responseTimeMs: dnsEvents.responseTimeMs, cached: dnsEvents.cached }).from(dnsEvents).all();
  const withLatency = rows.filter((r) => r.responseTimeMs > 0);

  if (withLatency.length === 0) {
    return {
      hasData: false,
      note: "No queries with response-time data logged yet (only Recursive lookups carry real RTT from Technitium; Cached/Blocked/Authoritative are ~0 by nature).",
      overall: null,
      cached: null,
      recursive: null,
    };
  }

  const cachedLatencies = withLatency.filter((r) => r.cached).map((r) => r.responseTimeMs);
  const recursiveLatencies = withLatency.filter((r) => !r.cached).map((r) => r.responseTimeMs);

  return {
    hasData: true,
    note: null,
    overall: distribution(withLatency.map((r) => r.responseTimeMs)),
    cached: distribution(cachedLatencies),
    recursive: distribution(recursiveLatencies),
  };
}

// -----------------------------------------------------------------------
// Metric #24 — Upstream Comparison
// KNOWN GAP: per-query upstream attribution (`upstream`) has not been
// confirmed present in Technitium's real /api/logs/query response the way
// `responseRtt` was (see the correction on metric #23). Shows "no data"
// honestly against a live instance until that's verified one way or the
// other against a real response payload.
// -----------------------------------------------------------------------
export function upstreamComparison() {
  const rows = db
    .select({ upstream: dnsEvents.upstream, responseTimeMs: dnsEvents.responseTimeMs, responseCode: dnsEvents.responseCode })
    .from(dnsEvents)
    .all();

  const withUpstream = rows.filter((r): r is typeof r & { upstream: string } => r.upstream !== null);
  if (withUpstream.length === 0) {
    return {
      hasData: false,
      note: "upstream isn't populated by the collector yet — see the KNOWN GAP comment in performance.ts.",
      upstreams: [],
    };
  }

  const grouped = new Map<string, typeof withUpstream>();
  for (const r of withUpstream) {
    if (!grouped.has(r.upstream)) grouped.set(r.upstream, []);
    grouped.get(r.upstream)!.push(r);
  }

  const upstreams = [...grouped.entries()].map(([upstream, entries]) => {
    const latencies = entries.map((e) => e.responseTimeMs).filter((l) => l > 0);
    const failures = entries.filter((e) => e.responseCode === "SERVFAIL" || e.responseCode === "REFUSED").length;
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    return {
      upstream,
      queries: entries.length,
      avgLatencyMs: avgLatency,
      successRate: entries.length > 0 ? 1 - failures / entries.length : 1,
      // Score = w1*Latency + w2*Reliability + w3*Security (weights below;
      // latency inverted+normalized so lower latency scores higher)
      score: 0,
    };
  });

  const maxLatency = Math.max(1, ...upstreams.map((u) => u.avgLatencyMs));
  for (const u of upstreams) {
    const latencyScore = 1 - u.avgLatencyMs / maxLatency;
    u.score = 0.5 * latencyScore + 0.5 * u.successRate;
  }

  return { hasData: true, note: null, upstreams: upstreams.sort((a, b) => b.score - a.score) };
}
//   DNSAvailability = 1 - (failed queries / total queries)
//   "Failed" = SERVFAIL, REFUSED, OTHER/timeout. NXDOMAIN is a valid
//   response (the domain genuinely doesn't exist) and is excluded here —
//   it's tracked separately under metric #14 (NXDOMAIN Analysis).
// -----------------------------------------------------------------------
export function networkReliability() {
  const row = db
    .select({
      total: sql<number>`count(*)`,
      failed: sql<number>`sum(case when ${dnsEvents.responseCode} in ('SERVFAIL','REFUSED','OTHER') then 1 else 0 end)`,
    })
    .from(dnsEvents)
    .get();
  const total = row?.total ?? 0;
  const failed = row?.failed ?? 0;
  return {
    totalQueries: total,
    failedQueries: failed,
    availability: total > 0 ? 1 - failed / total : 1,
  };
}

// -----------------------------------------------------------------------
// Metric #63 — Per-Client Latency Breakdown
//   Response-time distribution scoped per device, rather than #18's
//   network-wide view — surfaces a single slow/misbehaving client that
//   would otherwise be averaged away.
// -----------------------------------------------------------------------
export function perClientLatencyBreakdown(limit = 20) {
  const rows = db
    .select({ clientId: dnsEvents.clientId, responseTimeMs: dnsEvents.responseTimeMs })
    .from(dnsEvents)
    .all()
    .filter((r) => r.clientId && r.responseTimeMs > 0);

  const byClient = new Map<string, number[]>();
  for (const r of rows) {
    if (!byClient.has(r.clientId!)) byClient.set(r.clientId!, []);
    byClient.get(r.clientId!)!.push(r.responseTimeMs);
  }

  return [...byClient.entries()]
    .map(([clientId, latencies]) => ({ clientId, ...distribution(latencies) }))
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, limit);
}

// -----------------------------------------------------------------------
// Metric #64 — Recursive vs Cached Ratio Over Time
//   Daily trend of the recursive/cache split — an early signal for cache
//   tuning or TTL misconfiguration before it shows up as a latency problem.
// -----------------------------------------------------------------------
export function recursiveVsCachedRatioOverTime() {
  const rows = db.select({ timestamp: dnsEvents.timestamp, cached: dnsEvents.cached }).from(dnsEvents).all();
  const byDay = new Map<string, { cached: number; recursive: number }>();
  for (const r of rows) {
    const day = r.timestamp.slice(0, 10);
    const bucket = byDay.get(day) ?? { cached: 0, recursive: 0 };
    if (r.cached) bucket.cached++;
    else bucket.recursive++;
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .map(([date, v]) => ({
      date,
      cached: v.cached,
      recursive: v.recursive,
      cacheHitRate: v.cached + v.recursive > 0 ? v.cached / (v.cached + v.recursive) : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// -----------------------------------------------------------------------
// Metric #65 — Query Retransmission Rate
//   Approximation: same client querying the same domain again within a
//   short window (default 2s) of a prior query for that domain — consistent
//   with a resolver/app retrying after a slow or failed lookup. This is a
//   proxy from query-log timing alone, not a true retransmission count from
//   the wire (Technitium's query log doesn't expose retry/retransmit flags).
// -----------------------------------------------------------------------
export function queryRetransmissionRate(windowSeconds = 2) {
  const rows = db
    .select({ clientId: dnsEvents.clientId, domain: dnsEvents.domain, timestamp: dnsEvents.timestamp })
    .from(dnsEvents)
    .all()
    .filter((r) => r.clientId)
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  const windowMs = windowSeconds * 1000;
  const lastSeen = new Map<string, number>(); // key: clientId|domain
  let retransmits = 0;

  for (const r of rows) {
    const key = `${r.clientId}|${r.domain}`;
    const t = new Date(r.timestamp).getTime();
    const prev = lastSeen.get(key);
    if (prev !== undefined && t - prev <= windowMs) retransmits++;
    lastSeen.set(key, t);
  }

  return {
    totalQueries: rows.length,
    candidateRetransmits: retransmits,
    rate: rows.length > 0 ? retransmits / rows.length : 0,
    windowSeconds,
    note: "Proxy from query-log timing (same client+domain within the window), not a true wire-level retransmit count.",
  };
}

// -----------------------------------------------------------------------
// Metric #66 — DNSSEC Validation Rate
// KNOWN GAP: Technitium's /api/logs/query response fields this collector
// reads (see technitium-client.ts) do not include a DNSSEC validation
// status. Reports "no data" honestly rather than guessing, same discipline
// as the TTL/upstream gaps.
// -----------------------------------------------------------------------
export function dnssecValidationRate() {
  return {
    hasData: false,
    note: "DNSSEC validation status is not exposed by the fields netintel currently reads from Technitium's query log — needs confirmation against a live instance's full API response before this can be wired up.",
    validated: null,
    unvalidated: null,
    bogus: null,
  };
}

// -----------------------------------------------------------------------
// Metric #67 — EDNS/Protocol Feature Usage
//   Protocol distribution (UDP/TCP/DoT/DoH/DoQ) IS real data from
//   dns_events.protocol. EDNS0 flag usage and TC-bit (truncated response)
//   detection are NOT currently captured by the collector — reported
//   honestly as unavailable rather than guessed.
// -----------------------------------------------------------------------
export function protocolFeatureUsage() {
  const rows = db.select({ protocol: dnsEvents.protocol }).from(dnsEvents).all();
  const total = rows.length;
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.protocol, (counts.get(r.protocol) ?? 0) + 1);

  // DNS-over-TCP fallback specifically = TCP queries as a share of all
  // queries; a rising share can indicate truncated-response (large answer)
  // conditions even without a direct TC-bit flag.
  const tcpCount = counts.get("TCP") ?? 0;

  return {
    totalQueries: total,
    protocolBreakdown: [...counts.entries()]
      .map(([protocol, count]) => ({ protocol, count, share: total > 0 ? count / total : 0 }))
      .sort((a, b) => b.count - a.count),
    tcpFallbackShare: total > 0 ? tcpCount / total : 0,
    edns0Usage: { hasData: false, note: "Not exposed by the fields netintel currently reads from Technitium's query log." },
    truncatedResponses: { hasData: false, note: "Not exposed by the fields netintel currently reads from Technitium's query log." },
  };
}

// -----------------------------------------------------------------------
// Metric #68 — Response Size Distribution
// KNOWN GAP: Technitium's query log fields this collector reads do not
// include a response payload size. Reports "no data" honestly.
// -----------------------------------------------------------------------
export function responseSizeDistribution() {
  return {
    hasData: false,
    note: "Response payload size is not exposed by the fields netintel currently reads from Technitium's query log — needs confirmation against a live instance before this can be wired up.",
    distribution: null,
  };
}
