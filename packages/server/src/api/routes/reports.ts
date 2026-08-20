import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { eq, desc } from "drizzle-orm";
import { db } from "../../db/client.js";
import { reportSchedules, generatedReports } from "../../db/schema.js";
import { runDueSchedules } from "../../reports/scheduler.js";

export const reportsRoute = new Hono();

reportsRoute.get("/schedules", (c) => c.json(db.select().from(reportSchedules).all()));

reportsRoute.post("/schedules", async (c) => {
  const body = await c.req.json();
  const row = {
    id: randomUUID(),
    name: body.name as string,
    frequency: body.frequency as string,
    hourUtc: body.hourUtc ?? 6,
    dayOfWeekUtc: body.dayOfWeekUtc ?? 1,
    format: body.format ?? "pdf",
    emailTo: body.emailTo ?? null,
    enabled: body.enabled ?? true,
    createdAt: new Date().toISOString(),
    lastGeneratedAt: null,
  };
  db.insert(reportSchedules).values(row).run();
  return c.json(row, 201);
});

reportsRoute.patch("/schedules/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "frequency", "hourUtc", "dayOfWeekUtc", "format", "emailTo", "enabled"] as const) {
    if (key in body) updates[key] = body[key];
  }
  db.update(reportSchedules).set(updates).where(eq(reportSchedules.id, id)).run();
  return c.json({ ok: true });
});

reportsRoute.delete("/schedules/:id", (c) => {
  db.delete(reportSchedules).where(eq(reportSchedules.id, c.req.param("id"))).run();
  return c.json({ ok: true });
});

/** Runs due-schedule generation right now, out of band from the scheduler's own tick — useful for "generate now" / testing. */
reportsRoute.post("/schedules/run-now", async (c) => {
  await runDueSchedules();
  return c.json({ ok: true });
});

reportsRoute.get("/generated", (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  return c.json(db.select().from(generatedReports).orderBy(desc(generatedReports.generatedAt)).limit(limit).all());
});

reportsRoute.get("/generated/:id/download", (c) => {
  const report = db.select().from(generatedReports).where(eq(generatedReports.id, c.req.param("id"))).get();
  if (!report) return c.json({ error: "not found" }, 404);
  if (!fs.existsSync(report.filePath)) return c.json({ error: "report file no longer exists on disk" }, 404);

  const buffer = fs.readFileSync(report.filePath);
  const contentType = report.format === "pdf" ? "application/pdf" : report.format === "html" ? "text/html" : "application/json";
  c.header("Content-Type", contentType);
  c.header("Content-Disposition", `attachment; filename="${report.filePath.split("/").pop()}"`);
  return c.body(new Uint8Array(buffer));
});
