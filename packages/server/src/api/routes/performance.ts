import { Hono } from "hono";
import { sql, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { domainDaily } from "../../db/schema.js";
import {
  cachePerformance,
  ttlAnalytics,
  prefetchScores,
  latencySavingsEstimate,
  networkReliability,
  dnsPerformance,
  upstreamComparison,
} from "../../analytics/performance.js";

export const performanceRoute = new Hono();

performanceRoute.get("/dns", (c) => c.json(dnsPerformance())); // metric #18
performanceRoute.get("/cache", (c) => c.json(cachePerformance())); // metric #19
performanceRoute.get("/ttl", (c) => c.json(ttlAnalytics())); // metric #21
performanceRoute.get("/prefetch", (c) => c.json(prefetchScores(Number(c.req.query("limit") ?? 20)))); // metric #22
performanceRoute.get("/latency-savings", (c) => c.json(latencySavingsEstimate())); // metric #23
performanceRoute.get("/upstream-comparison", (c) => c.json(upstreamComparison())); // metric #24
performanceRoute.get("/reliability", (c) => c.json(networkReliability())); // metric #25

performanceRoute.get("/summary", (c) => {
  const today = new Date().toISOString().slice(0, 10);

  const totals = db
    .select({
      queries: sql<number>`coalesce(sum(${domainDaily.queries}), 0)`,
      cacheHits: sql<number>`coalesce(sum(${domainDaily.cacheHits}), 0)`,
      blocked: sql<number>`coalesce(sum(${domainDaily.blocked}), 0)`,
    })
    .from(domainDaily)
    .where(eq(domainDaily.date, today))
    .get();

  // Metric #20 Cache Opportunity: high-frequency domains with the lowest
  // cache hit rate today — the concrete "where would caching help most" list.
  const rows = db.select().from(domainDaily).where(eq(domainDaily.date, today)).all();
  const cacheOpportunity = rows
    .filter((r) => r.queries >= 5)
    .map((r) => ({ domain: r.domain, queries: r.queries, cacheHitRate: r.queries > 0 ? r.cacheHits / r.queries : 0 }))
    .sort((a, b) => a.cacheHitRate - b.cacheHitRate || b.queries - a.queries)
    .slice(0, 10);

  const queries = totals?.queries ?? 0;
  const cacheHits = totals?.cacheHits ?? 0;

  return c.json({
    queries,
    cacheHits,
    cacheHitRate: queries > 0 ? cacheHits / queries : 0,
    cacheOpportunity,
  });
});
