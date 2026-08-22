import { db } from "../db/client.js";
import { hostHealthSamples } from "../db/schema.js";
import { asc, desc } from "drizzle-orm";
import { distribution } from "./stats.js";
import { getRestartHistory } from "../infrastructure/restarts.js";

// -----------------------------------------------------------------------
// Metric #98 — Host Resource Utilization
//   netintel's own host CPU/memory/disk over time (the machine running
//   netintel, not the network's devices) — sourced from host_health_samples,
//   sampled every few minutes by infrastructure/sampler.ts.
// -----------------------------------------------------------------------
export function hostResourceUtilization(limit = 500) {
  const rows = db.select().from(hostHealthSamples).orderBy(desc(hostHealthSamples.id)).limit(limit).all().reverse();

  const cpuSamples = rows.map((r) => r.cpuLoadAvg1m).filter((v): v is number => v !== null);
  const memSamples = rows.map((r) => r.memoryUsedPercent);

  return {
    sampleCount: rows.length,
    cpuLoadAvg1m: cpuSamples.length > 0 ? distribution(cpuSamples) : null,
    memoryUsedPercent: memSamples.length > 0 ? distribution(memSamples) : null,
    latestDiskAvailableBytes: rows.length > 0 ? rows[rows.length - 1].diskAvailableBytes : null,
    timeline: rows.map((r) => ({
      timestamp: r.timestamp,
      cpuLoadAvg1m: r.cpuLoadAvg1m,
      memoryUsedPercent: r.memoryUsedPercent,
      diskAvailableBytes: r.diskAvailableBytes,
    })),
    note: cpuSamples.length === 0 ? "cpu_load_avg_1m is null on win32 (Node has no real os.loadavg() implementation there) — reported honestly as unavailable, not faked." : null,
  };
}

// -----------------------------------------------------------------------
// Metric #99 — Process Uptime & Restart History
//   netintel server's own uptime and restart count/reasons, from
//   infrastructure/restarts.ts's persisted server_restarts log.
// -----------------------------------------------------------------------
export function processUptimeAndRestartHistory(limit = 50) {
  const history = getRestartHistory(limit);
  const uncleanCount = history.filter((h) => h.endedAt !== null && !h.cleanShutdown).length;
  // A row with no endedAt is either the currently-running process, or a
  // process that crashed before it could record a clean shutdown — only
  // the *previous* such row (not the most recent one, which may just be
  // the live process) counts as an inferred crash.
  const inferredCrashes = history.filter((h, idx) => idx > 0 && h.endedAt === null).length;

  return {
    totalRestarts: history.length,
    inferredCrashes: inferredCrashes + uncleanCount,
    history,
  };
}

// -----------------------------------------------------------------------
// Metric #100 — Collector Health Timeline
//   Technitium reachability over time: uptime %, outage count/duration,
//   formalizing collector/health.ts's live status into a persisted,
//   chartable history via host_health_samples.
// -----------------------------------------------------------------------
export function collectorHealthTimeline(limit = 500) {
  const rows = db.select().from(hostHealthSamples).orderBy(asc(hostHealthSamples.id)).limit(limit).all();
  if (rows.length === 0) {
    return { hasData: false, note: "No host health samples recorded yet.", uptimePercent: null, outages: [] };
  }

  const reachableCount = rows.filter((r) => r.technitiumReachable).length;
  const uptimePercent = (reachableCount / rows.length) * 100;

  // Group consecutive unreachable samples into outage windows.
  const outages: { start: string; end: string; lastError: string | null }[] = [];
  let current: { start: string; end: string; lastError: string | null } | null = null;
  for (const r of rows) {
    if (!r.technitiumReachable) {
      if (!current) current = { start: r.timestamp, end: r.timestamp, lastError: r.technitiumLastError };
      else {
        current.end = r.timestamp;
        current.lastError = r.technitiumLastError ?? current.lastError;
      }
    } else if (current) {
      outages.push(current);
      current = null;
    }
  }
  if (current) outages.push(current);

  return {
    hasData: true,
    note: null,
    sampleCount: rows.length,
    uptimePercent,
    outageCount: outages.length,
    outages,
  };
}
