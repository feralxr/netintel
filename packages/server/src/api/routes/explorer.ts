import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { savedQueries } from "../../db/schema.js";
import { runQuery, toCurlCommand, DIMENSIONS, METRICS, type QueryDefinition } from "../../explorer/query-engine.js";

export const explorerRoute = new Hono();

explorerRoute.get("/schema", (c) => c.json({ dimensions: DIMENSIONS, metrics: METRICS }));

explorerRoute.post("/query", async (c) => {
  const def = (await c.req.json()) as QueryDefinition;
  try {
    const result = runQuery(def);
    return c.json(result);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

explorerRoute.post("/query/curl", async (c) => {
  const def = (await c.req.json()) as QueryDefinition;
  return c.json({ curl: toCurlCommand(def) });
});

// --- Saved queries (Explorer "views") ---

explorerRoute.get("/views", (c) => c.json(db.select().from(savedQueries).all()));

explorerRoute.post("/views", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    name: body.name as string,
    description: (body.description as string) ?? null,
    definition: JSON.stringify(body.definition),
    chartType: (body.chartType as string) ?? "table",
    createdAt: now,
    updatedAt: now,
  };
  db.insert(savedQueries).values(row).run();
  return c.json(row, 201);
});

explorerRoute.get("/views/:id", (c) => {
  const row = db.select().from(savedQueries).where(eq(savedQueries.id, c.req.param("id"))).get();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

explorerRoute.delete("/views/:id", (c) => {
  db.delete(savedQueries).where(eq(savedQueries.id, c.req.param("id"))).run();
  return c.json({ ok: true });
});
