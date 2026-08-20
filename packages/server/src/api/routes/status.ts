import { Hono } from "hono";
import { desc, sql, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { dnsEvents, devices } from "../../db/schema.js";
import fs from "node:fs";
import { dbPath } from "../../db/client.js";
import { getTechnitiumHealth } from "../../collector/health.js";
import type { EngineStatus } from "@netintel/shared";

export const statusRoute = new Hono();
const startedAt = Date.now();

statusRoute.get("/", (c) => {
  const lastEvent = db.select().from(dnsEvents).orderBy(desc(dnsEvents.id)).limit(1).all()[0];
  const liveDeviceCount = db
    .select({ count: sql<number>`count(*)` })
    .from(devices)
    .where(eq(devices.isActive, true))
    .get()?.count ?? 0;

  let dbSizeBytes = 0;
  try {
    dbSizeBytes = fs.statSync(dbPath).size;
  } catch {
    // db not created yet
  }

  const health = getTechnitiumHealth();

  const status: EngineStatus & { technitiumLastError: string | null } = {
    technitiumReachable: health.reachable,
    technitiumLastError: health.lastError,
    collectorRunning: true,
    liveDeviceCount,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    dbSizeBytes,
    lastEventAt: lastEvent?.timestamp ?? null,
  };
  return c.json(status);
});
