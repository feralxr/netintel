import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { db } from "../../db/client.js";
import { insights } from "../../db/schema.js";

export const insightsRoute = new Hono();

insightsRoute.get("/", (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  return c.json(db.select().from(insights).orderBy(desc(insights.timestamp)).limit(limit).all());
});
