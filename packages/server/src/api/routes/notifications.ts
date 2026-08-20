import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { notifications } from "../../db/schema.js";

export const notificationsRoute = new Hono();

notificationsRoute.get("/", (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  const rows = db.select().from(notifications).orderBy(desc(notifications.timestamp)).limit(limit).all();
  return c.json(rows);
});

notificationsRoute.post("/:id/read", (c) => {
  const id = c.req.param("id");
  db.update(notifications).set({ read: true }).where(eq(notifications.id, id)).run();
  return c.json({ ok: true });
});
