import { db } from "../db/client.js";
import { dnsEvents, domainCategories, devices } from "../db/schema.js";
import { sql, and, or, eq, gte, lte, gt, lt, ne, like, type SQL } from "drizzle-orm";

// ---------------------------------------------------------------------------
// The Explorer query engine — a generic ad-hoc analytics query over raw
// dns_events, inspired by Kentik's Data Explorer: pick dimensions, filter
// (nested AND/OR), group by, choose a time range/interval, and get back
// either a table or a time-series suitable for charting.
//
// This is intentionally the ONE place that turns a user-authored query into
// SQL — Dashboards panels, Alert Policies, and the Explorer UI all share
// this same engine so behavior is consistent everywhere a query runs.
// ---------------------------------------------------------------------------

export const DIMENSIONS = [
  "domain",
  "registeredDomain",
  "clientId",
  "clientIp",
  "protocol",
  "queryType",
  "responseCode",
  "cached",
  "blocked",
  "recursive",
  "category", // joined from domain_categories
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const METRICS = ["count", "uniqueDomains", "uniqueClients", "avgResponseTime", "blockedCount", "nxdomainCount"] as const;
export type QueryMetric = (typeof METRICS)[number];

export type FilterOperator = "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "contains";

export interface FilterCondition {
  dimension: Dimension;
  operator: FilterOperator;
  value: string | number | boolean;
}

export interface FilterGroup {
  logic: "AND" | "OR";
  conditions: (FilterCondition | FilterGroup)[];
}

export interface QueryDefinition {
  metric: QueryMetric;
  groupBy?: Dimension[];
  filter?: FilterGroup;
  timeRange: { from: string; to: string }; // ISO timestamps
  interval?: "hour" | "day" | null; // null/omitted = no time bucketing, one row per group
  limit?: number;
}

export interface QueryResultRow {
  [key: string]: string | number | boolean | null;
}

export interface QueryResult {
  rows: QueryResultRow[];
  definition: QueryDefinition;
  rowCount: number;
}

const DIMENSION_COLUMNS: Record<Dimension, SQL | ReturnType<typeof sql>> = {
  domain: sql`${dnsEvents.domain}`,
  registeredDomain: sql`${dnsEvents.registeredDomain}`,
  clientId: sql`${dnsEvents.clientId}`,
  clientIp: sql`${dnsEvents.clientIp}`,
  protocol: sql`${dnsEvents.protocol}`,
  queryType: sql`${dnsEvents.queryType}`,
  responseCode: sql`${dnsEvents.responseCode}`,
  cached: sql`${dnsEvents.cached}`,
  blocked: sql`${dnsEvents.blocked}`,
  recursive: sql`${dnsEvents.recursive}`,
  category: sql`coalesce(${domainCategories.category}, 'uncategorized')`,
};

function buildFilterSql(filter: FilterGroup | undefined): SQL | undefined {
  if (!filter || filter.conditions.length === 0) return undefined;

  const parts = filter.conditions.map((c) => {
    if ("logic" in c) return buildFilterSql(c);
    return buildConditionSql(c);
  });
  const validParts = parts.filter((p): p is SQL => p !== undefined);
  if (validParts.length === 0) return undefined;

  return filter.logic === "OR" ? or(...validParts) : and(...validParts);
}

function buildConditionSql(c: FilterCondition): SQL {
  const col = DIMENSION_COLUMNS[c.dimension];
  // better-sqlite3 only accepts numbers/strings/bigints/buffers/null as bind
  // params — JS booleans (used for the cached/blocked/recursive dimensions)
  // have to be coerced to 1/0 before binding.
  const value = typeof c.value === "boolean" ? (c.value ? 1 : 0) : c.value;
  switch (c.operator) {
    case "eq":
      return sql`${col} = ${value}`;
    case "ne":
      return sql`${col} != ${value}`;
    case "gt":
      return sql`${col} > ${value}`;
    case "lt":
      return sql`${col} < ${value}`;
    case "gte":
      return sql`${col} >= ${value}`;
    case "lte":
      return sql`${col} <= ${value}`;
    case "contains":
      return sql`${col} LIKE ${"%" + String(value) + "%"}`;
  }
}

function metricSql(metric: QueryMetric): SQL {
  switch (metric) {
    case "count":
      return sql`count(*)`;
    case "uniqueDomains":
      return sql`count(distinct ${dnsEvents.domain})`;
    case "uniqueClients":
      return sql`count(distinct ${dnsEvents.clientId})`;
    case "avgResponseTime":
      return sql`avg(${dnsEvents.responseTimeMs})`;
    case "blockedCount":
      return sql`sum(case when ${dnsEvents.blocked} then 1 else 0 end)`;
    case "nxdomainCount":
      return sql`sum(case when ${dnsEvents.responseCode} = 'NXDOMAIN' then 1 else 0 end)`;
  }
}

/** Runs an Explorer query definition and returns rows. This is the single execution path shared by Explorer, Dashboards, and Alert Policies. */
export function runQuery(def: QueryDefinition): QueryResult {
  const needsCategoryJoin = (def.groupBy ?? []).includes("category") || filterUsesDimension(def.filter, "category");

  const selectFields: Record<string, SQL> = { value: metricSql(def.metric) };
  const bucketExpr =
    def.interval === "hour"
      ? sql`strftime('%Y-%m-%dT%H:00:00Z', ${dnsEvents.timestamp})`
      : def.interval === "day"
        ? sql`substr(${dnsEvents.timestamp}, 1, 10)`
        : null;
  if (bucketExpr) selectFields.bucket = bucketExpr;
  for (const dim of def.groupBy ?? []) {
    selectFields[dim] = DIMENSION_COLUMNS[dim] as SQL;
  }

  const whereClauses: SQL[] = [gte(dnsEvents.timestamp, def.timeRange.from), lte(dnsEvents.timestamp, def.timeRange.to)];
  const filterSql = buildFilterSql(def.filter);
  if (filterSql) whereClauses.push(filterSql);

  let query = db.select(selectFields as never).from(dnsEvents).$dynamic();
  if (needsCategoryJoin) {
    query = query.leftJoin(domainCategories, eq(dnsEvents.domain, domainCategories.domain));
  }
  query = query.where(and(...whereClauses));

  const groupByCols: SQL[] = [];
  if (bucketExpr) groupByCols.push(bucketExpr);
  for (const dim of def.groupBy ?? []) groupByCols.push(sql`${DIMENSION_COLUMNS[dim]}`);
  if (groupByCols.length > 0) query = query.groupBy(...groupByCols);

  query = query.orderBy(sql`${metricSql(def.metric)} desc`).limit(def.limit ?? 500);

  const rows = query.all() as QueryResultRow[];
  return { rows, definition: def, rowCount: rows.length };
}

function filterUsesDimension(filter: FilterGroup | undefined, dim: Dimension): boolean {
  if (!filter) return false;
  return filter.conditions.some((c) => ("logic" in c ? filterUsesDimension(c, dim) : c.dimension === dim));
}

/** For the "show API call" UX (Kentik Data Explorer-inspired): renders the query definition as a copy-pasteable curl command. */
export function toCurlCommand(def: QueryDefinition, baseUrl = "http://localhost:8787"): string {
  const body = JSON.stringify(def);
  return `curl -X POST '${baseUrl}/api/explorer/query' -H 'Content-Type: application/json' -d '${body.replace(/'/g, "'\\''")}'`;
}
