import { Hono } from "hono";
import { sql, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { domainDaily, notifications, dnsEvents } from "../../db/schema.js";
import { nxdomainAnalysis, highEntropyDomains, newlyObservedDomains, unifiedSecurityAnalytics } from "../../analytics/security-metrics.js";
import { behavioralBaseline, detectZScoreAnomalies } from "../../analytics/anomaly.js";

export const securityRoute = new Hono();

securityRoute.get("/analytics", (c) => c.json(unifiedSecurityAnalytics())); // metric #13
securityRoute.get("/nxdomain", (c) => c.json(nxdomainAnalysis())); // metric #14
securityRoute.get("/entropy", (c) => c.json(highEntropyDomains())); // metric #15
securityRoute.get("/new-domains", (c) => c.json(newlyObservedDomains())); // metric #16
securityRoute.get("/baseline", (c) => c.json(behavioralBaseline())); // metric #30
securityRoute.get("/anomalies", (c) => c.json(detectZScoreAnomalies())); // metric #31

securityRoute.get("/summary", (c) => {
  const today = new Date().toISOString().slice(0, 10);

  const totals = db
    .select({
      queries: sql<number>`coalesce(sum(${domainDaily.queries}), 0)`,
      blocked: sql<number>`coalesce(sum(${domainDaily.blocked}), 0)`,
      nxdomain: sql<number>`coalesce(sum(${domainDaily.nxdomain}), 0)`,
    })
    .from(domainDaily)
    .where(eq(domainDaily.date, today))
    .get();

  const blockedToday = db
    .select({ domain: dnsEvents.domain, count: sql<number>`count(*)` })
    .from(dnsEvents)
    .where(eq(dnsEvents.blocked, true))
    .groupBy(dnsEvents.domain)
    .orderBy(desc(sql`count(*)`))
    .limit(10)
    .all();

  const securityNotifications = db
    .select()
    .from(notifications)
    .where(eq(notifications.category, "security"))
    .orderBy(desc(notifications.timestamp))
    .limit(20)
    .all();

  const queries = totals?.queries ?? 0;
  const blocked = totals?.blocked ?? 0;
  const nxdomain = totals?.nxdomain ?? 0;

  return c.json({
    queries,
    blocked,
    nxdomain,
    blockRate: queries > 0 ? blocked / queries : 0,
    nxRate: queries > 0 ? nxdomain / queries : 0,
    topBlockedDomains: blockedToday,
    notifications: securityNotifications,
  });
});
