// Core domain types shared across server, collector, cli, and web dashboard.
// Kept dependency-free (no db/orm imports) so the web app can import this
// package directly without pulling in server-only code.

export type QueryType =
  | "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SOA" | "PTR" | "SRV" | "HTTPS" | "SVCB" | "OTHER";

export type ResponseCode = "NOERROR" | "NXDOMAIN" | "SERVFAIL" | "REFUSED" | "TIMEOUT" | "OTHER";

export type DnsProtocol = "UDP" | "TCP" | "DoT" | "DoH" | "DoQ";

export interface DnsEvent {
  id: number;
  timestamp: string; // ISO 8601
  clientId: string | null; // resolved device_id, null if not yet identified
  clientIp: string;
  protocol: DnsProtocol;
  domain: string;
  registeredDomain: string;
  queryType: QueryType;
  responseCode: ResponseCode;
  cached: boolean;
  blocked: boolean;
  recursive: boolean;
  responseTimeMs: number;
  answerTtl: number | null;
  upstream: string | null;
}

export interface Device {
  deviceId: string;
  mac: string | null;
  hostname: string | null;
  dhcpClientId: string | null;
  currentIp: string | null;
  firstSeen: string;
  lastSeen: string;
  isActive: boolean; // v1 scope: only currently-connected devices are surfaced
}

export type DomainLifecycleState =
  | "new" | "emerging" | "regular" | "dormant" | "returning" | "one_time" | "disappeared";

export interface DomainRecord {
  domain: string;
  firstSeen: string;
  lastSeen: string;
  queryCount: number;
  uniqueDays: number;
  category: string | null;
  categoryConfidence: number | null;
  categorySource: "auto" | "semi_auto" | "manual" | null;
  popularityScore: number | null;
  lifecycleState: DomainLifecycleState | null;
}

export type NotificationCategory = "security" | "network" | "performance" | "insights" | "system";
export type NotificationSeverity = "info" | "warning" | "critical";

export interface Notification {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  timestamp: string;
  title: string;
  explanation: string;
  metricId?: string;
  link?: string;
}

export type ExportFormat = "json" | "csv" | "parquet" | "sqlite" | "html" | "pdf" | "md";
export type ExportPrivacyLevel = 1 | 2 | 3 | 4;

export interface ExportRequest {
  level: ExportPrivacyLevel;
  format: ExportFormat;
  from?: string;
  to?: string;
}

export interface EngineStatus {
  technitiumReachable: boolean;
  collectorRunning: boolean;
  liveDeviceCount: number;
  uptimeSeconds: number;
  dbSizeBytes: number;
  lastEventAt: string | null;
}
