import { Hono } from "hono";
import { like, or, desc } from "drizzle-orm";
import { db } from "../../db/client.js";
import { domains, devices, savedQueries } from "../../db/schema.js";

export const searchRoute = new Hono();

searchRoute.get("/", (c) => {
  const q = c.req.query("q")?.trim();
  if (!q || q.length < 2) return c.json({ domains: [], devices: [], savedQueries: [] });

  const pattern = `%${q.toLowerCase()}%`;

  const domainResults = db
    .select({ domain: domains.domain, queryCount: domains.queryCount })
    .from(domains)
    .where(like(domains.domain, pattern))
    .orderBy(desc(domains.queryCount))
    .limit(8)
    .all();

  const deviceResults = db
    .select({ deviceId: devices.deviceId, hostname: devices.hostname, currentIp: devices.currentIp, mac: devices.mac })
    .from(devices)
    .where(or(like(devices.hostname, pattern), like(devices.currentIp, pattern), like(devices.mac, pattern)))
    .limit(8)
    .all();

  const savedQueryResults = db
    .select({ id: savedQueries.id, name: savedQueries.name, description: savedQueries.description })
    .from(savedQueries)
    .where(like(savedQueries.name, pattern))
    .limit(8)
    .all();

  return c.json({ domains: domainResults, devices: deviceResults, savedQueries: savedQueryResults });
});
