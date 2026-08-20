import { eq, asc, desc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { dnsEvents, domains, domainDaily } from "../db/schema.js";
import { distribution, type Distribution, hhi } from "./stats.js";

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
