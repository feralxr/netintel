import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Layout } from "../components/Layout";
import { MetricCard } from "../components/MetricCard";
import { TimeRangeControl, useTimeRange } from "../components/TimeRange";
import { TrendChart } from "../components/charts/TrendChart";
import { DonutChart } from "../components/charts/DonutChart";
import { api } from "../lib/api";

export function DomainDetailPage() {
  const { domain } = useParams({ from: "/domains/$domain" });
  const [range, setRange] = useTimeRange("7d");
  const { data } = useQuery({ queryKey: ["domain", domain], queryFn: () => api.domain(domain) });

  if (!data) {
    return (
      <Layout title={domain}>
        <p className="text-faint">Loading…</p>
      </Layout>
    );
  }

  const { record, category, dailyHistory } = data;
  const sparkline = [...dailyHistory].reverse().map((d) => d.queries);

  const totalCache = dailyHistory.reduce((s, d) => s + d.cacheHits, 0);
  const totalBlocked = dailyHistory.reduce((s, d) => s + d.blocked, 0);
  const totalNx = dailyHistory.reduce((s, d) => s + d.nxdomain, 0);
  const totalOther = Math.max(0, record.queryCount - totalCache - totalBlocked - totalNx);
  const outcomeDonutData = [
    { name: "cached", value: totalCache },
    { name: "other recursive", value: totalOther },
    { name: "blocked", value: totalBlocked },
    { name: "nxdomain", value: totalNx },
  ].filter((d) => d.value > 0);

  return (
    <Layout title={domain}>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Total queries" value={record.queryCount} metricId="domain_statistics" sparkline={sparkline} />
        <MetricCard label="Unique days active" value={record.uniqueDays} />
        <MetricCard label="Lifecycle" value={record.lifecycleState ?? "unclassified"} metricId="domain_lifecycle_classification" />
        <MetricCard
          label="Category"
          value={category ? category.category : "uncategorized"}
          metricId="domain_categories"
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Query volume over time</h2>
        <TimeRangeControl value={range.preset} onChange={setRange} />
      </div>
      <div className="mb-6">
        <TrendChart
          title={`Queries for ${domain}`}
          metricId="domain_statistics"
          queryMetric="count"
          range={range}
          filter={{ logic: "AND", conditions: [{ dimension: "domain", operator: "eq", value: domain }] }}
          chartType="area"
          height={240}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <DonutChart title="Query outcome breakdown" metricId="block_statistics" data={outcomeDonutData} height={260} />
        <TrendChart
          title="Response code breakdown over time"
          metricId="nxdomain_analysis"
          queryMetric="count"
          range={range}
          groupBy="responseCode"
          filter={{ logic: "AND", conditions: [{ dimension: "domain", operator: "eq", value: domain }] }}
          chartType="area"
          stacked
          height={260}
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted">Daily history</h2>
      <div className="overflow-hidden rounded border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Queries</th>
              <th className="px-4 py-2 font-medium">Cache hits</th>
              <th className="px-4 py-2 font-medium">Blocked</th>
              <th className="px-4 py-2 font-medium">NXDOMAIN</th>
            </tr>
          </thead>
          <tbody>
            {dailyHistory.map((d) => (
              <tr key={d.date} className="border-t border-border-subtle">
                <td className="px-4 py-2">{d.date}</td>
                <td className="px-4 py-2 text-muted">{d.queries}</td>
                <td className="px-4 py-2 text-muted">{d.cacheHits}</td>
                <td className="px-4 py-2 text-muted">{d.blocked}</td>
                <td className="px-4 py-2 text-muted">{d.nxdomain}</td>
              </tr>
            ))}
            {dailyHistory.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-faint">
                  No daily history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
