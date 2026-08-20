import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { eq, desc, and, gte } from "drizzle-orm";
import { db } from "../../db/client.js";
import { syntheticTests, syntheticResults } from "../../db/schema.js";
import { reloadSyntheticsScheduler } from "../../synthetics/scheduler.js";
import { distribution } from "../../analytics/stats.js";

export const syntheticsRoute = new Hono();

syntheticsRoute.get("/tests", (c) => c.json(db.select().from(syntheticTests).all()));

syntheticsRoute.post("/tests", async (c) => {
  const body = await c.req.json();
  const row = {
    id: randomUUID(),
    name: body.name as string,
    targetDomain: body.targetDomain as string,
    resolver: body.resolver as string, // "technitium" | "cloudflare" | "google" | "quad9" | raw IP
    intervalSeconds: body.intervalSeconds ?? 60,
    enabled: body.enabled ?? true,
    createdAt: new Date().toISOString(),
  };
  db.insert(syntheticTests).values(row).run();
  reloadSyntheticsScheduler();
  return c.json(row, 201);
});

syntheticsRoute.patch("/tests/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "targetDomain", "resolver", "intervalSeconds", "enabled"] as const) {
    if (key in body) updates[key] = body[key];
  }
  db.update(syntheticTests).set(updates).where(eq(syntheticTests.id, id)).run();
  reloadSyntheticsScheduler();
  return c.json({ ok: true });
});

syntheticsRoute.delete("/tests/:id", (c) => {
  const id = c.req.param("id");
  db.delete(syntheticResults).where(eq(syntheticResults.testId, id)).run();
  db.delete(syntheticTests).where(eq(syntheticTests.id, id)).run();
  reloadSyntheticsScheduler();
  return c.json({ ok: true });
});

/** Recent raw results for one test, newest first. */
syntheticsRoute.get("/tests/:id/results", (c) => {
  const id = c.req.param("id");
  const limit = Number(c.req.query("limit") ?? 100);
  const rows = db.select().from(syntheticResults).where(eq(syntheticResults.testId, id)).orderBy(desc(syntheticResults.timestamp)).limit(limit).all();
  return c.json(rows);
});

/** Summary stats for one test over a lookback window: uptime %, latency distribution. */
syntheticsRoute.get("/tests/:id/summary", (c) => {
  const id = c.req.param("id");
  const lookbackHours = Number(c.req.query("hours") ?? 24);
  const since = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();

  const rows = db
    .select()
    .from(syntheticResults)
    .where(and(eq(syntheticResults.testId, id), gte(syntheticResults.timestamp, since)))
    .all();

  const successCount = rows.filter((r) => r.success).length;
  const latencies = rows.filter((r) => r.success && r.responseTimeMs !== null).map((r) => r.responseTimeMs as number);

  return c.json({
    testId: id,
    lookbackHours,
    totalProbes: rows.length,
    successCount,
    failureCount: rows.length - successCount,
    uptimePercent: rows.length > 0 ? (successCount / rows.length) * 100 : null,
    latency: latencies.length > 0 ? distribution(latencies) : null,
  });
});
