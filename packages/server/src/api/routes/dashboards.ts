import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { dashboards, dashboardPanels, savedQueries } from "../../db/schema.js";
import { runQuery, type QueryDefinition } from "../../explorer/query-engine.js";

export const dashboardsRoute = new Hono();

dashboardsRoute.get("/", (c) => c.json(db.select().from(dashboards).all()));

dashboardsRoute.post("/", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  const row = { id: randomUUID(), name: body.name as string, createdAt: now, updatedAt: now };
  db.insert(dashboards).values(row).run();
  return c.json(row, 201);
});

dashboardsRoute.delete("/:id", (c) => {
  const id = c.req.param("id");
  db.delete(dashboardPanels).where(eq(dashboardPanels.dashboardId, id)).run();
  db.delete(dashboards).where(eq(dashboards.id, id)).run();
  return c.json({ ok: true });
});

/** Returns the dashboard + all its panels + each panel's LIVE query result in one call, so the frontend doesn't need N round-trips to render a dashboard. */
dashboardsRoute.get("/:id/render", (c) => {
  const id = c.req.param("id");
  const dashboard = db.select().from(dashboards).where(eq(dashboards.id, id)).get();
  if (!dashboard) return c.json({ error: "not found" }, 404);

  const panels = db.select().from(dashboardPanels).where(eq(dashboardPanels.dashboardId, id)).all();

  const renderedPanels = panels.map((panel) => {
    const savedQuery = db.select().from(savedQueries).where(eq(savedQueries.id, panel.savedQueryId)).get();
    if (!savedQuery) {
      return { ...panel, error: "referenced saved query no longer exists", result: null, chartType: "table" };
    }
    try {
      const definition = JSON.parse(savedQuery.definition) as QueryDefinition;
      const result = runQuery(definition);
      return { ...panel, chartType: savedQuery.chartType, queryName: savedQuery.name, result, error: null };
    } catch (err) {
      return { ...panel, chartType: savedQuery.chartType, queryName: savedQuery.name, result: null, error: (err as Error).message };
    }
  });

  return c.json({ dashboard, panels: renderedPanels });
});

dashboardsRoute.post("/:id/panels", async (c) => {
  const dashboardId = c.req.param("id");
  const body = await c.req.json();
  const row = {
    id: randomUUID(),
    dashboardId,
    savedQueryId: body.savedQueryId as string,
    title: body.title as string,
    x: body.x ?? 0,
    y: body.y ?? 0,
    w: body.w ?? 4,
    h: body.h ?? 3,
  };
  db.insert(dashboardPanels).values(row).run();
  db.update(dashboards).set({ updatedAt: new Date().toISOString() }).where(eq(dashboards.id, dashboardId)).run();
  return c.json(row, 201);
});

dashboardsRoute.patch("/:id/panels/:panelId", async (c) => {
  const panelId = c.req.param("panelId");
  const body = await c.req.json();
  const updates: Partial<typeof dashboardPanels.$inferInsert> = {};
  for (const key of ["x", "y", "w", "h", "title"] as const) {
    if (key in body) (updates as Record<string, unknown>)[key] = body[key];
  }
  db.update(dashboardPanels).set(updates).where(eq(dashboardPanels.id, panelId)).run();
  return c.json({ ok: true });
});

dashboardsRoute.delete("/:id/panels/:panelId", (c) => {
  db.delete(dashboardPanels).where(eq(dashboardPanels.id, c.req.param("panelId"))).run();
  return c.json({ ok: true });
});
