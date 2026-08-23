import { desc } from "drizzle-orm";
import fs from "node:fs";
import { db, dbPath } from "../db/client.js";
import { dhcpLeaseEvents, hostHealthSamples } from "../db/schema.js";
import { forecastDiskRunout } from "../capacity/forecast.js";
import { getRestartHistory } from "../infrastructure/restarts.js";
import { punycodeDomains, dnsTunnelingHeuristics, suspiciousTldExposure } from "../analytics/security-metrics.js";

export interface AlertableMetric {
  id: string;
  label: string;
  group: "dhcp" | "infrastructure" | "capacity" | "security";
  unit: string;
  /** null = not currently available (e.g. cpu load on win32, or not enough history yet) — the condition just won't breach. */
  compute: () => number | null;
}

function latestHostSamples(n: number) {
  return db.select().from(hostHealthSamples).orderBy(desc(hostHealthSamples.id)).limit(n).all();
}

/**
 * Metrics here feed alert conditions with `source: "metric_snapshot"` (see
 * alerting/policy-engine.ts). Unlike Explorer-based conditions, these are
 * point-in-time reads of a fixed, curated metric rather than an arbitrary
 * dns_events aggregate — because dhcp_lease_events, host_health_samples,
 * and server_restarts aren't tables the Explorer's query engine knows how
 * to query, and metrics like forecasts or candidate-signal counts aren't
 * simple SQL aggregates at all.
 */
export const ALERTABLE_METRICS: AlertableMetric[] = [
  {
    id: "host_memory_used_percent",
    label: "Host memory used %",
    group: "infrastructure",
    unit: "%",
    compute: () => latestHostSamples(1)[0]?.memoryUsedPercent ?? null,
  },
  {
    id: "host_cpu_load_avg_1m",
    label: "Host CPU load (1m avg)",
    group: "infrastructure",
    unit: "",
    compute: () => latestHostSamples(1)[0]?.cpuLoadAvg1m ?? null,
  },
  {
    id: "collector_uptime_percent_recent",
    label: "Collector uptime % (last 20 checks)",
    group: "infrastructure",
    unit: "%",
    compute: () => {
      const samples = latestHostSamples(20);
      if (samples.length === 0) return null;
      return (samples.filter((s) => s.technitiumReachable).length / samples.length) * 100;
    },
  },
  {
    id: "collector_consecutive_outage_samples",
    label: "Collector consecutive failed checks",
    group: "infrastructure",
    unit: "checks",
    compute: () => {
      const samples = latestHostSamples(50); // newest-first
      let count = 0;
      for (const s of samples) {
        if (s.technitiumReachable) break;
        count++;
      }
      return count;
    },
  },
  {
    id: "restarts_last_24h",
    label: "Server restarts (last 24h)",
    group: "infrastructure",
    unit: "restarts",
    compute: () => {
      const cutoff = Date.now() - 24 * 3600_000;
      return getRestartHistory(50).filter((r) => new Date(r.startedAt).getTime() >= cutoff).length;
    },
  },
  {
    id: "dhcp_lease_churn_today",
    label: "DHCP lease churn today (new + renewed + IP changed + expired)",
    group: "dhcp",
    unit: "events",
    compute: () => {
      const today = new Date().toISOString().slice(0, 10);
      return db
        .select({ recordedAt: dhcpLeaseEvents.recordedAt })
        .from(dhcpLeaseEvents)
        .all()
        .filter((e) => e.recordedAt.slice(0, 10) === today).length;
    },
  },
  {
    id: "db_size_bytes",
    label: "Database file size",
    group: "capacity",
    unit: "bytes",
    compute: () => {
      try {
        return fs.statSync(dbPath).size;
      } catch {
        return null;
      }
    },
  },
  {
    id: "disk_days_until_full",
    label: "Estimated days until disk full",
    group: "capacity",
    unit: "days",
    compute: () => forecastDiskRunout().daysUntilFull,
  },
  {
    id: "punycode_domain_count",
    label: "Punycode/homograph domains observed",
    group: "security",
    unit: "domains",
    compute: () => punycodeDomains().punycodeDomainCount,
  },
  {
    id: "dns_tunneling_candidate_count",
    label: "DNS tunneling candidate domains",
    group: "security",
    unit: "domains",
    compute: () => dnsTunnelingHeuristics().candidates.length,
  },
  {
    id: "suspicious_tld_share_percent",
    label: "Suspicious TLD share of all queries",
    group: "security",
    unit: "%",
    compute: () => suspiciousTldExposure().share * 100,
  },
];

export const ALERTABLE_METRICS_BY_ID = new Map(ALERTABLE_METRICS.map((m) => [m.id, m]));
