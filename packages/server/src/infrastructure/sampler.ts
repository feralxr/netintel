import { db } from "../db/client.js";
import { hostHealthSamples } from "../db/schema.js";
import { getHostHealth } from "./health.js";

/**
 * Persists a snapshot of getHostHealth() (host CPU/memory/disk + collector
 * reachability) so #98 (Host Resource Utilization) and #100 (Collector
 * Health Timeline) have real history to chart instead of only a live
 * reading. infrastructure/health.ts and collector/health.ts remain the
 * live/in-memory source of truth for /api/status; this is the persisted
 * layer on top, sampled independently of the request/response cycle.
 */
function sampleOnce(): void {
  const health = getHostHealth();
  db.insert(hostHealthSamples)
    .values({
      timestamp: new Date().toISOString(),
      cpuLoadAvg1m: health.cpuLoadAvg1m,
      memoryUsedPercent: health.memoryUsedPercent,
      diskAvailableBytes: health.diskAvailableBytes,
      technitiumReachable: health.technitiumReachable,
      technitiumLastError: health.technitiumLastError,
    })
    .run();
}

export function startHostHealthSampler(intervalMs = 5 * 60_000): () => void {
  const run = () => {
    try {
      sampleOnce();
    } catch (err) {
      console.error("[infrastructure] host health sample failed:", err);
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  return () => clearInterval(timer);
}
