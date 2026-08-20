import os from "node:os";
import fs from "node:fs";
import { dbPath } from "../db/client.js";
import { getTechnitiumHealth } from "../collector/health.js";

export interface HostHealth {
  platform: string;
  cpuCoreCount: number;
  cpuLoadAvg1m: number | null; // os.loadavg() is a no-op returning [0,0,0] on Windows — reported as null there, not faked
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedPercent: number;
  diskAvailableBytes: number | null;
  hostUptimeSeconds: number;
  processUptimeSeconds: number;
  technitiumReachable: boolean;
  technitiumLastError: string | null;
}

function diskAvailableBytes(): number | null {
  try {
    const stats = fs.statfsSync(dbPath);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

export function getHostHealth(): HostHealth {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const platform = os.platform();

  // os.loadavg() always returns [0, 0, 0] on Windows (Node has no real
  // implementation there) — reporting it as null on win32 rather than a
  // misleading 0%, consistent with the project's "report unknown honestly"
  // discipline elsewhere (TTL, upstream comparison, statfs).
  const loadAvg = platform === "win32" ? null : os.loadavg()[0];

  const health = getTechnitiumHealth();

  return {
    platform,
    cpuCoreCount: os.cpus().length,
    cpuLoadAvg1m: loadAvg,
    memoryTotalBytes: totalMem,
    memoryFreeBytes: freeMem,
    memoryUsedPercent: ((totalMem - freeMem) / totalMem) * 100,
    diskAvailableBytes: diskAvailableBytes(),
    hostUptimeSeconds: os.uptime(),
    processUptimeSeconds: process.uptime(),
    technitiumReachable: health.reachable,
    technitiumLastError: health.lastError,
  };
}
