import type {
  EngineStatus,
  Device,
  DomainRecord,
  Notification,
  MetricDefinition,
} from "@netintel/shared";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

// Exported for pages that fetch one-off endpoints not worth adding a
// dedicated typed wrapper for below — same base path, same error handling.
export { apiGet };

export const api = {
  status: () => apiGet<EngineStatus>("/status"),
  devices: () => apiGet<Device[]>("/devices"),
  device: (id: string) => apiGet<{ device: Device; todayStats: unknown; recentEvents: unknown[] }>(`/devices/${id}`),
  domains: (limit = 100) => apiGet<DomainRecord[]>(`/domains?limit=${limit}`),
  domain: (domain: string) =>
    apiGet<{
      record: DomainRecord;
      category: { category: string; confidence: number; source: string } | null;
      dailyHistory: { date: string; queries: number; cacheHits: number; blocked: number; nxdomain: number }[];
      recentQueries: unknown[];
    }>(`/domains/${encodeURIComponent(domain)}`),
  notifications: (limit = 50) => apiGet<Notification[]>(`/notifications?limit=${limit}`),
  metrics: () => apiGet<MetricDefinition[]>("/metrics"),
  metric: (id: string) => apiGet<MetricDefinition>(`/metrics/${id}`),
};

export const analytics = {
  concentration: () => apiGet<{ top1Share: number; top5Share: number; top10Share: number; top50Share: number; hhi: number; totalDomains: number }>("/analytics/concentration"),
  categories: () => apiGet<{ category: string; queries: number; uniqueDomains: number; share: number }[]>("/analytics/categories"),
  tracking: () => apiGet<{ trackerQueries: number; uniqueTrackers: number; trackerRatio: number; topTrackers: { domain: string; count: number }[] }>("/analytics/tracking"),
  firstThirdParty: () => apiGet<{ thirdPartyQueries: number; firstPartyQueries: number; thirdPartyRatio: number }>("/analytics/first-third-party"),
  timeOfDay: () => apiGet<{ hourCounts: number[]; peakHour: number; quietHour: number; activityRatio: number; total: number }>("/analytics/time-of-day"),
  dayOfWeek: () => apiGet<{ day: string; queries: number }[]>("/analytics/day-of-week"),
};

export interface GraphNode {
  id: string;
  clusterId: number;
  queryCount: number;
}
export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  strength: number;
}
export interface RelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const relationshipGraph = () => apiGet<RelationshipGraph>("/behavioral/graph");
