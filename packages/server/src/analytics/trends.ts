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
