import chalk from "chalk";
import { apiGet } from "../api-client.js";
import { section, table, stat, noDataNote } from "../output.js";
import { renderTimeSeries } from "../charts/timeseries.js";
import { resolveChartStyle, isJsonMode } from "../config.js";

interface Forecast {
  hasData: boolean;
  note: string | null;
  currentValue: number | null;
  projected30d: number | null;
}
interface DiskRunout {
  hasData: boolean;
  note: string | null;
  daysUntilFull: number | null;
}
interface HostUtilization {
  cpuLoadAvg1m: { mean: number; p95: number } | null;
  memoryUsedPercent: { mean: number; p95: number } | null;
  note: string | null;
  timeline: { timestamp: string; cpuLoadAvg1m: number | null; memoryUsedPercent: number }[];
}
interface RestartEntry {
  startedAt: string;
  cleanShutdown: boolean;
  uptimeSeconds: number | null;
}
interface RestartHistory {
  totalRestarts: number;
  inferredCrashes: number;
  history: RestartEntry[];
}
interface CollectorHealth {
  hasData: boolean;
  note: string | null;
  uptimePercent?: number;
  outages?: { start: string; end: string; lastError: string | null }[];
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "–";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export async function systemCommand(): Promise<void> {
  const [queryVolume, dbSize, deviceCount, diskRunout, hostUtil, restarts, collectorHealth] = await Promise.all([
    apiGet<Forecast>("/api/capacity/query-volume"), // #95
    apiGet<Forecast>("/api/capacity/db-size"), // #96
    apiGet<Forecast>("/api/capacity/device-count"), // #97
    apiGet<DiskRunout>("/api/capacity/disk-runout"),
    apiGet<HostUtilization>("/api/infrastructure/host-utilization"), // #98
    apiGet<RestartHistory>("/api/infrastructure/restarts"), // #99
    apiGet<CollectorHealth>("/api/infrastructure/collector-health"), // #100
  ]);

  if (isJsonMode()) {
    console.log(JSON.stringify({ queryVolume, dbSize, deviceCount, diskRunout, hostUtil, restarts, collectorHealth }, null, 2));
    return;
  }

  console.log(chalk.bold("\nSystem overview\n"));
  stat("Query volume (30d forecast)", queryVolume.hasData && queryVolume.projected30d !== null ? Math.round(queryVolume.projected30d).toLocaleString() : "no data yet", 30);
  stat("DB size (30d forecast)", dbSize.hasData && dbSize.projected30d !== null ? formatBytes(dbSize.projected30d) : "no data yet", 30);
  stat("Devices (30d forecast)", deviceCount.hasData && deviceCount.projected30d !== null ? Math.round(deviceCount.projected30d) : "no data yet", 30);
  stat("Collector uptime", collectorHealth.hasData ? `${collectorHealth.uptimePercent?.toFixed(1)}%` : "no data yet", 30);
  if (hostUtil.memoryUsedPercent) stat("Host memory used (mean)", `${hostUtil.memoryUsedPercent.mean.toFixed(1)}%`, 30);
  if (hostUtil.cpuLoadAvg1m) stat("Host CPU load (mean)", hostUtil.cpuLoadAvg1m.mean.toFixed(2), 30);
  noDataNote(hostUtil.note);

  if (hostUtil.timeline.length > 0) {
    section("Host resource utilization (CPU load / memory used %)");
    const recent = hostUtil.timeline.slice(-40);
    console.log(
      renderTimeSeries(
        [
          { label: "memory %", values: recent.map((t) => t.memoryUsedPercent) },
          ...(recent.some((t) => t.cpuLoadAvg1m !== null) ? [{ label: "cpu load", values: recent.map((t) => t.cpuLoadAvg1m ?? 0) }] : []),
        ],
        resolveChartStyle(),
        { height: 8 }
      )
    );
  }

  if (diskRunout.hasData && diskRunout.daysUntilFull !== null) {
    stat("Estimated disk runout", `${diskRunout.daysUntilFull.toFixed(0)} days`);
  } else {
    noDataNote(diskRunout.note);
  }

  section("Restart history");
  stat("Total restarts", restarts.totalRestarts, 20);
  stat("Inferred crashes", restarts.inferredCrashes, 20);
  table(
    restarts.history.slice(0, 10).map((r) => ({
      startedAt: new Date(r.startedAt).toLocaleString(),
      shutdown: r.cleanShutdown ? "clean" : "unclean / running",
      uptime: r.uptimeSeconds !== null ? `${(r.uptimeSeconds / 60).toFixed(1)} min` : "–",
    })),
    [
      { key: "startedAt", label: "Started" },
      { key: "shutdown", label: "Shutdown" },
      { key: "uptime", label: "Uptime" },
    ]
  );

  section("Collector outages");
  if (collectorHealth.hasData) {
    table(
      (collectorHealth.outages ?? []).map((o) => ({ start: new Date(o.start).toLocaleString(), end: new Date(o.end).toLocaleString(), lastError: o.lastError ?? "–" })),
      [
        { key: "start", label: "Start" },
        { key: "end", label: "End" },
        { key: "lastError", label: "Last error" },
      ],
      "No outages recorded."
    );
  } else {
    noDataNote(collectorHealth.note);
  }

  console.log();
}
