import { db } from "../db/client.js";
import { domainDaily } from "../db/schema.js";
import { gte } from "drizzle-orm";
import { categoryBreakdown } from "./categories-tracking.js";
import { trackingFootprint } from "./categories-tracking.js";
import { domainDiversityAndRepeatRatio } from "./trends.js";
import { timeOfDayBehavior } from "./time-behavior.js";
import { dnsEvents } from "../db/schema.js";

// -----------------------------------------------------------------------
// Metric #47 — Weekly Internet Report
// -----------------------------------------------------------------------
export function weeklyReport() {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

  const rows = db.select().from(domainDaily).where(gte(domainDaily.date, twoWeeksAgo)).all();
  const thisWeek = rows.filter((r) => r.date >= weekAgo);
  const lastWeek = rows.filter((r) => r.date < weekAgo);

  const sum = (rs: typeof rows, key: "queries" | "blocked" | "cacheHits") => rs.reduce((s, r) => s + r[key], 0);
  const thisQueries = sum(thisWeek, "queries");
  const lastQueries = sum(lastWeek, "queries");

  const events = db.select({ timestamp: dnsEvents.timestamp }).from(dnsEvents).all();
  const timeOfDay = timeOfDayBehavior(events);

  return {
    period: { from: weekAgo, to: new Date().toISOString().slice(0, 10) },
    totalQueries: thisQueries,
    uniqueDomains: new Set(thisWeek.map((r) => r.domain)).size,
    newDomains: thisWeek.filter((r) => !lastWeek.some((l) => l.domain === r.domain)).length,
    cacheHitRate: thisQueries > 0 ? sum(thisWeek, "cacheHits") / thisQueries : 0,
    blockedQueries: sum(thisWeek, "blocked"),
    peakHour: timeOfDay.peakHour,
    quietHour: timeOfDay.quietHour,
    categoryBreakdown: categoryBreakdown().slice(0, 8),
    weekOverWeek: {
      queriesDeltaPercent: lastQueries > 0 ? ((thisQueries - lastQueries) / lastQueries) * 100 : null,
    },
    hasFullWeekOfData: thisWeek.length > 0 && lastWeek.length > 0,
  };
}

// -----------------------------------------------------------------------
// Metric #48 — Personal Internet Fingerprint
//   A single vector summarizing the network's overall usage signature —
//   intended to be snapshotted over time to see how usage shifts.
// -----------------------------------------------------------------------
export function personalInternetFingerprint() {
  const categories = categoryBreakdown();
  const tracking = trackingFootprint();
  const diversity = domainDiversityAndRepeatRatio();
  const events = db.select({ timestamp: dnsEvents.timestamp }).from(dnsEvents).all();
  const timeOfDay = timeOfDayBehavior(events);

  return {
    generatedAt: new Date().toISOString(),
    categoryShares: categories.map((c) => ({ category: c.category, share: c.share })),
    diversityIndex: diversity.diversityIndex,
    repeatRatio: diversity.repeatRatio,
    trackerRatio: tracking.trackerRatio,
    peakHour: timeOfDay.peakHour,
  };
}
