import { useQuery } from "@tanstack/react-query";
import { Layout } from "../components/Layout";
import { MetricCard } from "../components/MetricCard";
import { MetricExplain } from "../components/MetricExplain";
import { DataTable } from "../components/DataTable";
import { useTimeRange } from "../components/TimeRange";
import { TrendChart } from "../components/charts/TrendChart";
import { SeriesLineChart } from "../components/charts/SeriesLineChart";
import { DonutChart } from "../components/charts/DonutChart";
import { RadarChartCard } from "../components/charts/RadarChartCard";
import { api, apiGet } from "../lib/api";

interface WeeklyReport {
  period: { from: string; to: string };
  totalQueries: number;
  uniqueDomains: number;
  newDomains: number;
  cacheHitRate: number;
  blockedQueries: number;
  peakHour: number;
  quietHour: number;
  categoryBreakdown: { category: string; queries: number; share: number }[];
  weekOverWeek: { queriesDeltaPercent: number | null };
  hasFullWeekOfData: boolean;
}

interface Fingerprint {
  categoryShares: { category: string; share: number }[];
  diversityIndex: number;
  repeatRatio: number;
  trackerRatio: number;
  peakHour: number;
}

async function fetchWeeklyReport(): Promise<WeeklyReport> {
  const res = await fetch("/api/analytics/weekly-report");
  if (!res.ok) throw new Error("failed to load weekly report");
  return res.json();
}

async function fetchFingerprint(): Promise<Fingerprint> {
  const res = await fetch("/api/analytics/fingerprint");
  if (!res.ok) throw new Error("failed to load fingerprint");
  return res.json();
}

interface CategoryMomentum {
  category: string;
  shareBefore: number;
  shareAfter: number;
  momentumPercentagePoints: number;
}
interface SeasonalDay {
  date: string;
  dayOfWeek: string;
  actual: number;
  historicalAvgForWeekday: number;
  deviationPercent: number | null;
}
interface ChurnRate {
  added: number;
  dropped: number;
  totalDomainsEitherPeriod: number;
  churnRate: number;
}
interface RetentionBucket {
  days: number;
  cohortSize: number;
  stillActiveShare: number | null;
}

export function HistoryPage() {
  const [range] = useTimeRange("30d");
  const { data: report } = useQuery({ queryKey: ["weekly-report"], queryFn: fetchWeeklyReport, refetchInterval: 30000 });
  const { data: fingerprint } = useQuery({ queryKey: ["fingerprint"], queryFn: fetchFingerprint, refetchInterval: 30000 });
  const { data: notifications } = useQuery({
    queryKey: ["notifications-insights"],
    queryFn: () => api.notifications(50),
    refetchInterval: 10000,
  });
  const { data: categoryMomentum } = useQuery({ queryKey: ["category-momentum"], queryFn: () => apiGet<CategoryMomentum[]>("/analytics/category-momentum"), refetchInterval: 60000 });
  const { data: seasonal } = useQuery({ queryKey: ["seasonal"], queryFn: () => apiGet<SeasonalDay[]>("/analytics/seasonal"), refetchInterval: 60000 });
  const { data: churn } = useQuery({ queryKey: ["churn"], queryFn: () => apiGet<ChurnRate>("/analytics/churn"), refetchInterval: 60000 });
  const { data: retention } = useQuery({ queryKey: ["retention"], queryFn: () => apiGet<RetentionBucket[]>("/analytics/retention"), refetchInterval: 60000 });

  const insights = (notifications ?? []).filter((n) => n.category === "insights");

  const categoryDonutData = (report?.categoryBreakdown ?? []).map((c) => ({ name: c.category, value: c.queries }));
  const fingerprintRadarData = (fingerprint?.categoryShares ?? [])
    .filter((c) => c.share > 0)
    .slice(0, 8)
    .map((c) => ({ axis: c.category, value: Number((c.share * 100).toFixed(1)) }));

  return (
    <Layout title="History">
      {report && !report.hasFullWeekOfData && (
        <div className="mb-6 rounded border border-border bg-surface p-4">
          <p className="text-sm text-muted">
            This report is running on less than a full week of history — week-over-week deltas will fill in as more
            days of data accumulate.
          </p>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-muted">30-day query volume</h2>
      <div className="mb-8">
        <TrendChart
          title="Total queries per day"
          metricId="internet_activity_trends"
          queryMetric="count"
          range={range}
          chartType="area"
          height={240}
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted">
        Weekly report {report ? `(${report.period.from} → ${report.period.to})` : ""}
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Total queries" value={report?.totalQueries ?? "–"} metricId="weekly_internet_report" />
        <MetricCard label="Unique domains" value={report?.uniqueDomains ?? "–"} />
        <MetricCard label="New domains" value={report?.newDomains ?? "–"} />
        <MetricCard
          label="Cache hit rate"
          value={report ? `${(report.cacheHitRate * 100).toFixed(1)}%` : "–"}
        />
        <MetricCard label="Blocked queries" value={report?.blockedQueries ?? "–"} />
        <MetricCard label="Peak hour (UTC)" value={report ? `${report.peakHour}:00` : "–"} />
        <MetricCard label="Quietest hour (UTC)" value={report ? `${report.quietHour}:00` : "–"} />
        <MetricCard
          label="Week-over-week"
          value={
            report?.weekOverWeek.queriesDeltaPercent != null
              ? `${report.weekOverWeek.queriesDeltaPercent >= 0 ? "+" : ""}${report.weekOverWeek.queriesDeltaPercent.toFixed(1)}%`
              : "not enough history"
          }
        />
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <RadarChartCard title="Personal internet fingerprint" metricId="personal_internet_fingerprint" data={fingerprintRadarData} height={300} />
        <DonutChart title="Category breakdown this week" metricId="weekly_internet_report" data={categoryDonutData} height={300} />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="Diversity index"
          value={fingerprint ? fingerprint.diversityIndex.toFixed(3) : "–"}
          metricId="personal_internet_fingerprint"
        />
        <MetricCard label="Repeat ratio" value={fingerprint ? fingerprint.repeatRatio.toFixed(3) : "–"} />
        <MetricCard
          label="Tracker ratio"
          value={fingerprint ? `${(fingerprint.trackerRatio * 100).toFixed(1)}%` : "–"}
        />
        <MetricCard label="Peak hour" value={fingerprint ? `${fingerprint.peakHour}:00` : "–"} />
      </div>

      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
        Category share momentum <MetricExplain metricId="category_share_momentum" />
      </h2>
      <div className="mb-8">
        <DataTable
          rows={(categoryMomentum ?? []).map((c) => ({
            category: c.category,
            shareBefore: `${(c.shareBefore * 100).toFixed(1)}%`,
            shareAfter: `${(c.shareAfter * 100).toFixed(1)}%`,
            momentum: `${c.momentumPercentagePoints > 0 ? "+" : ""}${c.momentumPercentagePoints.toFixed(1)}pp`,
          }))}
          columns={[
            { key: "category", label: "Category" },
            { key: "shareBefore", label: "Last week" },
            { key: "shareAfter", label: "This week" },
            { key: "momentum", label: "Momentum" },
          ]}
        />
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            Seasonal pattern <MetricExplain metricId="seasonal_pattern_detection" />
          </h2>
          <SeriesLineChart
            title="Actual vs historical average by weekday"
            data={(seasonal ?? []).map((d) => ({ label: d.dayOfWeek.slice(0, 3), actual: d.actual, historicalAvg: d.historicalAvgForWeekday }))}
            seriesKeys={["actual", "historicalAvg"]}
            chartType="line"
            height={220}
          />
        </div>
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
            Domain churn & retention <MetricExplain metricId="domain_churn_rate" />
          </h2>
          <div className="mb-3 grid grid-cols-3 gap-3">
            <MetricCard label="Added" value={churn?.added ?? "–"} />
            <MetricCard label="Dropped" value={churn?.dropped ?? "–"} />
            <MetricCard label="Churn rate" value={churn ? `${(churn.churnRate * 100).toFixed(1)}%` : "–"} />
          </div>
          <DataTable
            rows={(retention ?? []).map((r) => ({
              days: `${r.days}d`,
              cohortSize: r.cohortSize,
              stillActiveShare: r.stillActiveShare !== null ? `${(r.stillActiveShare * 100).toFixed(0)}%` : "no cohort",
            }))}
            columns={[
              { key: "days", label: "Cohort age" },
              { key: "cohortSize", label: "Cohort size" },
              { key: "stillActiveShare", label: "Still active" },
            ]}
          />
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted">Insight notifications so far</h2>
      <div className="flex flex-col gap-2">
        {insights.map((n) => (
          <div key={n.id} className="rounded border border-border bg-surface p-3 text-sm">
            <p className="text-text">{n.title}</p>
            <p className="mt-1 text-xs text-muted">{n.explanation}</p>
            <p className="mt-1 text-xs text-faint">{new Date(n.timestamp).toLocaleString()}</p>
          </div>
        ))}
        {insights.length === 0 && <p className="text-xs text-faint">No insights generated yet.</p>}
      </div>
    </Layout>
  );
}
