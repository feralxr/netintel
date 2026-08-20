import { useQuery } from "@tanstack/react-query";
import { Layout } from "../components/Layout";
import { MetricCard } from "../components/MetricCard";
import { MetricExplain } from "../components/MetricExplain";
import { TimeRangeControl, useTimeRange } from "../components/TimeRange";
import { TrendChart } from "../components/charts/TrendChart";
import { DistributionBar } from "../components/charts/DistributionBar";

interface PerformanceSummary {
  queries: number;
  cacheHits: number;
  cacheHitRate: number;
  cacheOpportunity: { domain: string; queries: number; cacheHitRate: number }[];
  note?: string;
}

interface ReliabilitySummary {
  totalQueries: number;
  failedQueries: number;
  availability: number;
}

interface PrefetchEntry {
  domain: string;
  score: number;
}

interface Distribution {
  mean: number;
  median: number;
  p25: number;
  p75: number;
  p95: number;
  min: number;
  max: number;
  stddev: number;
  count: number;
}

async function fetchPerformanceSummary(): Promise<PerformanceSummary> {
  const res = await fetch("/api/performance/summary");
  if (!res.ok) throw new Error("failed to load performance summary");
  return res.json();
}

async function fetchReliability(): Promise<ReliabilitySummary> {
  const res = await fetch("/api/performance/reliability");
  if (!res.ok) throw new Error("failed to load reliability data");
  return res.json();
}

async function fetchPrefetch(): Promise<PrefetchEntry[]> {
  const res = await fetch("/api/performance/prefetch?limit=10");
  if (!res.ok) throw new Error("failed to load prefetch scores");
  return res.json();
}

interface UpstreamEntry {
  upstream: string;
  queries: number;
  avgLatencyMs: number;
  successRate: number;
  score: number;
}

async function fetchUpstreamComparison(): Promise<{ hasData: boolean; note: string | null; upstreams: UpstreamEntry[] }> {
  const res = await fetch("/api/performance/upstream-comparison");
  if (!res.ok) throw new Error("failed to load upstream comparison");
  return res.json();
}

async function fetchDnsPerformance(): Promise<{ hasData: boolean; note: string | null; overall: Distribution | null }> {
  const res = await fetch("/api/performance/dns");
  if (!res.ok) throw new Error("failed to load dns performance");
  return res.json();
}

async function fetchTtl(): Promise<{ hasData: boolean; note: string | null; distribution: Distribution | null }> {
  const res = await fetch("/api/performance/ttl");
  if (!res.ok) throw new Error("failed to load ttl data");
  return res.json();
}

function percentileLadder(d: Distribution | null | undefined) {
  if (!d) return [];
  return [
    { name: "min", value: Number(d.min.toFixed(1)) },
    { name: "p25", value: Number(d.p25.toFixed(1)) },
    { name: "median", value: Number(d.median.toFixed(1)) },
    { name: "p75", value: Number(d.p75.toFixed(1)) },
    { name: "p95", value: Number(d.p95.toFixed(1)) },
    { name: "max", value: Number(d.max.toFixed(1)) },
  ];
}

export function PerformancePage() {
  const [range, setRange] = useTimeRange("24h");
  const { data } = useQuery({
    queryKey: ["performance-summary"],
    queryFn: fetchPerformanceSummary,
    refetchInterval: 5000,
  });
  const { data: reliability } = useQuery({
    queryKey: ["reliability"],
    queryFn: fetchReliability,
    refetchInterval: 10000,
  });
  const { data: prefetch } = useQuery({ queryKey: ["prefetch"], queryFn: fetchPrefetch, refetchInterval: 15000 });
  const { data: upstream } = useQuery({
    queryKey: ["upstream-comparison"],
    queryFn: fetchUpstreamComparison,
    refetchInterval: 15000,
  });
  const { data: dnsPerf } = useQuery({ queryKey: ["dns-perf"], queryFn: fetchDnsPerformance, refetchInterval: 10000 });
  const { data: ttl } = useQuery({ queryKey: ["ttl"], queryFn: fetchTtl, refetchInterval: 15000 });

  const prefetchBarData = (prefetch ?? []).map((p) => ({ name: p.domain, value: Number(p.score.toFixed(3)) }));
  const upstreamLatencyBarData = (upstream?.upstreams ?? []).map((u) => ({ name: u.upstream, value: Number(u.avgLatencyMs.toFixed(1)) }));

  return (
    <Layout title="Performance">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="Cache hit rate"
          value={data ? `${(data.cacheHitRate * 100).toFixed(1)}%` : "–"}
          metricId="cache_performance"
        />
        <MetricCard
          label="Avg DNS latency"
          value={dnsPerf?.hasData && dnsPerf.overall ? `${dnsPerf.overall.mean.toFixed(1)}ms` : "no data yet"}
          metricId="dns_performance"
        />
        <MetricCard
          label="DNS availability"
          value={reliability ? `${(reliability.availability * 100).toFixed(2)}%` : "–"}
          metricId="network_reliability"
        />
        <MetricCard label="Total queries today" value={data?.queries ?? "–"} />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Latency over time</h2>
        <TimeRangeControl value={range.preset} onChange={setRange} />
      </div>
      <div className="mb-6">
        <TrendChart
          title="Average DNS response time"
          metricId="dns_performance"
          queryMetric="avgResponseTime"
          range={range}
          chartType="line"
          height={240}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <DistributionBar
          title="DNS latency percentiles"
          metricId="dns_performance"
          data={percentileLadder(dnsPerf?.overall)}
          valueFormatter={(v) => `${v.toFixed(1)}ms`}
          singleColor="#4f9dde"
          height={260}
          controls={!dnsPerf?.hasData ? <span className="text-[10px] text-faint">{dnsPerf?.note}</span> : undefined}
        />
        <DistributionBar
          title="TTL percentiles"
          metricId="ttl_analytics"
          data={percentileLadder(ttl?.distribution)}
          valueFormatter={(v) => `${v.toFixed(0)}s`}
          singleColor="#7dd3a0"
          height={260}
          controls={!ttl?.hasData ? <span className="text-[10px] text-faint">{ttl?.note}</span> : undefined}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <DistributionBar
          title="Prefetch candidate scores"
          metricId="intelligent_prefetch_score"
          data={prefetchBarData}
          singleColor="#e0b84c"
          height={260}
        />
        <DistributionBar
          title="Upstream resolver latency"
          metricId="upstream_comparison"
          data={upstreamLatencyBarData}
          valueFormatter={(v) => `${v.toFixed(1)}ms`}
          singleColor="#b58af5"
          height={260}
          controls={!upstream?.hasData ? <span className="text-[10px] text-faint">{upstream?.note}</span> : undefined}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">Cache opportunity</h2>
          <p className="mb-3 text-xs text-faint">
            High-frequency domains with the lowest cache hit rate today — where caching would help most.
          </p>
          <div className="overflow-hidden rounded border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-2 font-medium">Domain</th>
                  <th className="px-4 py-2 font-medium">Queries</th>
                  <th className="px-4 py-2 font-medium">Cache hit rate</th>
                </tr>
              </thead>
              <tbody>
                {(data?.cacheOpportunity ?? []).map((row) => (
                  <tr key={row.domain} className="border-t border-border-subtle">
                    <td className="px-4 py-2">{row.domain}</td>
                    <td className="px-4 py-2 text-muted">{row.queries}</td>
                    <td className="px-4 py-2 text-muted">{(row.cacheHitRate * 100).toFixed(1)}%</td>
                  </tr>
                ))}
                {(!data || data.cacheOpportunity.length === 0) && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-faint">
                      Not enough traffic yet to compute cache opportunity.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            Upstream comparison <MetricExplain metricId="upstream_comparison" />
          </h2>
          <div className="overflow-hidden rounded border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-2 font-medium">Upstream</th>
                  <th className="px-4 py-2 font-medium">Queries</th>
                  <th className="px-4 py-2 font-medium">Success</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {(upstream?.upstreams ?? []).map((u) => (
                  <tr key={u.upstream} className="border-t border-border-subtle">
                    <td className="px-4 py-2">{u.upstream}</td>
                    <td className="px-4 py-2 text-muted">{u.queries}</td>
                    <td className="px-4 py-2 text-muted">{(u.successRate * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2 text-muted">{u.score.toFixed(3)}</td>
                  </tr>
                ))}
                {(!upstream || upstream.upstreams.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-faint">
                      {upstream?.note ?? "No upstream data yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {data?.note && <p className="mt-6 text-xs text-faint">{data.note}</p>}
    </Layout>
  );
}
