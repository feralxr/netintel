import { useQuery } from "@tanstack/react-query";
import { Layout } from "../components/Layout";
import { MetricCard } from "../components/MetricCard";
import { MetricExplain } from "../components/MetricExplain";
import { DataTable } from "../components/DataTable";
import { SeriesLineChart } from "../components/charts/SeriesLineChart";
import { apiGet } from "../lib/api";

interface Forecast {
  hasData: boolean;
  note: string | null;
  historyDays: number;
  currentValue: number | null;
  dailyChangeRate: number | null;
  projected7d: number | null;
  projected30d: number | null;
}
interface DiskRunout {
  hasData: boolean;
  note: string | null;
  daysUntilFull: number | null;
}
interface HostUtilization {
  sampleCount: number;
  cpuLoadAvg1m: { mean: number; p95: number } | null;
  memoryUsedPercent: { mean: number; p95: number } | null;
  latestDiskAvailableBytes: number | null;
  timeline: { timestamp: string; cpuLoadAvg1m: number | null; memoryUsedPercent: number; diskAvailableBytes: number | null }[];
  note: string | null;
}
interface RestartEntry {
  startedAt: string;
  endedAt: string | null;
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
  sampleCount?: number;
  uptimePercent?: number;
  outageCount?: number;
  outages?: { start: string; end: string; lastError: string | null }[];
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "–";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function SystemPage() {
  const { data: queryVolume } = useQuery({ queryKey: ["capacity-query-volume"], queryFn: () => apiGet<Forecast>("/capacity/query-volume"), refetchInterval: 60000 });
  const { data: dbSize } = useQuery({ queryKey: ["capacity-db-size"], queryFn: () => apiGet<Forecast>("/capacity/db-size"), refetchInterval: 60000 });
  const { data: deviceCount } = useQuery({ queryKey: ["capacity-device-count"], queryFn: () => apiGet<Forecast>("/capacity/device-count"), refetchInterval: 60000 });
  const { data: diskRunout } = useQuery({ queryKey: ["capacity-disk-runout"], queryFn: () => apiGet<DiskRunout>("/capacity/disk-runout"), refetchInterval: 60000 });
  const { data: hostUtil } = useQuery({ queryKey: ["infra-host-util"], queryFn: () => apiGet<HostUtilization>("/infrastructure/host-utilization"), refetchInterval: 30000 });
  const { data: restarts } = useQuery({ queryKey: ["infra-restarts"], queryFn: () => apiGet<RestartHistory>("/infrastructure/restarts"), refetchInterval: 60000 });
  const { data: collectorHealth } = useQuery({ queryKey: ["infra-collector-health"], queryFn: () => apiGet<CollectorHealth>("/infrastructure/collector-health"), refetchInterval: 30000 });

  const hostSeries = (hostUtil?.timeline ?? []).map((t) => ({
    label: new Date(t.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    cpu: t.cpuLoadAvg1m ?? 0,
    memory: t.memoryUsedPercent,
  }));

  return (
    <Layout title="System">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="Query volume (30d forecast)"
          value={queryVolume?.hasData && queryVolume.projected30d !== undefined ? Math.round(queryVolume.projected30d).toLocaleString() : "no data yet"}
          metricId="query_volume_forecast"
        />
        <MetricCard
          label="DB size (30d forecast)"
          value={dbSize?.hasData && dbSize.projected30d !== undefined ? formatBytes(dbSize.projected30d) : "no data yet"}
          metricId="database_growth_forecast"
        />
        <MetricCard
          label="Devices (30d forecast)"
          value={deviceCount?.hasData && deviceCount.projected30d !== undefined ? Math.round(deviceCount.projected30d) : "no data yet"}
          metricId="device_count_forecast"
        />
        <MetricCard
          label="Collector uptime"
          value={collectorHealth?.hasData ? `${collectorHealth.uptimePercent?.toFixed(1)}%` : "no data yet"}
          metricId="collector_health_timeline"
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted">Host resource utilization</h2>
      <div className="mb-6">
        <SeriesLineChart
          title="netintel host — CPU load / memory used %"
          metricId="host_resource_utilization"
          data={hostSeries}
          seriesKeys={["cpu", "memory"]}
          chartType="line"
        />
      </div>
      {hostUtil?.note && <p className="mb-6 text-xs text-faint">{hostUtil.note}</p>}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            Restart history <MetricExplain metricId="process_uptime_restart_history" />
          </h2>
          <div className="mb-3 flex gap-4 text-xs text-faint">
            <span>Total restarts: {restarts?.totalRestarts ?? "–"}</span>
            <span>Inferred crashes: {restarts?.inferredCrashes ?? "–"}</span>
          </div>
          <DataTable
            rows={(restarts?.history ?? []).map((r) => ({
              startedAt: new Date(r.startedAt).toLocaleString(),
              cleanShutdown: r.cleanShutdown ? "clean" : r.endedAt ? "unclean" : "running / crashed",
              uptimeSeconds: r.uptimeSeconds !== null ? `${(r.uptimeSeconds / 60).toFixed(1)} min` : "–",
            }))}
            columns={[
              { key: "startedAt", label: "Started" },
              { key: "cleanShutdown", label: "Shutdown" },
              { key: "uptimeSeconds", label: "Uptime" },
            ]}
          />
        </div>
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            Collector outages <MetricExplain metricId="collector_health_timeline" />
          </h2>
          <DataTable
            rows={(collectorHealth?.outages ?? []).map((o) => ({
              start: new Date(o.start).toLocaleString(),
              end: new Date(o.end).toLocaleString(),
              lastError: o.lastError ?? "–",
            }))}
            columns={[
              { key: "start", label: "Start" },
              { key: "end", label: "End" },
              { key: "lastError", label: "Last error" },
            ]}
            emptyMessage="No outages recorded."
          />
        </div>
      </div>

      {diskRunout?.hasData && diskRunout.daysUntilFull !== null && diskRunout.daysUntilFull !== undefined && (
        <p className="text-xs text-faint">Estimated disk runout: {diskRunout.daysUntilFull.toFixed(0)} days from now.</p>
      )}
      {(!diskRunout?.hasData || queryVolume?.note || dbSize?.note || deviceCount?.note) && (
        <p className="text-xs text-faint">{diskRunout?.note ?? queryVolume?.note ?? dbSize?.note ?? deviceCount?.note}</p>
      )}
    </Layout>
  );
}
