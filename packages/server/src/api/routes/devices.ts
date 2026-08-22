import { Hono } from "hono";
import { eq, desc, sql, and } from "drizzle-orm";
import { db } from "../../db/client.js";
import { devices, clientDaily, dnsEvents } from "../../db/schema.js";
import { deviceAnalytics, deviceFingerprint, crossDeviceComparison } from "../../analytics/device-metrics.js";
import {
  deviceOnboardingTimeline,
  idleDevices,
  deviceCategoryAffinityShift,
  devicesWithVendorHints,
  deviceQueryRatePercentileRank,
} from "../../analytics/device-metrics.js";

export const devicesRoute = new Hono();

// v1 scope: only currently-active LAN devices are ever returned here.
devicesRoute.get("/", (c) => {
  const rows = db.select().from(devices).where(eq(devices.isActive, true)).orderBy(desc(devices.lastSeen)).all();
  return c.json(rows);
});

// Metric #28 and the new device-level list routes must be registered
// before /:deviceId or their path segment gets swallowed as a device id.
devicesRoute.get("/compare", (c) => c.json(crossDeviceComparison()));
devicesRoute.get("/idle", (c) => c.json(idleDevices(Number(c.req.query("hours") ?? 6)))); // #70
devicesRoute.get("/vendor-hints", (c) => c.json(devicesWithVendorHints())); // #72
devicesRoute.get("/rate-rank", (c) => c.json(deviceQueryRatePercentileRank())); // #73

devicesRoute.get("/:deviceId/analytics", (c) => {
  const deviceId = c.req.param("deviceId");
  const device = db.select().from(devices).where(eq(devices.deviceId, deviceId)).get();
  if (!device) return c.json({ error: "device not found" }, 404);
  return c.json({
    analytics: deviceAnalytics(deviceId), // metric #26
    fingerprint: deviceFingerprint(deviceId), // metric #27
  });
});

devicesRoute.get("/:deviceId/onboarding", (c) => c.json(deviceOnboardingTimeline(c.req.param("deviceId")))); // #69
devicesRoute.get("/:deviceId/affinity-shift", (c) => c.json(deviceCategoryAffinityShift(c.req.param("deviceId")))); // #71

devicesRoute.get("/:deviceId", (c) => {
  const deviceId = c.req.param("deviceId");
  const device = db.select().from(devices).where(eq(devices.deviceId, deviceId)).get();
  if (!device) return c.json({ error: "device not found" }, 404);

  const today = new Date().toISOString().slice(0, 10);
  const todayStats = db
    .select()
    .from(clientDaily)
    .where(and(eq(clientDaily.clientId, deviceId), eq(clientDaily.date, today)))
    .get();

  const recentEvents = db
    .select()
    .from(dnsEvents)
    .where(eq(dnsEvents.clientId, deviceId))
    .orderBy(desc(dnsEvents.id))
    .limit(50)
    .all();

  return c.json({ device, todayStats: todayStats ?? null, recentEvents });
});
