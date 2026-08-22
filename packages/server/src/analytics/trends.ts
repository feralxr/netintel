import { db } from "../db/client.js";
import { dnsEvents, domains, domainCategories, domainDaily } from "../db/schema.js";
import { eq, gte } from "drizzle-orm";
import { ecosystemFor, infrastructureLayerFor } from "./categorization.js";
import { shannonEntropy } from "./stats.js";
import { categoryBreakdown } from "./categories-tracking.js";

// -----------------------------------------------------------------------
// Metric #29 — Internet Activity Trends (week-over-week)
// -----------------------------------------------------------------------
export function internetActivityTrends() {
  const now = Date.now();
  const thisWeekStart = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
  const lastWeekStart = new Date(now - 14 * 86_400_000).toISOString().slice(0, 10);

  const rows = db.select().from(domainDaily).where(gte(domainDaily.date, lastWeekStart)).all();
  const thisWeek = rows.filter((r) => r.date >= thisWeekStart);
  const lastWeek = rows.filter((r) => r.date < thisWeekStart);

  const sum = (rs: typeof rows, key: "queries" | "blocked" | "nxdomain" | "cacheHits") =>
    rs.reduce((s, r) => s + (r[key] ?? 0), 0);

  const mom = (curr: number, prev: number) => (prev > 0 ? ((curr - prev) / prev) * 100 : 0);

  const thisQueries = sum(thisWeek, "queries");
  const lastQueries = sum(lastWeek, "queries");

  return {
    thisWeek: {
      queries: thisQueries,
      uniqueDomains: new Set(thisWeek.map((r) => r.domain)).size,
      blocked: sum(thisWeek, "blocked"),
      cacheHits: sum(thisWeek, "cacheHits"),
    },
    lastWeek: {
      queries: lastQueries,
      uniqueDomains: new Set(lastWeek.map((r) => r.domain)).size,
      blocked: sum(lastWeek, "blocked"),
      cacheHits: sum(lastWeek, "cacheHits"),
    },
    queriesMoMPercent: mom(thisQueries, lastQueries),
  };
}

// -----------------------------------------------------------------------
// Metric #35 — Top-Domain Dependency
// -----------------------------------------------------------------------
export function topDomainDependency() {
  const all = db.select().from(domains).all().sort((a, b) => b.queryCount - a.queryCount);
  const total = all.reduce((s, d) => s + d.queryCount, 0);
  if (total === 0 || all.length === 0) {
    return { top1PercentShare: 0, top5PercentShare: 0, top10PercentShare: 0, top50PercentShare: 0 };
  }
  const shareOfTopPercent = (pct: number) => {
    const n = Math.max(1, Math.ceil(all.length * (pct / 100)));
    return all.slice(0, n).reduce((s, d) => s + d.queryCount, 0) / total;
  };
  return {
    top1PercentShare: shareOfTopPercent(1),
    top5PercentShare: shareOfTopPercent(5),
    top10PercentShare: shareOfTopPercent(10),
    top50PercentShare: shareOfTopPercent(50),
  };
}

// -----------------------------------------------------------------------
// Metric #36 — Ecosystem Analysis
// -----------------------------------------------------------------------
export function ecosystemAnalysis() {
  const events = db.select({ registeredDomain: dnsEvents.registeredDomain }).from(dnsEvents).all();
  const counts = new Map<string, { queries: number; domains: Set<string> }>();

  for (const e of events) {
    const eco = ecosystemFor(e.registeredDomain);
    const bucket = counts.get(eco) ?? { queries: 0, domains: new Set<string>() };
    bucket.queries++;
    bucket.domains.add(e.registeredDomain);
    counts.set(eco, bucket);
  }

  const total = events.length;
  return [...counts.entries()]
    .map(([ecosystem, v]) => ({
      ecosystem,
      queries: v.queries,
      uniqueDomains: v.domains.size,
      share: total > 0 ? v.queries / total : 0,
    }))
    .sort((a, b) => b.queries - a.queries);
}

// -----------------------------------------------------------------------
// Metric #37 — Infrastructure Dependency
// -----------------------------------------------------------------------
export function infrastructureDependency() {
  const categoryByDomain = new Map(db.select().from(domainCategories).all().map((c) => [c.domain, c.category]));
  const events = db.select({ domain: dnsEvents.domain }).from(dnsEvents).all();

  const counts = new Map<string, number>();
  for (const e of events) {
    const layer = infrastructureLayerFor(categoryByDomain.get(e.domain) ?? null);
    if (!layer) continue;
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }

  const total = events.length;
  return [...counts.entries()]
    .map(([layer, count]) => ({ layer, queries: count, share: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.queries - a.queries);
}

// -----------------------------------------------------------------------
// Metric #32 — Entropy of Browsing Behavior
//   H = -sum(p_i * log2(p_i)) across category shares. Low entropy = routine
//   activity concentrated in a few categories; high entropy = diverse/
//   exploratory browsing spread across many categories.
// -----------------------------------------------------------------------
export function entropyOfBrowsingBehavior() {
  const breakdown = categoryBreakdown();
  const entropy = shannonEntropy(breakdown.map((b) => b.queries));
  const maxPossible = breakdown.length > 0 ? Math.log2(breakdown.length) : 0;
  return {
    entropyBits: entropy,
    maxPossibleBits: maxPossible,
    normalized: maxPossible > 0 ? entropy / maxPossible : 0, // 0 = fully concentrated, 1 = maximally spread
    categoryCount: breakdown.length,
  };
}

// -----------------------------------------------------------------------
// Metric #33 — Domain Diversity Index:  D = unique domains / total queries
// Metric #34 — Repeat Ratio:            RepeatRatio = 1 - D
// -----------------------------------------------------------------------
export function domainDiversityAndRepeatRatio() {
  const all = db.select().from(domains).all();
  const totalQueries = all.reduce((s, d) => s + d.queryCount, 0);
  const uniqueDomains = all.length;
  const diversity = totalQueries > 0 ? uniqueDomains / totalQueries : 0;
  return {
    diversityIndex: diversity,
    repeatRatio: 1 - diversity,
    uniqueDomains,
    totalQueries,
  };
}

// -----------------------------------------------------------------------
// Metric #74 — Category Share Momentum
//   Rate of change (not just level) of each category's share of total
//   queries week-over-week — surfaces categories rising or falling
//   fastest, which a static share breakdown (#9) can't show.
// -----------------------------------------------------------------------
export function categoryShareMomentum() {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

  const rows = db.select().from(domainDaily).where(gte(domainDaily.date, twoWeeksAgo)).all();
  const categoryByDomain = new Map(db.select().from(domainCategories).all().map((c) => [c.domain, c.category]));

  const shareByCategory = (rs: typeof rows) => {
    const counts = new Map<string, number>();
    for (const r of rs) {
      const category = categoryByDomain.get(r.domain) ?? "uncategorized";
      counts.set(category, (counts.get(category) ?? 0) + r.queries);
    }
    const total = rs.reduce((s, r) => s + r.queries, 0);
    return new Map([...counts.entries()].map(([c, n]) => [c, total > 0 ? n / total : 0]));
  };

  const thisWeek = shareByCategory(rows.filter((r) => r.date >= weekAgo));
  const lastWeek = shareByCategory(rows.filter((r) => r.date < weekAgo));

  const allCategories = new Set([...thisWeek.keys(), ...lastWeek.keys()]);
  return [...allCategories]
    .map((category) => {
      const before = lastWeek.get(category) ?? 0;
      const after = thisWeek.get(category) ?? 0;
      return { category, shareBefore: before, shareAfter: after, momentumPercentagePoints: (after - before) * 100 };
    })
    .sort((a, b) => Math.abs(b.momentumPercentagePoints) - Math.abs(a.momentumPercentagePoints));
}

// -----------------------------------------------------------------------
// Metric #75 — Seasonal Pattern Detection
//   Compares current week's daily query volume against the same weekday
//   in prior weeks, to separate a genuine trend from routine weekly cycles
//   (e.g. "Mondays are always quieter" vs. "this Monday was anomalous").
// -----------------------------------------------------------------------
export function seasonalPatternDetection(lookbackWeeks = 4) {
  const rows = db.select().from(domainDaily).all();
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.queries);

  const today = new Date();
  const results: { date: string; dayOfWeek: string; actual: number; historicalAvgForWeekday: number; deviationPercent: number | null }[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    const actual = byDate.get(dateStr) ?? 0;

    const sameWeekdayValues: number[] = [];
    for (let w = 1; w <= lookbackWeeks; w++) {
      const past = new Date(d.getTime() - w * 7 * 86_400_000).toISOString().slice(0, 10);
      const v = byDate.get(past);
      if (v !== undefined) sameWeekdayValues.push(v);
    }
    const histAvg = sameWeekdayValues.length > 0 ? sameWeekdayValues.reduce((a, b) => a + b, 0) / sameWeekdayValues.length : 0;

    results.push({
      date: dateStr,
      dayOfWeek: d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
      actual,
      historicalAvgForWeekday: histAvg,
      deviationPercent: histAvg > 0 ? ((actual - histAvg) / histAvg) * 100 : null,
    });
  }

  return results.reverse();
}

// -----------------------------------------------------------------------
// Metric #76 — Domain Churn Rate
//   Churn = (domains dropped + domains added) / total domains active in
//   either period. High churn = a network with a rapidly-changing set of
//   destinations; low churn = a stable, routine set of domains.
// -----------------------------------------------------------------------
export function domainChurnRate() {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

  const rows = db.select().from(domainDaily).where(gte(domainDaily.date, twoWeeksAgo)).all();
  const thisWeekDomains = new Set(rows.filter((r) => r.date >= weekAgo).map((r) => r.domain));
  const lastWeekDomains = new Set(rows.filter((r) => r.date < weekAgo).map((r) => r.domain));

  const added = [...thisWeekDomains].filter((d) => !lastWeekDomains.has(d));
  const dropped = [...lastWeekDomains].filter((d) => !thisWeekDomains.has(d));
  const union = new Set([...thisWeekDomains, ...lastWeekDomains]);

  return {
    added: added.length,
    dropped: dropped.length,
    totalDomainsEitherPeriod: union.size,
    churnRate: union.size > 0 ? (added.length + dropped.length) / union.size : 0,
  };
}

// -----------------------------------------------------------------------
// Metric #77 — Long-Term Retention Curve
//   Cohort-style: of domains first seen exactly N days ago, what share are
//   still queried today. Buckets at 1/7/14/30/60/90 days.
// -----------------------------------------------------------------------
export function longTermRetentionCurve() {
  const all = db.select().from(domains).all();
  const now = Date.now();
  const buckets = [1, 7, 14, 30, 60, 90];

  return buckets.map((days) => {
    const cohortStart = now - (days + 1) * 86_400_000;
    const cohortEnd = now - days * 86_400_000;
    const cohort = all.filter((d) => {
      const t = new Date(d.firstSeen).getTime();
      return t >= cohortStart && t < cohortEnd;
    });
    if (cohort.length === 0) return { days, cohortSize: 0, stillActiveShare: null };

    const stillActive = cohort.filter((d) => now - new Date(d.lastSeen).getTime() < 2 * 86_400_000);
    return { days, cohortSize: cohort.length, stillActiveShare: stillActive.length / cohort.length };
  });
}
