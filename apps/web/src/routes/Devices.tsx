import { useQuery } from "@tanstack/react-query";
import { Layout } from "../components/Layout";
import { MetricCard } from "../components/MetricCard";
import { MetricExplain } from "../components/MetricExplain";
import { DataTable } from "../components/DataTable";
import { SeriesLineChart } from "../components/charts/SeriesLineChart";
import { api, apiGet } from "../lib/api";

interface IdleDevice {
  deviceId: string;
  hostname: string | null;
  lastSeen: string;
  idleHours: number;
}
interface VendorHint {
  deviceId: string;
  hostname: string | null;
  mac: string | null;
  vendorHint: string | null;
  note: string;
}
interface RateRank {
  deviceId: string;
  hostname: string | null;
  queries: number;
  percentileRank: number;
}
interface LeaseChurnDay {
  date: string;
  new: number;
  renewed: number;
  ipChanged: number;
  expired: number;
}
interface LeaseDuration {
  hasData: boolean;
  note: string | null;
  sampleSize?: number;
  avgHours?: number;
  medianHours?: number;
  minHours?: number;
  maxHours?: number;
}
interface IpContinuity {
  genuinelyNewDevices: number;
  returningDevices: number;
  returningShare: number;
  distinctMacsEverSeen: number;
}
interface ActivityGapEntry {
  mac: string;
  ipAddress: string;
  leaseObtained: string;
  firstDnsQuery: string | null;
  gapMinutes: number | null;
}

export function DevicesPage() {
  const { data: devices } = useQuery({ queryKey: ["devices"], queryFn: api.devices, refetchInterval: 10000 });
  const { data: idle } = useQuery({ queryKey: ["devices-idle"], queryFn: () => apiGet<IdleDevice[]>("/devices/idle"), refetchInterval: 30000 });
  const { data: vendors } = useQuery({ queryKey: ["devices-vendor"], queryFn: () => apiGet<VendorHint[]>("/devices/vendor-hints"), refetchInterval: 60000 });
  const { data: rateRank } = useQuery({ queryKey: ["devices-rate-rank"], queryFn: () => apiGet<RateRank[]>("/devices/rate-rank"), refetchInterval: 15000 });
  const { data: leaseChurn } = useQuery({ queryKey: ["dhcp-lease-churn"], queryFn: () => apiGet<LeaseChurnDay[]>("/dhcp/lease-churn"), refetchInterval: 60000 });
  const { data: leaseDuration } = useQuery({ queryKey: ["dhcp-lease-duration"], queryFn: () => apiGet<LeaseDuration>("/dhcp/lease-duration"), refetchInterval: 60000 });
  const { data: ipContinuity } = useQuery({ queryKey: ["dhcp-ip-continuity"], queryFn: () => apiGet<IpContinuity>("/dhcp/ip-continuity"), refetchInterval: 60000 });
  const { data: activityGap } = useQuery({ queryKey: ["dhcp-activity-gap"], queryFn: () => apiGet<ActivityGapEntry[]>("/dhcp/activity-gap"), refetchInterval: 60000 });

  const churnSeries = (leaseChurn ?? []).map((d) => ({ label: d.date.slice(5), new: d.new, renewed: d.renewed, ipChanged: d.ipChanged, expired: d.expired }));

  return (
    <Layout title="Devices">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Active devices" value={devices?.length ?? "–"} />
        <MetricCard label="Idle right now" value={idle?.length ?? "–"} metricId="device_idle_detection" />
        <MetricCard
          label="Returning device share"
          value={ipContinuity ? `${(ipContinuity.returningShare * 100).toFixed(0)}%` : "–"}
          metricId="ip_reuse_identity_continuity"
        />
        <MetricCard
          label="Avg lease duration"
          value={leaseDuration?.hasData && leaseDuration.avgHours !== undefined ? `${leaseDuration.avgHours.toFixed(1)}h` : "no data yet"}
          metricId="dhcp_lease_duration_distribution"
        />
      </div>

      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
        All active devices <MetricExplain metricId="device_query_rate_percentile_rank" />
      </h2>
      <div className="mb-6">
        <DataTable
          rows={(devices ?? []).map((d) => {
            const rank = rateRank?.find((r) => r.deviceId === d.deviceId);
            const vendor = vendors?.find((v) => v.deviceId === d.deviceId);
            return {
              hostname: d.hostname ?? "(unknown)",
              mac: d.mac ?? "–",
              vendorHint: vendor?.vendorHint ?? "–",
              currentIp: d.currentIp ?? "–",
              lastSeen: new Date(d.lastSeen).toLocaleString(),
              queries: rank?.queries ?? 0,
              percentileRank: rank ? `${rank.percentileRank.toFixed(0)}th` : "–",
            };
          })}
          keyField="mac"
          columns={[
            { key: "hostname", label: "Device" },
            { key: "mac", label: "MAC" },
            { key: "vendorHint", label: "Vendor hint" },
            { key: "currentIp", label: "IP" },
            { key: "lastSeen", label: "Last seen" },
            { key: "queries", label: "Queries" },
            { key: "percentileRank", label: "Rate percentile" },
          ]}
          emptyMessage="No active devices yet."
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted">Idle devices</h2>
          <DataTable
            rows={(idle ?? []).map((d) => ({ hostname: d.hostname ?? "(unknown)", lastSeen: new Date(d.lastSeen).toLocaleString(), idleHours: d.idleHours.toFixed(1) }))}
            columns={[
              { key: "hostname", label: "Device" },
              { key: "lastSeen", label: "Last seen" },
              { key: "idleHours", label: "Idle (hours)" },
            ]}
            emptyMessage="No idle devices — everything's been active recently."
          />
        </div>
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            DHCP-to-DNS activity gap <MetricExplain metricId="dhcp_to_dns_activity_gap" />
          </h2>
          <DataTable
            rows={(activityGap ?? []).map((g) => ({
              ipAddress: g.ipAddress,
              leaseObtained: new Date(g.leaseObtained).toLocaleString(),
              gapMinutes: g.gapMinutes !== null ? g.gapMinutes.toFixed(0) : "–",
            }))}
            columns={[
              { key: "ipAddress", label: "IP" },
              { key: "leaseObtained", label: "Lease obtained" },
              { key: "gapMinutes", label: "Minutes to first DNS query" },
            ]}
            emptyMessage="No lease-to-DNS gap data yet."
          />
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted">DHCP lease churn</h2>
      <div className="mb-6">
        <SeriesLineChart
          title="New / renewed / IP-changed / expired leases per day"
          metricId="dhcp_lease_churn"
          data={churnSeries}
          seriesKeys={["new", "renewed", "ipChanged", "expired"]}
          chartType="area"
        />
      </div>

      {leaseDuration?.note && <p className="text-xs text-faint">{leaseDuration.note}</p>}
    </Layout>
  );
}
