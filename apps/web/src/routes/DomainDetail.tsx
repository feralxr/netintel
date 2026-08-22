import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Layout } from "../components/Layout";
import { MetricCard } from "../components/MetricCard";
import { MetricExplain } from "../components/MetricExplain";
import { DataTable } from "../components/DataTable";
import { TimeRangeControl, useTimeRange } from "../components/TimeRange";
import { TrendChart } from "../components/charts/TrendChart";
import { DonutChart } from "../components/charts/DonutChart";
import { DistributionBar } from "../components/charts/DistributionBar";
import { api, apiGet } from "../lib/api";

interface ResponseCodeDist {
  domain: string;
  total: number;
  breakdown: { responseCode: string; count: number; share: number }[];
}
interface Burstiness {
  domain: string;
  fanoFactor: number | null;
  sampleSize: number;
  note: string | null;
}
interface Fragmentation {
  registeredDomain: string;
  totalQueries: number;
  distinctSubdomainCount: number;
  subdomains: string[];
}

export function DomainDetailPage() {
  const { domain } = useParams({ from: "/domains/$domain" });
  const [range, setRange] = useTimeRange("7d");
  const { data } = useQuery({ queryKey: ["domain", domain], queryFn: () => api.domain(domain) });
  const { data: responseCodes } = useQuery({
    queryKey: ["domain-response-codes", domain],
    queryFn: () => apiGet<ResponseCodeDist>(`/domains/${encodeURIComponent(domain)}/response-codes`),
  });
  const { data: burstiness } = useQuery({
    queryKey: ["domain-burstiness", domain],
    queryFn: () => apiGet<Burstiness>(`/domains/${encodeURIComponent(domain)}/burstiness`),
  });
  const { data: fragmentation } = useQuery({
    queryKey: ["domain-fragmentation", domain],
    queryFn: () => apiGet<Fragmentation>(`/domains/${encodeURIComponent(domain)}/fragmentation`),
  });

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
      <div className="mb-6 overflow-hidden rounded border border-border">
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

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <DistributionBar
          title="Response code distribution"
          metricId="domain_response_code_distribution"
          data={(responseCodes?.breakdown ?? []).map((b) => ({ name: b.responseCode, value: b.count }))}
          height={220}
        />
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            Query burstiness <MetricExplain metricId="domain_query_burstiness" />
          </h2>
          <div className="rounded border border-border bg-surface p-4 text-sm">
            {burstiness?.fanoFactor !== null && burstiness?.fanoFactor !== undefined ? (
              <>
                <div className="text-lg text-text">{burstiness.fanoFactor.toFixed(2)}</div>
                <p className="mt-1 text-xs text-faint">
                  Fano factor from {burstiness.sampleSize} queries. ~1 = random spacing, {">"}1 = bursty, {"<"}1 = unusually regular.
                </p>
              </>
            ) : (
              <p className="text-faint">{burstiness?.note ?? "Loading…"}</p>
            )}
          </div>
        </div>
      </div>

      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
        Subdomain fragmentation <MetricExplain metricId="subdomain_fragmentation" />
      </h2>
      <p className="mb-3 text-xs text-faint">
        {fragmentation ? `${fragmentation.distinctSubdomainCount} distinct subdomains observed under this registered domain.` : "Loading…"}
      </p>
      <DataTable
        rows={(fragmentation?.subdomains ?? []).slice(0, 30).map((s) => ({ subdomain: s }))}
        columns={[{ key: "subdomain", label: "Subdomain" }]}
        emptyMessage="No subdomain fragmentation data yet."
      />
    </Layout>
  );
}
