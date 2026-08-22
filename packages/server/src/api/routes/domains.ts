import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { domains, domainDaily, domainCategories, dnsEvents } from "../../db/schema.js";
import {
  domainResponseCodeDistribution,
  domainCoVisitRecency,
  domainQueryBurstiness,
  subdomainFragmentation,
  topFragmentedDomains,
  domainsByDecayScore,
} from "../../analytics/domain-metrics.js";

export const domainsRoute = new Hono();

domainsRoute.get("/", (c) => {
  const limit = Number(c.req.query("limit") ?? 100);
  const rows = db.select().from(domains).orderBy(desc(domains.queryCount)).limit(limit).all();
  return c.json(rows);
});

// Metric #52 — must be registered before /:domain routes so "co-visit" isn't swallowed as a domain name.
domainsRoute.get("/co-visit", (c) => {
  const a = c.req.query("a");
  const b = c.req.query("b");
  if (!a || !b) return c.json({ error: "query params 'a' and 'b' are required" }, 400);
  return c.json(domainCoVisitRecency(a, b));
});

// Metric #55 — must be registered before /:domain for the same reason.
domainsRoute.get("/decay", (c) => c.json(domainsByDecayScore(Number(c.req.query("lambda") ?? 0.15), Number(c.req.query("limit") ?? 50))));

// Metric #54's network-wide leaderboard — must be registered before /:domain.
domainsRoute.get("/fragmentation/top", (c) => c.json(topFragmentedDomains(Number(c.req.query("limit") ?? 20))));

domainsRoute.get("/:domain/response-codes", (c) => c.json(domainResponseCodeDistribution(c.req.param("domain")))); // #51
domainsRoute.get("/:domain/burstiness", (c) => c.json(domainQueryBurstiness(c.req.param("domain")))); // #53
domainsRoute.get("/:domain/fragmentation", (c) => c.json(subdomainFragmentation(c.req.param("domain")))); // #54

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
