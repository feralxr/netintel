import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Level 1 — Raw, immutable events. Never discarded, never modified.
// See Bible section 6.
// ---------------------------------------------------------------------------
export const dnsEvents = sqliteTable(
  "dns_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    timestamp: text("timestamp").notNull(), // ISO 8601, UTC
    clientId: text("client_id"), // FK -> devices.device_id, nullable until identity resolved
    clientIp: text("client_ip").notNull(),
    protocol: text("protocol").notNull(), // UDP | TCP | DoT | DoH | DoQ
    domain: text("domain").notNull(),
    registeredDomain: text("registered_domain").notNull(), // eTLD+1
    queryType: text("query_type").notNull(),
    responseCode: text("response_code").notNull(),
    cached: integer("cached", { mode: "boolean" }).notNull().default(false),
    blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),
    recursive: integer("recursive", { mode: "boolean" }).notNull().default(false),
    responseTimeMs: real("response_time_ms").notNull(),
    answerTtl: integer("answer_ttl"),
    upstream: text("upstream"),
    upstreamProtocol: text("upstream_protocol"),
    serverInstance: text("server_instance").notNull().default("primary"),
  },
  (t) => ({
    tsIdx: index("dns_events_ts_idx").on(t.timestamp),
    domainIdx: index("dns_events_domain_idx").on(t.domain),
    clientIdx: index("dns_events_client_idx").on(t.clientId),
    regDomainIdx: index("dns_events_reg_domain_idx").on(t.registeredDomain),
  })
);

// ---------------------------------------------------------------------------
// Devices — v1 scope: only currently-active LAN devices are tracked.
// ---------------------------------------------------------------------------
export const devices = sqliteTable("devices", {
  deviceId: text("device_id").primaryKey(),
  mac: text("mac"),
  hostname: text("hostname"),
  dhcpClientId: text("dhcp_client_id"),
  currentIp: text("current_ip"),
  firstSeen: text("first_seen").notNull(),
  lastSeen: text("last_seen").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  // v2.6 — Auto-Response Actions: a device can be flagged automatically by
  // an alert policy's action, or manually by the user.
  flagged: integer("flagged", { mode: "boolean" }).notNull().default(false),
  flagReason: text("flag_reason"),
});

export const deviceIpHistory = sqliteTable(
  "device_ip_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deviceId: text("device_id").notNull(),
    ip: text("ip").notNull(),
    start: text("start").notNull(),
    end: text("end"),
  },
  (t) => ({
    deviceIdx: index("device_ip_history_device_idx").on(t.deviceId),
  })
);

// ---------------------------------------------------------------------------
// Domains — running record + classification + scoring (updated incrementally)
// ---------------------------------------------------------------------------
export const domains = sqliteTable("domains", {
  domain: text("domain").primaryKey(),
  firstSeen: text("first_seen").notNull(),
  lastSeen: text("last_seen").notNull(),
  queryCount: integer("query_count").notNull().default(0),
  uniqueDays: integer("unique_days").notNull().default(0),
  popularityScore: real("popularity_score"),
  lifecycleState: text("lifecycle_state"), // new|emerging|regular|dormant|returning|one_time|disappeared
});

export const domainCategories = sqliteTable("domain_categories", {
  domain: text("domain").primaryKey(),
  category: text("category").notNull(),
  confidence: real("confidence").notNull().default(0),
  source: text("source").notNull(), // auto | semi_auto | manual
  updatedAt: text("updated_at").notNull(),
});

export const domainRelationships = sqliteTable(
  "domain_relationships",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    domainA: text("domain_a").notNull(),
    domainB: text("domain_b").notNull(),
    cooccurrence: integer("cooccurrence").notNull().default(0),
    conditionalProbability: real("conditional_probability"),
  },
  (t) => ({
    pairIdx: index("domain_relationships_pair_idx").on(t.domainA, t.domainB),
  })
);

// ---------------------------------------------------------------------------
// Level 2 — Rollups. Computed incrementally from raw events; dashboards and
// the CLI read from these, never from dns_events directly, once volume grows.
// ---------------------------------------------------------------------------
export const domainDaily = sqliteTable(
  "domain_daily",
  {
    date: text("date").notNull(), // YYYY-MM-DD
    domain: text("domain").notNull(),
    queries: integer("queries").notNull().default(0),
    uniqueClients: integer("unique_clients").notNull().default(0),
    cacheHits: integer("cache_hits").notNull().default(0),
    blocked: integer("blocked").notNull().default(0),
    nxdomain: integer("nxdomain").notNull().default(0),
    avgLatencyMs: real("avg_latency_ms"),
    p95LatencyMs: real("p95_latency_ms"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.date, t.domain] }),
  })
);

export const clientDaily = sqliteTable(
  "client_daily",
  {
    date: text("date").notNull(),
    clientId: text("client_id").notNull(),
    queries: integer("queries").notNull().default(0),
    uniqueDomains: integer("unique_domains").notNull().default(0),
    blocked: integer("blocked").notNull().default(0),
    nxdomain: integer("nxdomain").notNull().default(0),
    cacheHitRate: real("cache_hit_rate"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.date, t.clientId] }),
  })
);

// ---------------------------------------------------------------------------
// Level 3 — Intelligence. Anomalies, insights, generated notifications.
// ---------------------------------------------------------------------------
export const insights = sqliteTable("insights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  type: text("type").notNull(), // maps to a metrics-registry id, e.g. zscore_anomaly_detection
  score: real("score"),
  explanation: text("explanation").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  category: text("category").notNull(), // security | network | performance | insights | system
  severity: text("severity").notNull(), // info | warning | critical
  timestamp: text("timestamp").notNull(),
  title: text("title").notNull(),
  explanation: text("explanation").notNull(),
  metricId: text("metric_id"),
  link: text("link"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
});

// ---------------------------------------------------------------------------
// v2 — Explorer: saved ad-hoc queries (Kentik Data Explorer-inspired)
// ---------------------------------------------------------------------------
export const savedQueries = sqliteTable("saved_queries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  definition: text("definition").notNull(), // JSON-serialized QueryDefinition (see explorer/query-engine.ts)
  chartType: text("chart_type").notNull().default("table"), // table | line | bar | area
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// v2 — Custom Dashboards
// ---------------------------------------------------------------------------
export const dashboards = sqliteTable("dashboards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const dashboardPanels = sqliteTable("dashboard_panels", {
  id: text("id").primaryKey(),
  dashboardId: text("dashboard_id").notNull(),
  savedQueryId: text("saved_query_id").notNull(),
  title: text("title").notNull(),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  w: integer("w").notNull().default(4),
  h: integer("h").notNull().default(3),
});

// ---------------------------------------------------------------------------
// v2 — Alert Policy Builder (Kentik alert-policies-inspired)
// ---------------------------------------------------------------------------
export const alertPolicies = sqliteTable("alert_policies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  definition: text("definition").notNull(), // JSON-serialized AlertPolicyDefinition (see alerting/policy-engine.ts)
  severity: text("severity").notNull().default("warning"), // info | warning | critical
  channels: text("channels").notNull().default("[]"), // JSON array: ["in_app", "webhook:<url>", "email:<addr>"]
  // v2.6 — Auto-Response Actions: JSON-serialized ActionDefinition (see
  // alerting/actions.ts). Defaults to "none" — auto-response is opt-in per
  // policy, never on by default.
  action: text("action").notNull().default('{"type":"none"}'),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastEvaluatedAt: text("last_evaluated_at"),
  lastTriggeredAt: text("last_triggered_at"),
});

export const alertEvents = sqliteTable("alert_events", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull(),
  timestamp: text("timestamp").notNull(),
  triggeredValue: real("triggered_value"),
  explanation: text("explanation").notNull(),
  acknowledged: integer("acknowledged", { mode: "boolean" }).notNull().default(false),
});

// ---------------------------------------------------------------------------
// v2 — Synthetics: active scheduled DNS probes (Kentik Synthetic Monitoring-inspired)
// ---------------------------------------------------------------------------
export const syntheticTests = sqliteTable("synthetic_tests", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  targetDomain: text("target_domain").notNull(), // domain to resolve on each run
  resolver: text("resolver").notNull(), // "technitium" | an upstream label from performance.ts's upstream set
  intervalSeconds: integer("interval_seconds").notNull().default(60),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const syntheticResults = sqliteTable(
  "synthetic_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    testId: text("test_id").notNull(),
    timestamp: text("timestamp").notNull(),
    success: integer("success", { mode: "boolean" }).notNull(),
    responseTimeMs: real("response_time_ms"),
    resolvedIp: text("resolved_ip"),
    errorMessage: text("error_message"),
  },
  (t) => ({
    testIdx: index("synthetic_results_test_idx").on(t.testId, t.timestamp),
  })
);

// ---------------------------------------------------------------------------
// v2.8 — Capacity Forecast: daily infrastructure snapshots (Kentik capacity
// planning-inspired). Upserted once per day by the scheduler so trend lines
// have real historical data to project from, not just a single point.
// ---------------------------------------------------------------------------
export const systemMetricsDaily = sqliteTable("system_metrics_daily", {
  date: text("date").primaryKey(), // YYYY-MM-DD
  dbSizeBytes: integer("db_size_bytes").notNull(),
  deviceCount: integer("device_count").notNull(),
  totalQueries: integer("total_queries").notNull(),
  availableDiskBytes: integer("available_disk_bytes"), // null if statfs unavailable on this platform
});

// ---------------------------------------------------------------------------
// v2.11 — Scheduled Reports (Kentik scheduled-reports-inspired)
// ---------------------------------------------------------------------------
export const reportSchedules = sqliteTable("report_schedules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  frequency: text("frequency").notNull(), // "daily" | "weekly"
  hourUtc: integer("hour_utc").notNull().default(6), // 0-23
  dayOfWeekUtc: integer("day_of_week_utc").default(1), // 0=Sunday..6=Saturday, only used for "weekly"
  format: text("format").notNull().default("pdf"), // "pdf" | "html"
  emailTo: text("email_to"), // optional — dispatches via the same SMTP config as alert email channels
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  lastGeneratedAt: text("last_generated_at"),
});

export const generatedReports = sqliteTable("generated_reports", {
  id: text("id").primaryKey(),
  scheduleId: text("schedule_id").notNull(),
  generatedAt: text("generated_at").notNull(),
  format: text("format").notNull(),
  filePath: text("file_path").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
});
