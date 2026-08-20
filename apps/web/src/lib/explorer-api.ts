export type Dimension =
  | "domain"
  | "registeredDomain"
  | "clientId"
  | "clientIp"
  | "protocol"
  | "queryType"
  | "responseCode"
  | "cached"
  | "blocked"
  | "recursive"
  | "category";

export type QueryMetric = "count" | "uniqueDomains" | "uniqueClients" | "avgResponseTime" | "blockedCount" | "nxdomainCount";

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
  timeRange: { from: string; to: string };
  interval?: "hour" | "day" | null;
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

export async function runExplorerQuery(def: QueryDefinition): Promise<QueryResult> {
  const res = await fetch("/api/explorer/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) throw new Error(`Explorer query failed: ${res.status}`);
  return res.json();
}
