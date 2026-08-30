import { db, rawSqlite, dbPath } from "../db/client.js";
import { domainDaily } from "../db/schema.js";
import { gte } from "drizzle-orm";
import { categoryBreakdown } from "./categories-tracking.js";
import { trackingFootprint } from "./categories-tracking.js";
import { domainDiversityAndRepeatRatio } from "./trends.js";
import { timeOfDayBehavior } from "./time-behavior.js";
import { dnsEvents, savedQueries, dashboards, reportSchedules } from "../db/schema.js";
import fs from "node:fs";
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

  // Scoped to this report's own week window rather than the entire
  // table's history — cheaper (a week's rows, not months/years) and more
  // semantically correct too (a "weekly report"'s peak/quiet hour should
  // reflect that week, not all-time history).
  const events = db.select({ timestamp: dnsEvents.timestamp }).from(dnsEvents).where(gte(dnsEvents.timestamp, weekAgo)).all();
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

// -----------------------------------------------------------------------
// Metric #82 — Monthly Internet Report
//   #47's shape, month-scoped, with month-over-month deltas instead of
//   week-over-week.
// -----------------------------------------------------------------------
export function monthlyReport() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);

  const rows = db.select().from(domainDaily).where(gte(domainDaily.date, prevMonthStart)).all();
  const thisMonth = rows.filter((r) => r.date >= monthStart);
  const lastMonth = rows.filter((r) => r.date < monthStart);

  const sum = (rs: typeof rows, key: "queries" | "blocked" | "cacheHits") => rs.reduce((s, r) => s + r[key], 0);
  const thisQueries = sum(thisMonth, "queries");
  const lastQueries = sum(lastMonth, "queries");

  const events = db.select({ timestamp: dnsEvents.timestamp }).from(dnsEvents).where(gte(dnsEvents.timestamp, monthStart)).all();
  const timeOfDay = timeOfDayBehavior(events);

  return {
    period: { from: monthStart, to: now.toISOString().slice(0, 10) },
    totalQueries: thisQueries,
    uniqueDomains: new Set(thisMonth.map((r) => r.domain)).size,
    newDomains: thisMonth.filter((r) => !lastMonth.some((l) => l.domain === r.domain)).length,
    cacheHitRate: thisQueries > 0 ? sum(thisMonth, "cacheHits") / thisQueries : 0,
    blockedQueries: sum(thisMonth, "blocked"),
    peakHour: timeOfDay.peakHour,
    quietHour: timeOfDay.quietHour,
    categoryBreakdown: categoryBreakdown().slice(0, 8),
    monthOverMonth: {
      queriesDeltaPercent: lastQueries > 0 ? ((thisQueries - lastQueries) / lastQueries) * 100 : null,
    },
    hasFullMonthOfData: thisMonth.length > 0 && lastMonth.length > 0,
  };
}

// -----------------------------------------------------------------------
// Metric #83 — Tool Usage Meta-Metrics
//   Meta-metrics about netintel's own feature usage. KNOWN SCOPE LIMIT:
//   savedQueries/dashboards don't currently track a use/view counter, so
//   "most-used"/"most-viewed" rankings aren't available yet — reported
//   honestly as counts only, not faked rankings.
// -----------------------------------------------------------------------
export function toolUsageMetaMetrics() {
  const savedQueryCount = db.select().from(savedQueries).all().length;
  const dashboardCount = db.select().from(dashboards).all().length;
  const scheduleCount = db.select().from(reportSchedules).all().length;
  const enabledScheduleCount = db.select().from(reportSchedules).all().filter((s) => s.enabled).length;

  return {
    savedQueryCount,
    dashboardCount,
    reportScheduleCount: scheduleCount,
    enabledReportScheduleCount: enabledScheduleCount,
    note: "Usage/view counters for saved queries and dashboards aren't tracked yet, so 'most-used'/'most-viewed' rankings aren't available — these are counts only.",
  };
}

// -----------------------------------------------------------------------
// Metric #84 — Data Retention & Storage Footprint
//   Real per-table row counts and byte sizes (via SQLite's dbstat virtual
//   table), oldest retained record, and current database file size.
//   "Days to retention limit" is honestly reported as not configured — see
//   #50's stated principle of configurable retention, which isn't
//   implemented as an enforced limit yet.
// -----------------------------------------------------------------------
export function dataRetentionAndStorageFootprint() {
  let dbSizeBytes = 0;
  try {
    dbSizeBytes = fs.statSync(dbPath).size;
  } catch {
    // db not created yet
  }

  let perTable: { table: string; bytes: number }[] = [];
  try {
    perTable = rawSqlite
      .prepare("select name as tableName, sum(pgsize) as bytes from dbstat where name not like 'sqlite_%' group by name order by bytes desc")
      .all()
      .map((r: any) => ({ table: r.tableName, bytes: r.bytes })) as { table: string; bytes: number }[];
  } catch {
    perTable = [];
  }

  const oldestEvent = db.select({ timestamp: dnsEvents.timestamp }).from(dnsEvents).orderBy(dnsEvents.timestamp).limit(1).get();
  const totalEvents = db.select({ timestamp: dnsEvents.timestamp }).from(dnsEvents).all().length;

  return {
    dbFileSizeBytes: dbSizeBytes,
    perTable,
    oldestRecord: oldestEvent?.timestamp ?? null,
    totalDnsEvents: totalEvents,
    retentionLimitDays: null,
    daysToRetentionLimit: null,
    note: "No enforced retention limit is currently configured — see metric #50's stated principle. Nothing is deleted automatically.",
  };
}
