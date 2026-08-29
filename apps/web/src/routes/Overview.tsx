import { useQuery } from "@tanstack/react-query";
import { Layout } from "../components/Layout";
import { MetricCard } from "../components/MetricCard";
import { TimeRangeControl, useTimeRange } from "../components/TimeRange";
import { TrendChart } from "../components/charts/TrendChart";
import { DonutChart } from "../components/charts/DonutChart";
import { DistributionBar } from "../components/charts/DistributionBar";
import { api, analytics } from "../lib/api";

export function OverviewPage() {
  const [range, setRange] = useTimeRange("24h");

  const { data: status } = useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 5000 });
  const { data: hostHealth } = useQuery({
    queryKey: ["host-health"],
    queryFn: async () => {
      const res = await fetch("/api/infrastructure/health");
      if (!res.ok) throw new Error("failed to load host health");
      return res.json() as Promise<{
        cpuLoadAvg1m: number | null;
        memoryUsedPercent: number;
        diskAvailableBytes: number | null;
        hostUptimeSeconds: number;
      }>;
    },
    refetchInterval: 10000,
  });
  const { data: devices } = useQuery({ queryKey: ["devices"], queryFn: () => api.devices(), refetchInterval: 5000 });
  const { data: domains } = useQuery({
    queryKey: ["domains-overview"],
    queryFn: () => api.domains(10),
    refetchInterval: 5000,
  });
  const { data: categories } = useQuery({
    queryKey: ["categories-overview"],
    queryFn: analytics.categories,
    refetchInterval: 15000,
  });

  const categoryDonutData = (categories ?? []).slice(0, 8).map((c) => ({ name: c.category, value: c.queries }));
  const topDomainsBarData = (domains ?? []).slice(0, 8).map((d) => ({ name: d.domain, value: d.queryCount }));

  return (
    <Layout title="Overview">
      <div className="mb-6 flex items-center justify-between">
        <div className="grid flex-1 grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard label="Live devices" value={status?.liveDeviceCount ?? "–"} />
          <MetricCard
            label="Technitium"
            value={
              !status
                ? "–"
                : status.technitiumReachable
                  ? "reachable"
                  : !status.sessionCheckOk
                    ? "unreachable"
                    : "query logs down"
            }
          />
          <MetricCard label="Uptime" value={status ? `${status.uptimeSeconds}s` : "–"} />
          <MetricCard label="Database size" value={status ? `${(status.dbSizeBytes / 1024).toFixed(1)} KB` : "–"} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="Host CPU load (1m)"
          value={hostHealth?.cpuLoadAvg1m != null ? hostHealth.cpuLoadAvg1m.toFixed(2) : "n/a on this OS"}
        />
        <MetricCard label="Host memory used" value={hostHealth ? `${hostHealth.memoryUsedPercent.toFixed(1)}%` : "–"} />
        <MetricCard
          label="Disk available"
          value={hostHealth?.diskAvailableBytes != null ? `${(hostHealth.diskAvailableBytes / 1e9).toFixed(1)} GB` : "unknown"}
        />
        <MetricCard
          label="Host uptime"
          value={hostHealth ? `${(hostHealth.hostUptimeSeconds / 3600).toFixed(1)}h` : "–"}
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Query volume over time</h2>
        <TimeRangeControl value={range.preset} onChange={setRange} />
      </div>
      <div className="mb-6">
        <TrendChart
          title="Total queries, cached vs. blocked"
          metricId="internet_activity_trends"
          queryMetric="count"
          range={range}
          groupBy="cached"
          chartType="area"
          stacked
          height={260}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <TrendChart
          title="NXDOMAIN rate over time"
          metricId="nxdomain_analysis"
          queryMetric="nxdomainCount"
          range={range}
          chartType="line"
          height={220}
        />
        <TrendChart
          title="Blocked queries over time"
          metricId="block_statistics"
          queryMetric="blockedCount"
          range={range}
          chartType="line"
          height={220}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <DonutChart title="Category breakdown" metricId="domain_categories" data={categoryDonutData} height={280} />
        <DistributionBar
          title="Top domains by query volume"
          metricId="domain_statistics"
          data={topDomainsBarData}
          height={280}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted">Top domains</h2>
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-4 py-2 font-medium">Domain</th>
                <th className="px-4 py-2 font-medium">
                  <span className="inline-flex items-center gap-1">Queries</span>
                </th>
                <th className="px-4 py-2 font-medium">Unique days</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {(domains ?? []).map((d) => (
                <tr key={d.domain} className="border-t border-border-subtle hover:bg-surface/50">
                  <td className="px-4 py-2">{d.domain}</td>
                  <td className="px-4 py-2 text-muted">{d.queryCount}</td>
                  <td className="px-4 py-2 text-muted">{d.uniqueDays}</td>
                  <td className="px-4 py-2 text-faint">{new Date(d.lastSeen).toLocaleTimeString()}</td>
                </tr>
              ))}
              {(!domains || domains.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-faint">
                    No domain activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted">Live devices ({devices?.length ?? 0})</h2>
        <div className="flex flex-wrap gap-2">
          {(devices ?? []).map((d) => (
            <span key={d.deviceId} className="rounded border border-border bg-surface px-3 py-1.5 text-xs text-muted">
              {d.hostname ?? d.currentIp ?? "unknown"}
            </span>
          ))}
          {(!devices || devices.length === 0) && <span className="text-xs text-faint">No active devices yet.</span>}
        </div>
      </div>
    </Layout>
  );
}
