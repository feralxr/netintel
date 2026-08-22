import { useQuery } from "@tanstack/react-query";
import { Layout } from "../components/Layout";
import { MetricCard } from "../components/MetricCard";
import { MetricExplain } from "../components/MetricExplain";
import { DataTable } from "../components/DataTable";
import { apiGet } from "../lib/api";

interface MonthlyReport {
  period: { from: string; to: string };
  totalQueries: number;
  uniqueDomains: number;
  newDomains: number;
  cacheHitRate: number;
  blockedQueries: number;
  peakHour: number;
  quietHour: number;
  categoryBreakdown: { category: string; queries: number; uniqueDomains: number; share: number }[];
  monthOverMonth: { queriesDeltaPercent: number | null };
  hasFullMonthOfData: boolean;
}
interface ToolUsage {
  savedQueryCount: number;
  dashboardCount: number;
  reportScheduleCount: number;
  enabledReportScheduleCount: number;
  note: string;
}
interface StorageFootprint {
  dbFileSizeBytes: number;
  perTable: { table: string; bytes: number }[];
  oldestRecord: string | null;
  totalDnsEvents: number;
  retentionLimitDays: number | null;
  daysToRetentionLimit: number | null;
  note: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function ReportsPage() {
  const { data: monthly } = useQuery({ queryKey: ["monthly-report"], queryFn: () => apiGet<MonthlyReport>("/analytics/monthly-report"), refetchInterval: 60000 });
  const { data: toolUsage } = useQuery({ queryKey: ["tool-usage"], queryFn: () => apiGet<ToolUsage>("/analytics/tool-usage"), refetchInterval: 60000 });
  const { data: storage } = useQuery({ queryKey: ["storage-footprint"], queryFn: () => apiGet<StorageFootprint>("/analytics/storage-footprint"), refetchInterval: 60000 });

  return (
    <Layout title="Reports">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
        Monthly internet report <MetricExplain metricId="monthly_internet_report" />
      </h2>
      {monthly && (
        <p className="mb-3 text-xs text-faint">
          {monthly.period.from} to {monthly.period.to}
          {!monthly.hasFullMonthOfData && " — still building up a full month of history for accurate month-over-month deltas."}
        </p>
      )}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Total queries this month" value={monthly?.totalQueries.toLocaleString() ?? "–"} />
        <MetricCard label="Unique domains" value={monthly?.uniqueDomains ?? "–"} />
        <MetricCard label="New domains" value={monthly?.newDomains ?? "–"} />
        <MetricCard
          label="Month-over-month"
          value={monthly?.monthOverMonth.queriesDeltaPercent !== null && monthly?.monthOverMonth.queriesDeltaPercent !== undefined ? `${monthly.monthOverMonth.queriesDeltaPercent > 0 ? "+" : ""}${monthly.monthOverMonth.queriesDeltaPercent.toFixed(1)}%` : "no prior month yet"}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Cache hit rate" value={monthly ? `${(monthly.cacheHitRate * 100).toFixed(1)}%` : "–"} />
        <MetricCard label="Blocked queries" value={monthly?.blockedQueries.toLocaleString() ?? "–"} />
        <MetricCard label="Peak hour" value={monthly ? `${monthly.peakHour}:00` : "–"} />
        <MetricCard label="Quiet hour" value={monthly ? `${monthly.quietHour}:00` : "–"} />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted">Category breakdown this month</h2>
      <div className="mb-6">
        <DataTable
          rows={(monthly?.categoryBreakdown ?? []).map((c) => ({ category: c.category, queries: c.queries, uniqueDomains: c.uniqueDomains, share: `${(c.share * 100).toFixed(1)}%` }))}
          columns={[
            { key: "category", label: "Category" },
            { key: "queries", label: "Queries" },
            { key: "uniqueDomains", label: "Unique domains" },
            { key: "share", label: "Share" },
          ]}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            Tool usage <MetricExplain metricId="tool_usage_meta_metrics" />
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="Saved Explorer queries" value={toolUsage?.savedQueryCount ?? "–"} />
            <MetricCard label="Dashboards" value={toolUsage?.dashboardCount ?? "–"} />
            <MetricCard label="Report schedules" value={toolUsage?.reportScheduleCount ?? "–"} />
            <MetricCard label="Enabled schedules" value={toolUsage?.enabledReportScheduleCount ?? "–"} />
          </div>
          {toolUsage?.note && <p className="mt-3 text-xs text-faint">{toolUsage.note}</p>}
        </div>

        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            Storage footprint <MetricExplain metricId="data_retention_storage_footprint" />
          </h2>
          <div className="mb-3 grid grid-cols-2 gap-4">
            <MetricCard label="Database file size" value={storage ? formatBytes(storage.dbFileSizeBytes) : "–"} />
            <MetricCard label="Total DNS events" value={storage?.totalDnsEvents.toLocaleString() ?? "–"} />
          </div>
          {storage?.oldestRecord && (
            <p className="mb-3 text-xs text-faint">Oldest retained record: {new Date(storage.oldestRecord).toLocaleString()}</p>
          )}
          {storage?.note && <p className="text-xs text-faint">{storage.note}</p>}
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted">Storage by table</h2>
      <DataTable
        rows={(storage?.perTable ?? []).slice(0, 15).map((t) => ({ table: t.table, size: formatBytes(t.bytes) }))}
        columns={[
          { key: "table", label: "Table" },
          { key: "size", label: "Size" },
        ]}
      />
    </Layout>
  );
}
