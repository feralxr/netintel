import chalk from "chalk";
import { apiGet } from "../api-client.js";
import { section, table, stat, noDataNote } from "../output.js";
import { renderTimeSeries } from "../charts/timeseries.js";
import { renderBarChart } from "../charts/bar.js";
import { resolveChartStyle, isJsonMode } from "../config.js";

interface Distribution {
  mean: number;
  median: number;
  p95: number;
  count: number;
}
interface DnsPerformance {
  hasData: boolean;
  note: string | null;
  overall: Distribution | null;
}
interface CachePerformance {
  totalQueries: number;
  cacheHits: number;
  cacheHitRate: number;
}
interface PrefetchEntry {
  domain: string;
  score: number;
}
interface UpstreamEntry {
  upstream: string;
  queries: number;
  avgLatencyMs: number;
  successRate: number;
}
interface UpstreamComparison {
  hasData: boolean;
  note: string | null;
  upstreams: UpstreamEntry[];
}
interface Reliability {
  totalQueries: number;
  failedQueries: number;
  availability: number;
}
interface ClientLatency {
  clientId: string;
  mean: number;
  p95: number;
  count: number;
}
interface RetransmissionResponse {
  rate: number;
  candidateRetransmits: number;
}
interface DnssecResponse {
  hasData: boolean;
  note: string | null;
}
interface ProtocolFeatures {
  protocolBreakdown: { protocol: string; count: number; share: number }[];
  tcpFallbackShare: number;
  edns0Usage: { hasData: boolean; note: string };
}
interface ResponseSizeResponse {
  hasData: boolean;
  note: string | null;
}
interface RecursiveCachedDay {
  date: string;
  cached: number;
  recursive: number;
}

export async function performanceCommand(): Promise<void> {
  const [dnsPerf, cache, prefetch, upstream, reliability, clientLatency, retransmission, dnssec, protocolFeatures, responseSize, recursiveCachedTrend] = await Promise.all([
    apiGet<DnsPerformance>("/api/performance/dns"), // #18
    apiGet<CachePerformance>("/api/performance/cache"), // #19
    apiGet<PrefetchEntry[]>("/api/performance/prefetch?limit=10"), // #22
    apiGet<UpstreamComparison>("/api/performance/upstream-comparison"), // #24
    apiGet<Reliability>("/api/performance/reliability"), // #25
    apiGet<ClientLatency[]>("/api/performance/client-latency"), // #63
    apiGet<RetransmissionResponse>("/api/performance/retransmission"), // #65
    apiGet<DnssecResponse>("/api/performance/dnssec"), // #66
    apiGet<ProtocolFeatures>("/api/performance/protocol-features"), // #67
    apiGet<ResponseSizeResponse>("/api/performance/response-size"), // #68
    apiGet<RecursiveCachedDay[]>("/api/performance/recursive-cached-trend"), // #64
  ]);

  if (isJsonMode()) {
    console.log(
      JSON.stringify(
        { dnsPerf, cache, prefetch, upstream, reliability, clientLatency, retransmission, dnssec, protocolFeatures, responseSize, recursiveCachedTrend },
        null,
        2
      )
    );
    return;
  }

  console.log(chalk.bold("\nPerformance overview\n"));
  stat("Cache hit rate", `${(cache.cacheHitRate * 100).toFixed(1)}%`);
  stat("DNS availability", `${(reliability.availability * 100).toFixed(2)}%`);
  stat("Avg DNS latency", dnsPerf.hasData && dnsPerf.overall ? `${dnsPerf.overall.mean.toFixed(1)}ms` : "no data yet");
  stat("Retransmission rate", `${(retransmission.rate * 100).toFixed(2)}%`);
  stat("TCP fallback share", `${(protocolFeatures.tcpFallbackShare * 100).toFixed(2)}%`);

  if (!dnsPerf.hasData) noDataNote(dnsPerf.note);

  section("Protocol distribution");
  console.log(
    renderBarChart(
      protocolFeatures.protocolBreakdown.map((p) => ({ label: p.protocol, value: p.count })),
      { color: chalk.green }
    )
  );
  noDataNote(protocolFeatures.edns0Usage.note);

  section("Recursive vs cached ratio over time");
  const trendRecent = recursiveCachedTrend.slice(-14);
  console.log(
    renderTimeSeries(
      [
        { label: "cached", values: trendRecent.map((d) => d.cached) },
        { label: "recursive", values: trendRecent.map((d) => d.recursive) },
      ],
      resolveChartStyle(),
      { height: 8 }
    )
  );

  section("Per-client latency");
  table(
    [...clientLatency].sort((a, b) => b.p95 - a.p95).slice(0, 10),
    [
      { key: "clientId", label: "Client" },
      { key: "mean", label: "Mean (ms)" },
      { key: "p95", label: "p95 (ms)" },
      { key: "count", label: "Queries" },
    ]
  );

  section("Prefetch candidates");
  table(prefetch, [
    { key: "domain", label: "Domain" },
    { key: "score", label: "Score" },
  ]);

  section("Upstream resolver comparison");
  if (upstream.hasData) {
    table(upstream.upstreams, [
      { key: "upstream", label: "Upstream" },
      { key: "queries", label: "Queries" },
      { key: "avgLatencyMs", label: "Avg latency (ms)" },
      { key: "successRate", label: "Success", format: (v) => `${((v as number) * 100).toFixed(1)}%` },
    ]);
  } else {
    noDataNote(upstream.note);
  }

  if (!dnssec.hasData) {
    section("DNSSEC validation rate");
    noDataNote(dnssec.note);
  }
  if (!responseSize.hasData) {
    section("Response size distribution");
    noDataNote(responseSize.note);
  }

  console.log();
}
