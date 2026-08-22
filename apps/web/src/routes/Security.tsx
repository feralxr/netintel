import { useQuery } from "@tanstack/react-query";
import { Layout } from "../components/Layout";
import { MetricCard } from "../components/MetricCard";
import { MetricExplain } from "../components/MetricExplain";
import { DataTable } from "../components/DataTable";
import { TimeRangeControl, useTimeRange } from "../components/TimeRange";
import { TrendChart } from "../components/charts/TrendChart";
import { DistributionBar } from "../components/charts/DistributionBar";
import { apiGet } from "../lib/api";

interface SecuritySummary {
  queries: number;
  blocked: number;
  nxdomain: number;
  blockRate: number;
  nxRate: number;
  topBlockedDomains: { domain: string; count: number }[];
  notifications: { id: string; title: string; explanation: string; severity: string; timestamp: string }[];
}

interface EntropyEntry {
  domain: string;
  entropy: number;
  queryCount: number;
}

interface BaselineStream {
  baselineMean: number;
  baselineStddev: number;
  currentValue: number;
  zScore: number;
  deviating: boolean;
}

interface BaselineResponse {
  hasBaseline: boolean;
  note: string | null;
  streams: Record<string, BaselineStream> | null;
}

interface SuspiciousTld {
  totalQueries: number;
  watchedTldQueries: number;
  share: number;
  breakdown: { tld: string; count: number }[];
  note: string;
}
interface PunycodeDomains {
  totalDomains: number;
  punycodeDomainCount: number;
  domains: { domain: string; queryCount: number; firstSeen: string }[];
  note: string;
}
interface TunnelingCandidate {
  domain: string;
  queryCount: number;
  labelLength: number;
  entropy: number;
}
interface TunnelingResponse {
  candidates: TunnelingCandidate[];
  note: string;
}
interface FailureBurst {
  clientId: string;
  burstStart: string;
  burstEnd: string;
  failureCount: number;
}
interface FailureBurstsResponse {
  windowMinutes: number;
  minFailuresInWindow: number;
  bursts: FailureBurst[];
  note: string;
}
interface BlocklistAttribution {
  totalBlocked: number;
  byCategory: { category: string; count: number; share: number }[];
  note: string;
}

async function fetchSecuritySummary(): Promise<SecuritySummary> {
  const res = await fetch("/api/security/summary");
  if (!res.ok) throw new Error("failed to load security summary");
  return res.json();
}

async function fetchEntropy(): Promise<EntropyEntry[]> {
  const res = await fetch("/api/security/entropy");
  if (!res.ok) throw new Error("failed to load entropy data");
  return res.json();
}

async function fetchBaseline(): Promise<BaselineResponse> {
  const res = await fetch("/api/security/baseline");
  if (!res.ok) throw new Error("failed to load baseline data");
  return res.json();
}

export function SecurityPage() {
  const [range, setRange] = useTimeRange("24h");
  const { data } = useQuery({ queryKey: ["security-summary"], queryFn: fetchSecuritySummary, refetchInterval: 5000 });
  const { data: entropy } = useQuery({ queryKey: ["entropy"], queryFn: fetchEntropy, refetchInterval: 15000 });
  const { data: baseline } = useQuery({ queryKey: ["baseline"], queryFn: fetchBaseline, refetchInterval: 30000 });
  const { data: suspiciousTlds } = useQuery({ queryKey: ["suspicious-tlds"], queryFn: () => apiGet<SuspiciousTld>("/security/suspicious-tlds"), refetchInterval: 30000 });
  const { data: punycode } = useQuery({ queryKey: ["punycode"], queryFn: () => apiGet<PunycodeDomains>("/security/punycode"), refetchInterval: 30000 });
  const { data: tunneling } = useQuery({ queryKey: ["tunneling"], queryFn: () => apiGet<TunnelingResponse>("/security/tunneling"), refetchInterval: 30000 });
  const { data: failureBursts } = useQuery({ queryKey: ["failure-bursts"], queryFn: () => apiGet<FailureBurstsResponse>("/security/failure-bursts"), refetchInterval: 30000 });
  const { data: blocklistAttribution } = useQuery({ queryKey: ["blocklist-attribution"], queryFn: () => apiGet<BlocklistAttribution>("/security/blocklist-attribution"), refetchInterval: 30000 });

  const entropyBarData = (entropy ?? []).slice(0, 10).map((e) => ({ name: e.domain, value: Number(e.entropy.toFixed(2)) }));
  const topBlockedBarData = (data?.topBlockedDomains ?? []).slice(0, 10).map((d) => ({ name: d.domain, value: d.count }));
  const baselineBarData = baseline?.streams
    ? Object.entries(baseline.streams).map(([stream, s]) => ({ name: stream, value: Number(s.zScore.toFixed(2)) }))
    : [];

  return (
    <Layout title="Security">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Blocked today" value={data?.blocked ?? "–"} metricId="block_statistics" />
        <MetricCard
          label="Block rate"
          value={data ? `${(data.blockRate * 100).toFixed(2)}%` : "–"}
          metricId="block_statistics"
        />
        <MetricCard
          label="NXDOMAIN rate"
          value={data ? `${(data.nxRate * 100).toFixed(2)}%` : "–"}
          metricId="nxdomain_analysis"
        />
        <MetricCard label="Total queries today" value={data?.queries ?? "–"} />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Security signal trends</h2>
        <TimeRangeControl value={range.preset} onChange={setRange} />
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <TrendChart
          title="NXDOMAIN count over time"
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
        <DistributionBar title="Top blocked domains" metricId="block_statistics" data={topBlockedBarData} singleColor="#ef4444" height={260} />
        <DistributionBar
          title="Behavioral baseline z-scores"
          metricId="zscore_anomaly_detection"
          data={baselineBarData}
          singleColor="#e0b84c"
          height={260}
          controls={baseline?.note ? <span className="text-[10px] text-faint">{baseline.note}</span> : undefined}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted">Security notifications</h2>
          <div className="flex flex-col gap-2">
            {(data?.notifications ?? []).map((n) => (
              <div key={n.id} className="rounded border border-border bg-surface p-3 text-sm">
                <p className="text-text">{n.title}</p>
                <p className="mt-1 text-xs text-muted">{n.explanation}</p>
              </div>
            ))}
            {(!data || data.notifications.length === 0) && (
              <p className="rounded border border-border bg-surface p-3 text-xs text-faint">
                No security notifications yet.
              </p>
            )}
          </div>
        </div>

        <DistributionBar
          title="High-entropy domains"
          metricId="domain_entropy"
          data={entropyBarData}
          singleColor="#b58af5"
          height={260}
          controls={<span className="text-[10px] text-faint">candidate signal, not proof</span>}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <DistributionBar
          title="Suspicious TLD exposure"
          metricId="suspicious_tld_exposure"
          data={(suspiciousTlds?.breakdown ?? []).map((b) => ({ name: `.${b.tld}`, value: b.count }))}
          singleColor="#e0b84c"
          height={240}
          controls={<span className="text-[10px] text-faint">trend visibility only, not a block signal</span>}
        />
        <DistributionBar
          title="Blocklist hit attribution"
          metricId="blocklist_hit_attribution"
          data={(blocklistAttribution?.byCategory ?? []).map((b) => ({ name: b.category, value: b.count }))}
          singleColor="#ef4444"
          height={240}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            Punycode / homograph domains <MetricExplain metricId="punycode_homograph_detection" />
          </h2>
          <DataTable
            rows={(punycode?.domains ?? []).map((d) => ({ domain: d.domain, queryCount: d.queryCount }))}
            columns={[{ key: "domain", label: "Domain" }, { key: "queryCount", label: "Queries" }]}
            emptyMessage="No punycode domains observed."
          />
        </div>
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            DNS tunneling heuristics <MetricExplain metricId="dns_tunneling_heuristics" />
          </h2>
          <DataTable
            rows={(tunneling?.candidates ?? []).map((c) => ({ domain: c.domain, queryCount: c.queryCount, entropy: c.entropy.toFixed(2) }))}
            columns={[
              { key: "domain", label: "Domain" },
              { key: "queryCount", label: "Queries" },
              { key: "entropy", label: "Entropy" },
            ]}
            emptyMessage="No candidates flagged."
          />
        </div>
      </div>

      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
        Repeated failure bursts <MetricExplain metricId="repeated_failure_burst_detection" />
      </h2>
      <DataTable
        rows={(failureBursts?.bursts ?? []).map((b) => ({
          clientId: b.clientId,
          burstStart: new Date(b.burstStart).toLocaleString(),
          burstEnd: new Date(b.burstEnd).toLocaleString(),
          failureCount: b.failureCount,
        }))}
        columns={[
          { key: "clientId", label: "Client" },
          { key: "burstStart", label: "Burst start" },
          { key: "burstEnd", label: "Burst end" },
          { key: "failureCount", label: "Failures" },
        ]}
        emptyMessage="No repeated failure bursts detected."
      />
    </Layout>
  );
}
