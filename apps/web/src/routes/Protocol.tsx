import { useQuery } from "@tanstack/react-query";
import { Layout } from "../components/Layout";
import { MetricCard } from "../components/MetricCard";
import { MetricExplain } from "../components/MetricExplain";
import { DataTable } from "../components/DataTable";
import { DistributionBar } from "../components/charts/DistributionBar";
import { apiGet } from "../lib/api";

interface QueryTypeDist {
  totalQueries: number;
  breakdown: { queryType: string; count: number; share: number }[];
}
interface Ipv4Ipv6Mix {
  aQueries: number;
  aaaaQueries: number;
  ipv4Share: number;
  ipv6Share: number;
  dualStackClients: number;
  ipv4OnlyClients: number;
  totalClientsObserved: number;
}
interface CnameDepth {
  hasData: boolean;
  note: string;
  avgDepth?: number;
  maxDepth?: number;
  sampleSize?: number;
}
interface PtrVolume {
  totalQueries: number;
  ptrQueries: number;
  share: number;
  topClients: { clientId: string; count: number }[];
}
interface MalformedRefused {
  totalQueries: number;
  refusedQueries: number;
  rate: number;
  topClients: { clientId: string; count: number }[];
  note: string;
}
interface DohBypass {
  totalAttempts: number;
  byClient: { clientId: string; count: number }[];
  recentAttempts: { domain: string; clientId: string | null; timestamp: string }[];
  note: string;
}

export function ProtocolPage() {
  const { data: queryTypes } = useQuery({ queryKey: ["protocol-query-types"], queryFn: () => apiGet<QueryTypeDist>("/protocol/query-types"), refetchInterval: 15000 });
  const { data: ipMix } = useQuery({ queryKey: ["protocol-ip-mix"], queryFn: () => apiGet<Ipv4Ipv6Mix>("/protocol/ip-version-mix"), refetchInterval: 30000 });
  const { data: cname } = useQuery({ queryKey: ["protocol-cname"], queryFn: () => apiGet<CnameDepth>("/protocol/cname-depth"), refetchInterval: 30000 });
  const { data: ptr } = useQuery({ queryKey: ["protocol-ptr"], queryFn: () => apiGet<PtrVolume>("/protocol/ptr-volume"), refetchInterval: 30000 });
  const { data: malformed } = useQuery({ queryKey: ["protocol-malformed"], queryFn: () => apiGet<MalformedRefused>("/protocol/malformed-refused"), refetchInterval: 30000 });
  const { data: doh } = useQuery({ queryKey: ["protocol-doh"], queryFn: () => apiGet<DohBypass>("/protocol/doh-bypass"), refetchInterval: 30000 });

  const queryTypeBars = (queryTypes?.breakdown ?? []).map((b) => ({ name: b.queryType, value: b.count }));

  return (
    <Layout title="Protocol">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="IPv4 share" value={ipMix ? `${(ipMix.ipv4Share * 100).toFixed(0)}%` : "–"} metricId="ipv4_vs_ipv6_mix" />
        <MetricCard label="Dual-stack clients" value={ipMix?.dualStackClients ?? "–"} />
        <MetricCard label="PTR query share" value={ptr ? `${(ptr.share * 100).toFixed(1)}%` : "–"} metricId="reverse_dns_query_volume" />
        <MetricCard label="REFUSED rate" value={malformed ? `${(malformed.rate * 100).toFixed(2)}%` : "–"} metricId="malformed_refused_query_rate" />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <DistributionBar title="Query type distribution" metricId="query_type_distribution" data={queryTypeBars} height={260} />
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            CNAME chain depth <MetricExplain metricId="cname_chain_depth" />
          </h2>
          <div className="rounded border border-border bg-surface p-4 text-sm">
            {cname?.hasData ? (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-faint">Avg depth</div>
                  <div className="text-lg text-text">{cname.avgDepth?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">Max depth</div>
                  <div className="text-lg text-text">{cname.maxDepth}</div>
                </div>
                <div>
                  <div className="text-xs text-faint">Sample size</div>
                  <div className="text-lg text-text">{cname.sampleSize}</div>
                </div>
              </div>
            ) : (
              <p className="text-faint">{cname?.note ?? "Loading…"}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            Top PTR query clients <MetricExplain metricId="reverse_dns_query_volume" />
          </h2>
          <DataTable rows={ptr?.topClients} columns={[{ key: "clientId", label: "Client" }, { key: "count", label: "PTR queries" }]} />
        </div>
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            Top REFUSED clients <MetricExplain metricId="malformed_refused_query_rate" />
          </h2>
          <DataTable rows={malformed?.topClients} columns={[{ key: "clientId", label: "Client" }, { key: "count", label: "REFUSED queries" }]} />
        </div>
      </div>

      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
        DoH/DoT/DoQ bypass attempts <MetricExplain metricId="doh_dot_doq_bypass_attempts" />
      </h2>
      <p className="mb-3 text-xs text-faint">{doh?.note}</p>
      <DataTable
        rows={(doh?.recentAttempts ?? []).map((a) => ({ domain: a.domain, clientId: a.clientId ?? "–", timestamp: new Date(a.timestamp).toLocaleString() }))}
        columns={[
          { key: "domain", label: "Provider domain" },
          { key: "clientId", label: "Client" },
          { key: "timestamp", label: "Time" },
        ]}
        emptyMessage="No DoH/DoT/DoQ bypass attempts observed."
      />
    </Layout>
  );
}
