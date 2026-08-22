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

// -----------------------------------------------------------------------
// Metric #69 — Device Onboarding Timeline
//   Chronological view of a device's lifecycle milestones: first-seen,
//   first-classified-category, first-flagged-event, current status.
// -----------------------------------------------------------------------
export function deviceOnboardingTimeline(deviceId: string) {
  const device = db.select().from(devices).where(eq(devices.deviceId, deviceId)).get();
  if (!device) return { deviceId, found: false };

  const firstEvent = db
    .select({ timestamp: dnsEvents.timestamp, domain: dnsEvents.domain })
    .from(dnsEvents)
    .where(eq(dnsEvents.clientId, deviceId))
    .orderBy(dnsEvents.timestamp)
    .limit(1)
    .get();

  const categoryByDomain = new Map(db.select().from(domainCategories).all().map((c) => [c.domain, c.category]));
  const events = db
    .select({ timestamp: dnsEvents.timestamp, domain: dnsEvents.domain })
    .from(dnsEvents)
    .where(eq(dnsEvents.clientId, deviceId))
    .orderBy(dnsEvents.timestamp)
    .all();

  const firstClassified = events.find((e) => categoryByDomain.has(e.domain));

  return {
    deviceId,
    found: true,
    firstSeen: device.firstSeen,
    firstQuery: firstEvent ?? null,
    firstClassifiedCategory: firstClassified
      ? { timestamp: firstClassified.timestamp, domain: firstClassified.domain, category: categoryByDomain.get(firstClassified.domain) }
      : null,
    currentlyFlagged: device.flagged,
    flagReason: device.flagReason,
    currentStatus: device.isActive ? "active" : "inactive",
    lastSeen: device.lastSeen,
  };
}

// -----------------------------------------------------------------------
// Metric #70 — Device Idle Detection
//   Devices with DNS history but no meaningful recent activity — asleep or
//   idle networked hardware rather than genuinely gone (still isActive per
//   DHCP, so #26's isActive flag alone doesn't distinguish this).
// -----------------------------------------------------------------------
export function idleDevices(idleThresholdHours = 6) {
  const active = db.select().from(devices).where(eq(devices.isActive, true)).all();
  const cutoff = Date.now() - idleThresholdHours * 3600_000;

  return active
    .filter((d) => new Date(d.lastSeen).getTime() < cutoff)
    .map((d) => ({
      deviceId: d.deviceId,
      hostname: d.hostname,
      lastSeen: d.lastSeen,
      idleHours: (Date.now() - new Date(d.lastSeen).getTime()) / 3600_000,
    }))
    .sort((a, b) => b.idleHours - a.idleHours);
}

// -----------------------------------------------------------------------
// Metric #71 — Device Category Affinity Shift
//   Compares a device's dominant category mix in the most recent week
//   against the week before, to surface a device's usage character
//   drifting over time (e.g. becoming more streaming-heavy).
// -----------------------------------------------------------------------
export function deviceCategoryAffinityShift(deviceId: string) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const events = db.select().from(dnsEvents).where(eq(dnsEvents.clientId, deviceId)).all();
  const categoryByDomain = new Map(db.select().from(domainCategories).all().map((c) => [c.domain, c.category]));

  const shareByCategory = (rows: typeof events) => {
    const counts = new Map<string, number>();
    for (const e of rows) {
      const category = categoryByDomain.get(e.domain) ?? "uncategorized";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    const total = rows.length;
    return new Map([...counts.entries()].map(([c, n]) => [c, total > 0 ? n / total : 0]));
  };

  const thisWeekEvents = events.filter((e) => e.timestamp >= weekAgo);
  const lastWeekEvents = events.filter((e) => e.timestamp >= twoWeeksAgo && e.timestamp < weekAgo);

  const thisWeekShares = shareByCategory(thisWeekEvents);
  const lastWeekShares = shareByCategory(lastWeekEvents);

  const allCategories = new Set([...thisWeekShares.keys(), ...lastWeekShares.keys()]);
  const shifts = [...allCategories]
    .map((category) => {
      const before = lastWeekShares.get(category) ?? 0;
      const after = thisWeekShares.get(category) ?? 0;
      return { category, shareBefore: before, shareAfter: after, deltaPercentagePoints: (after - before) * 100 };
    })
    .sort((a, b) => Math.abs(b.deltaPercentagePoints) - Math.abs(a.deltaPercentagePoints));

  return { deviceId, hasFullTwoWeekData: thisWeekEvents.length > 0 && lastWeekEvents.length > 0, shifts };
}

// -----------------------------------------------------------------------
// Metric #72 — MAC Vendor / OUI Classification
//   Best-effort device-type HINT from the DHCP-reported MAC vendor prefix
//   (first 3 octets), against a small offline table. Never a guarantee —
//   MACs can be randomized/spoofed and this table is not exhaustive.
// -----------------------------------------------------------------------
const OUI_HINTS: Record<string, string> = {
  "00:1A:11": "Google",
  "3C:5A:B4": "Google (Nest/Chromecast)",
  "B8:27:EB": "Raspberry Pi Foundation",
  "DC:A6:32": "Raspberry Pi Foundation",
  "F0:18:98": "Apple",
  "AC:DE:48": "Apple",
  "00:1B:63": "Apple",
  "FC:FC:48": "Amazon (Echo/Fire)",
  "44:65:0D": "Amazon",
  "18:B4:30": "Nest Labs",
  "B0:4E:26": "Samsung",
  "5C:CF:7F": "Espressif (IoT/ESP)",
  "24:6F:28": "Espressif (IoT/ESP)",
  "00:17:88": "Philips Hue",
};

export function macVendorHint(mac: string | null): { vendorHint: string | null; note: string } {
  if (!mac) return { vendorHint: null, note: "No MAC recorded for this device yet." };
  const prefix = mac.toUpperCase().slice(0, 8);
  const hint = OUI_HINTS[prefix] ?? null;
  return {
    vendorHint: hint,
    note: "Best-effort hint from a small offline OUI table — not a guarantee, and MACs can be randomized.",
  };
}

export function devicesWithVendorHints() {
  const all = db.select().from(devices).where(eq(devices.isActive, true)).all();
  return all.map((d) => ({ deviceId: d.deviceId, hostname: d.hostname, mac: d.mac, ...macVendorHint(d.mac) }));
}

// -----------------------------------------------------------------------
// Metric #73 — Device Query Rate Percentile Rank
//   Ranks each device against every other active device by query volume —
//   spot the loudest clients on the network at a glance.
// -----------------------------------------------------------------------
export function deviceQueryRatePercentileRank() {
  const active = db.select().from(devices).where(eq(devices.isActive, true)).all();
  const counts = active.map((d) => ({
    deviceId: d.deviceId,
    hostname: d.hostname,
    queries: db.select({ timestamp: dnsEvents.timestamp }).from(dnsEvents).where(eq(dnsEvents.clientId, d.deviceId)).all().length,
  }));

  const sorted = [...counts].sort((a, b) => a.queries - b.queries);
  const n = sorted.length;

  return sorted
    .map((c, idx) => ({
      ...c,
      percentileRank: n > 1 ? (idx / (n - 1)) * 100 : 100,
    }))
    .sort((a, b) => b.queries - a.queries);
}
