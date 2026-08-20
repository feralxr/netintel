import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { dnsEvents, devices, domainCategories } from "../db/schema.js";
import { timeOfDayBehavior } from "./time-behavior.js";
import { computeSessions, sessionSummary } from "./time-behavior.js";
import { isTrackerCategory } from "./categorization.js";

// -----------------------------------------------------------------------
// Metric #26 — Device Analytics
// -----------------------------------------------------------------------
export function deviceAnalytics(clientId: string) {
  const events = db.select().from(dnsEvents).where(eq(dnsEvents.clientId, clientId)).all();
  const categoryByDomain = new Map(db.select().from(domainCategories).all().map((c) => [c.domain, c.category]));

  const queries = events.length;
  const uniqueDomains = new Set(events.map((e) => e.domain)).size;
  const blocked = events.filter((e) => e.blocked).length;
  const nxdomain = events.filter((e) => e.responseCode === "NXDOMAIN").length;
  const cached = events.filter((e) => e.cached).length;

  const categoryCounts = new Map<string, number>();
  for (const e of events) {
    const category = categoryByDomain.get(e.domain) ?? "uncategorized";
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  const categoryMix = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count, share: queries > 0 ? count / queries : 0 }))
    .sort((a, b) => b.count - a.count);

  const timeOfDay = timeOfDayBehavior(events);

  return {
    clientId,
    queries,
    uniqueDomains,
    blocked,
    nxdomain,
    cacheHitRate: queries > 0 ? cached / queries : 0,
    categoryMix,
    peakHour: timeOfDay.peakHour,
  };
}

// -----------------------------------------------------------------------
// Metric #27 — Device Behavioral Fingerprint
//   A single vector describing the "shape" of a device's usage, intended to
//   be compared across devices or tracked over time for the same device.
// -----------------------------------------------------------------------
export function deviceFingerprint(clientId: string) {
  const base = deviceAnalytics(clientId);
  const events = db.select().from(dnsEvents).where(eq(dnsEvents.clientId, clientId)).all();
  const categoryByDomain = new Map(db.select().from(domainCategories).all().map((c) => [c.domain, c.category]));

  const trackerEvents = events.filter((e) => isTrackerCategory(categoryByDomain.get(e.domain) ?? null));
  const timeOfDay = timeOfDayBehavior(events);
  const activeHours = timeOfDay.hourCounts.filter((c) => c > 0).length;

  const sessions = computeSessions(clientId);
  const summary = sessionSummary(sessions);

  return {
    clientId,
    domainDiversity: base.queries > 0 ? base.uniqueDomains / base.queries : 0,
    categoryDistribution: base.categoryMix,
    queryRatePerHourActive: activeHours > 0 ? base.queries / activeHours : 0,
    activeHours,
    trackerRatio: base.queries > 0 ? trackerEvents.length / base.queries : 0,
    blockedRatio: base.queries > 0 ? base.blocked / base.queries : 0,
    nxdomainRate: base.queries > 0 ? base.nxdomain / base.queries : 0,
    avgSessionLengthMinutes: summary.avgDurationMinutes,
  };
}

// -----------------------------------------------------------------------
// Metric #28 — Cross-Device Comparison
// -----------------------------------------------------------------------
export function crossDeviceComparison() {
  const activeDevices = db.select().from(devices).where(eq(devices.isActive, true)).all();
  return activeDevices
    .map((d) => {
      const stats = deviceAnalytics(d.deviceId);
      return {
        deviceId: d.deviceId,
        hostname: d.hostname,
        ...stats,
      };
    })
    .sort((a, b) => b.queries - a.queries);
}
