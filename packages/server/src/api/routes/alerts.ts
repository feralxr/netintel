import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { db } from "../../db/client.js";
import { alertPolicies, alertEvents } from "../../db/schema.js";
import { evaluatePolicy, type AlertPolicyDefinition } from "../../alerting/policy-engine.js";

export const alertsRoute = new Hono();

alertsRoute.get("/policies", (c) => c.json(db.select().from(alertPolicies).all()));

alertsRoute.post("/policies", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    name: body.name as string,
    enabled: body.enabled ?? true,
    definition: JSON.stringify(body.definition),
    severity: body.severity ?? "warning",
    channels: JSON.stringify(body.channels ?? ["in_app"]),
    action: JSON.stringify(body.action ?? { type: "none" }),
    createdAt: now,
    updatedAt: now,
    lastEvaluatedAt: null,
    lastTriggeredAt: null,
  };
  db.insert(alertPolicies).values(row).run();
  return c.json(row, 201);
});

alertsRoute.patch("/policies/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if ("enabled" in body) updates.enabled = body.enabled;
  if ("name" in body) updates.name = body.name;
  if ("definition" in body) updates.definition = JSON.stringify(body.definition);
  if ("severity" in body) updates.severity = body.severity;
  if ("channels" in body) updates.channels = JSON.stringify(body.channels);
  if ("action" in body) updates.action = JSON.stringify(body.action);
  db.update(alertPolicies).set(updates).where(eq(alertPolicies.id, id)).run();
  return c.json({ ok: true });
});

alertsRoute.delete("/policies/:id", (c) => {
  const id = c.req.param("id");
  db.delete(alertEvents).where(eq(alertEvents.policyId, id)).run();
  db.delete(alertPolicies).where(eq(alertPolicies.id, id)).run();
  return c.json({ ok: true });
});

/** Test-evaluates a policy definition right now, without saving it — lets the UI show "would this fire?" before the user commits to it. */
alertsRoute.post("/policies/test", async (c) => {
  const definition = (await c.req.json()) as AlertPolicyDefinition;
  try {
    return c.json(evaluatePolicy(definition));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

alertsRoute.get("/events", (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  return c.json(db.select().from(alertEvents).orderBy(desc(alertEvents.timestamp)).limit(limit).all());
});

alertsRoute.post("/events/:id/acknowledge", (c) => {
  db.update(alertEvents).set({ acknowledged: true }).where(eq(alertEvents.id, c.req.param("id"))).run();
  return c.json({ ok: true });
});
