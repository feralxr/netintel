import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { domains, domainDaily, domainCategories, dnsEvents } from "../../db/schema.js";

export const domainsRoute = new Hono();

domainsRoute.get("/", (c) => {
  const limit = Number(c.req.query("limit") ?? 100);
  const rows = db.select().from(domains).orderBy(desc(domains.queryCount)).limit(limit).all();
  return c.json(rows);
});

domainsRoute.get("/:domain", (c) => {
  const domain = c.req.param("domain");
  const record = db.select().from(domains).where(eq(domains.domain, domain)).get();
  if (!record) return c.json({ error: "domain not found" }, 404);

  const category = db.select().from(domainCategories).where(eq(domainCategories.domain, domain)).get();
  const dailyHistory = db
    .select()
    .from(domainDaily)
    .where(eq(domainDaily.domain, domain))
    .orderBy(desc(domainDaily.date))
    .limit(90)
    .all();
  const recentQueries = db
    .select()
    .from(dnsEvents)
    .where(eq(dnsEvents.domain, domain))
    .orderBy(desc(dnsEvents.id))
    .limit(50)
    .all();

  return c.json({ record, category: category ?? null, dailyHistory, recentQueries });
});
