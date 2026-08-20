import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "../components/Layout";
import { MetricExplain } from "../components/MetricExplain";
import { TimeRangeControl, useTimeRange } from "../components/TimeRange";
import { TrendChart } from "../components/charts/TrendChart";
import { DistributionBar } from "../components/charts/DistributionBar";
import { api } from "../lib/api";

interface ComparisonRow {
  deviceId: string;
  hostname: string | null;
  queries: number;
  uniqueDomains: number;
  blocked: number;
  nxdomain: number;
  cacheHitRate: number;
  peakHour: number;
}

async function fetchComparison(): Promise<ComparisonRow[]> {
  const res = await fetch("/api/devices/compare");
  if (!res.ok) throw new Error("failed to load device comparison");
  return res.json();
}

export function NetworkPage() {
  const [range, setRange] = useTimeRange("24h");
  const { data: devices } = useQuery({ queryKey: ["devices"], queryFn: () => api.devices(), refetchInterval: 5000 });
  const { data: comparison } = useQuery({
    queryKey: ["device-compare"],
    queryFn: fetchComparison,
    refetchInterval: 10000,
  });

  const comparisonByDevice = new Map((comparison ?? []).map((c) => [c.deviceId, c]));
  const hostnameByDevice = new Map((devices ?? []).map((d) => [d.deviceId, d.hostname ?? d.currentIp ?? d.deviceId.slice(0, 8)]));

  const queryVolumeBarData = useMemo(
    () => (comparison ?? []).map((c) => ({ name: hostnameByDevice.get(c.deviceId) ?? c.deviceId.slice(0, 8), value: c.queries })),
    [comparison, devices]
  );
  const cacheHitBarData = useMemo(
    () =>
      (comparison ?? []).map((c) => ({
        name: hostnameByDevice.get(c.deviceId) ?? c.deviceId.slice(0, 8),
        value: Number((c.cacheHitRate * 100).toFixed(1)),
      })),
    [comparison, devices]
  );

  return (
    <Layout title="Network">
      <p className="mb-4 text-xs text-faint">
        v1 shows currently-connected devices only. Historical device tracking is a future addition.
      </p>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Query volume by device over time</h2>
        <TimeRangeControl value={range.preset} onChange={setRange} />
      </div>
      <div className="mb-6">
        <TrendChart
          title="Queries per device"
          metricId="cross_device_comparison"
          queryMetric="count"
          range={range}
          groupBy="clientId"
          chartType="area"
          stacked
          height={260}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <DistributionBar
          title="Total queries by device"
          metricId="device_analytics"
          data={queryVolumeBarData}
          singleColor="#4f9dde"
          height={260}
        />
        <DistributionBar
          title="Cache hit rate by device"
          metricId="device_behavioral_fingerprint"
          data={cacheHitBarData}
          valueFormatter={(v) => `${v.toFixed(1)}%`}
          singleColor="#7dd3a0"
          height={260}
        />
      </div>

      <div className="overflow-hidden rounded border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-4 py-2 font-medium">Hostname</th>
              <th className="px-4 py-2 font-medium">IP</th>
              <th className="px-4 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  Queries <MetricExplain metricId="device_analytics" />
                </span>
              </th>
              <th className="px-4 py-2 font-medium">Unique domains</th>
              <th className="px-4 py-2 font-medium">Cache hit rate</th>
              <th className="px-4 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  Cross-device <MetricExplain metricId="cross_device_comparison" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(devices ?? []).map((d) => {
              const c = comparisonByDevice.get(d.deviceId);
              return (
                <tr key={d.deviceId} className="border-t border-border-subtle hover:bg-surface/50">
                  <td className="px-4 py-2">{d.hostname ?? <span className="text-faint">unknown</span>}</td>
                  <td className="px-4 py-2 text-muted">{d.currentIp}</td>
                  <td className="px-4 py-2 text-muted">{c?.queries ?? "–"}</td>
                  <td className="px-4 py-2 text-muted">{c?.uniqueDomains ?? "–"}</td>
                  <td className="px-4 py-2 text-muted">
                    {c ? `${(c.cacheHitRate * 100).toFixed(0)}%` : "–"}
                  </td>
                  <td className="px-4 py-2 text-faint">
                    {c && comparison ? `#${comparison.findIndex((x) => x.deviceId === d.deviceId) + 1} of ${comparison.length}` : "–"}
                  </td>
                </tr>
              );
            })}
            {(!devices || devices.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-faint">
                  No active devices yet — waiting on DHCP/query-log sync.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
