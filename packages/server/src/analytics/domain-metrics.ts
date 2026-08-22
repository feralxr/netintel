import { eq, asc, desc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { dnsEvents, domains, domainDaily } from "../db/schema.js";
import { distribution, type Distribution, hhi, mean, stddev } from "./stats.js";

// -----------------------------------------------------------------------
// Metric #1 — Domain Statistics: revisit interval distribution
// -----------------------------------------------------------------------
export function domainRevisitIntervals(domain: string): Distribution {
  const rows = db
    .select({ timestamp: dnsEvents.timestamp })
    .from(dnsEvents)
    .where(eq(dnsEvents.domain, domain))
    .orderBy(asc(dnsEvents.timestamp))
    .all();

  const timestamps = rows.map((r) => new Date(r.timestamp).getTime());
  const intervalsMinutes: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervalsMinutes.push((timestamps[i] - timestamps[i - 1]) / 60_000);
  }
  return distribution(intervalsMinutes);
}

// -----------------------------------------------------------------------
// Metric #2 — Domain Popularity Score
//   Popularity = w1*log(1+Q) + w2*R + w3*U + w4*F
//   Q = query count, R = recency (0-1), U = unique active days (0-1
//   normalized against the network's max), F = frequency regularity
//   (0-1, derived from the coefficient of variation of revisit intervals —
//   lower CV = more regular = higher F).
// -----------------------------------------------------------------------
const WEIGHTS = { query: 0.35, recency: 0.25, uniqueDays: 0.2, regularity: 0.2 };

export function domainPopularityScore(domainRow: typeof domains.$inferSelect, maxUniqueDays: number): number {
  const Q = Math.log(1 + domainRow.queryCount);
  const daysSinceLastSeen = (Date.now() - new Date(domainRow.lastSeen).getTime()) / 86_400_000;
  const R = Math.exp(-daysSinceLastSeen / 7); // recency half-life-ish decay over ~a week
  const U = maxUniqueDays > 0 ? Math.min(domainRow.uniqueDays / maxUniqueDays, 1) : 0;

  const interval = domainRevisitIntervals(domainRow.domain);
  const cv = interval.mean > 0 ? interval.stddev / interval.mean : 1;
  const F = Math.max(0, 1 - Math.min(cv, 1));

  return WEIGHTS.query * Q + WEIGHTS.recency * R + WEIGHTS.uniqueDays * U + WEIGHTS.regularity * F;
}

export function recomputeAllPopularityScores(): void {
  const all = db.select().from(domains).all();
  const maxUniqueDays = Math.max(1, ...all.map((d) => d.uniqueDays));
  for (const d of all) {
    const score = domainPopularityScore(d, maxUniqueDays);
    db.update(domains).set({ popularityScore: score }).where(eq(domains.domain, d.domain)).run();
  }
}

// -----------------------------------------------------------------------
// Metric #3 — Unique Domain Statistics (growth over rollup windows)
// -----------------------------------------------------------------------
export function uniqueDomainGrowth(): { today: number; yesterday: number; growthPct: number } {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const todayCount = db
    .select({ c: sql<number>`count(distinct ${domainDaily.domain})` })
    .from(domainDaily)
    .where(eq(domainDaily.date, today))
    .get();
  const yesterdayCount = db
    .select({ c: sql<number>`count(distinct ${domainDaily.domain})` })
    .from(domainDaily)
    .where(eq(domainDaily.date, yesterday))
    .get();

  const t = todayCount?.c ?? 0;
  const y = yesterdayCount?.c ?? 0;
  return { today: t, yesterday: y, growthPct: y > 0 ? ((t - y) / y) * 100 : 0 };
}

// -----------------------------------------------------------------------
// Metric #4 — Domain Concentration (top-N share + HHI)
// -----------------------------------------------------------------------
export function domainConcentration() {
  const all = db.select().from(domains).orderBy(desc(domains.queryCount)).all();
  const total = all.reduce((sum, d) => sum + d.queryCount, 0);
  if (total === 0) {
    return { top1Share: 0, top5Share: 0, top10Share: 0, top50Share: 0, hhi: 0, totalDomains: 0 };
  }

  const shareOfTopN = (n: number) => all.slice(0, n).reduce((sum, d) => sum + d.queryCount, 0) / total;
  const shares = all.map((d) => d.queryCount / total);

  return {
    top1Share: shareOfTopN(1),
    top5Share: shareOfTopN(5),
    top10Share: shareOfTopN(10),
    top50Share: shareOfTopN(50),
    hhi: hhi(shares),
    totalDomains: all.length,
  };
}

// -----------------------------------------------------------------------
// Metric #51 — Domain Response Code Distribution
// -----------------------------------------------------------------------
export function domainResponseCodeDistribution(domain?: string) {
  const rows = domain
    ? db.select({ responseCode: dnsEvents.responseCode }).from(dnsEvents).where(eq(dnsEvents.domain, domain)).all()
    : db.select({ responseCode: dnsEvents.responseCode }).from(dnsEvents).all();

  const total = rows.length;
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.responseCode, (counts.get(r.responseCode) ?? 0) + 1);

  return {
    domain: domain ?? null,
    total,
    breakdown: [...counts.entries()]
      .map(([responseCode, count]) => ({ responseCode, count, share: total > 0 ? count / total : 0 }))
      .sort((a, b) => b.count - a.count),
  };
}

// -----------------------------------------------------------------------
// Metric #52 — Domain Co-Visit Recency
//   For domains already known to be paired (via #42's relationship graph),
//   the time-lag between the two domains' most recent visits — how "in
//   sync" a pair's usage still is right now, not just historically.
// -----------------------------------------------------------------------
export function domainCoVisitRecency(domainA: string, domainB: string) {
  const lastSeen = (domain: string) => {
    const row = db
      .select({ timestamp: dnsEvents.timestamp })
      .from(dnsEvents)
      .where(eq(dnsEvents.domain, domain))
      .orderBy(desc(dnsEvents.timestamp))
      .limit(1)
      .get();
    return row?.timestamp ?? null;
  };

  const lastA = lastSeen(domainA);
  const lastB = lastSeen(domainB);
  if (!lastA || !lastB) {
    return { domainA, domainB, lagMinutes: null, note: "One or both domains have no recorded queries yet." };
  }

  const lagMinutes = Math.abs(new Date(lastA).getTime() - new Date(lastB).getTime()) / 60_000;
  return { domainA, domainB, lastSeenA: lastA, lastSeenB: lastB, lagMinutes, note: null };
}

// -----------------------------------------------------------------------
// Metric #53 — Domain Query Burstiness
//   Fano = variance(inter-query gaps) / mean(inter-query gaps)
//   Fano ~1 = Poisson-like/random spacing; Fano >>1 = bursty (clusters of
//   activity separated by long gaps); Fano <<1 = unusually regular spacing.
// -----------------------------------------------------------------------
export function domainQueryBurstiness(domain: string) {
  const rows = db
    .select({ timestamp: dnsEvents.timestamp })
    .from(dnsEvents)
    .where(eq(dnsEvents.domain, domain))
    .orderBy(asc(dnsEvents.timestamp))
    .all();

  const timestamps = rows.map((r) => new Date(r.timestamp).getTime());
  const gapsMinutes: number[] = [];
  for (let i = 1; i < timestamps.length; i++) gapsMinutes.push((timestamps[i] - timestamps[i - 1]) / 60_000);

  if (gapsMinutes.length < 2) {
    return { domain, fanoFactor: null, sampleSize: gapsMinutes.length, note: "Not enough queries yet to compute a meaningful Fano factor (need at least 3 total queries)." };
  }

  const m = mean(gapsMinutes);
  const variance = m > 0 ? stddev(gapsMinutes) ** 2 : 0;
  const fanoFactor = m > 0 ? variance / m : 0;

  return { domain, fanoFactor, sampleSize: gapsMinutes.length, note: null };
}

// -----------------------------------------------------------------------
// Metric #54 — Subdomain Fragmentation
//   Distinct subdomains observed under a base (registered) domain — a proxy
//   for CDN sharding, dynamic tracker subdomains, or DGA-as-a-service.
// -----------------------------------------------------------------------
export function subdomainFragmentation(registeredDomain: string) {
  const rows = db
    .select({ domain: dnsEvents.domain })
    .from(dnsEvents)
    .where(eq(dnsEvents.registeredDomain, registeredDomain))
    .all();

  const distinctSubdomains = new Set(rows.map((r) => r.domain));
  return {
    registeredDomain,
    totalQueries: rows.length,
    distinctSubdomainCount: distinctSubdomains.size,
    subdomains: [...distinctSubdomains].sort(),
  };
}

/** Registered domains with the highest subdomain fragmentation network-wide — a candidate list, not a verdict. */
export function topFragmentedDomains(limit = 20) {
  const rows = db.select({ registeredDomain: dnsEvents.registeredDomain, domain: dnsEvents.domain }).from(dnsEvents).all();
  const byRegistered = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byRegistered.has(r.registeredDomain)) byRegistered.set(r.registeredDomain, new Set());
    byRegistered.get(r.registeredDomain)!.add(r.domain);
  }
  return [...byRegistered.entries()]
    .map(([registeredDomain, subs]) => ({ registeredDomain, distinctSubdomainCount: subs.size }))
    .sort((a, b) => b.distinctSubdomainCount - a.distinctSubdomainCount)
    .slice(0, limit);
}

// -----------------------------------------------------------------------
// Metric #55 — Domain Recency Decay Score
//   DecayScore = e^(-λ * days_since_last_seen)
//   An exponentially-weighted recency score (1 = seen just now, ->0 as a
//   domain goes stale) used to fade domains out of "active" views without
//   deleting their history — distinct from #2's popularity score, which
//   blends recency with volume/consistency; this is recency alone.
// -----------------------------------------------------------------------
export function domainRecencyDecayScore(domainRow: typeof domains.$inferSelect, lambda = 0.15): number {
  const daysSinceLastSeen = (Date.now() - new Date(domainRow.lastSeen).getTime()) / 86_400_000;
  return Math.exp(-lambda * Math.max(0, daysSinceLastSeen));
}

export function domainsByDecayScore(lambda = 0.15, limit = 50) {
  const all = db.select().from(domains).all();
  return all
    .map((d) => ({ domain: d.domain, decayScore: domainRecencyDecayScore(d, lambda), lastSeen: d.lastSeen }))
    .sort((a, b) => b.decayScore - a.decayScore)
    .slice(0, limit);
}
