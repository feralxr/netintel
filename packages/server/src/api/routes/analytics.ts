import { Hono } from "hono";
import { db } from "../../db/client.js";
import { dnsEvents } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { domainConcentration, uniqueDomainGrowth } from "../../analytics/domain-metrics.js";
import { timeOfDayBehavior, dayOfWeekBehavior, computeSessions, sessionSummary } from "../../analytics/time-behavior.js";
import { categoryBreakdown, firstPartyVsThirdParty, trackingFootprint } from "../../analytics/categories-tracking.js";
import { internetActivityTrends, topDomainDependency, ecosystemAnalysis, infrastructureDependency, entropyOfBrowsingBehavior, domainDiversityAndRepeatRatio } from "../../analytics/trends.js";
import { weeklyReport, personalInternetFingerprint } from "../../analytics/reporting.js";

export const analyticsRoute = new Hono();

analyticsRoute.get("/concentration", (c) => c.json(domainConcentration()));

analyticsRoute.get("/unique-domain-growth", (c) => c.json(uniqueDomainGrowth()));

analyticsRoute.get("/time-of-day", (c) => {
  const domain = c.req.query("domain");
  const events = domain
    ? db.select({ timestamp: dnsEvents.timestamp }).from(dnsEvents).where(eq(dnsEvents.domain, domain)).all()
    : db.select({ timestamp: dnsEvents.timestamp }).from(dnsEvents).all();
  return c.json(timeOfDayBehavior(events));
});

analyticsRoute.get("/day-of-week", (c) => {
  const events = db.select({ timestamp: dnsEvents.timestamp }).from(dnsEvents).all();
  return c.json(dayOfWeekBehavior(events));
});

analyticsRoute.get("/sessions/:clientId", (c) => {
  const clientId = c.req.param("clientId");
  const sessions = computeSessions(clientId);
  return c.json({ sessions: sessions.slice(-20), summary: sessionSummary(sessions) });
});

analyticsRoute.get("/categories", (c) => c.json(categoryBreakdown()));

analyticsRoute.get("/first-third-party", (c) => c.json(firstPartyVsThirdParty()));

analyticsRoute.get("/tracking", (c) => c.json(trackingFootprint()));

analyticsRoute.get("/trends", (c) => c.json(internetActivityTrends()));

analyticsRoute.get("/top-domain-dependency", (c) => c.json(topDomainDependency()));

analyticsRoute.get("/ecosystems", (c) => c.json(ecosystemAnalysis()));

analyticsRoute.get("/infrastructure", (c) => c.json(infrastructureDependency()));

analyticsRoute.get("/browsing-entropy", (c) => c.json(entropyOfBrowsingBehavior()));

analyticsRoute.get("/diversity", (c) => c.json(domainDiversityAndRepeatRatio()));

analyticsRoute.get("/weekly-report", (c) => c.json(weeklyReport())); // metric #47

analyticsRoute.get("/fingerprint", (c) => c.json(personalInternetFingerprint())); // metric #48
