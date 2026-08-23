import chalk from "chalk";
import { apiGet } from "../api-client.js";
import { section, table, stat, noDataNote } from "../output.js";
import { renderTimeSeries } from "../charts/timeseries.js";
import { renderBarChart } from "../charts/bar.js";
import { resolveChartStyle } from "../config.js";

interface WeeklyReport {
  period: { from: string; to: string };
  totalQueries: number;
  cacheHitRate: number;
  weekOverWeek: { queriesDeltaPercent: number | null };
}
interface MonthlyReport {
  period: { from: string; to: string };
  totalQueries: number;
  monthOverMonth: { queriesDeltaPercent: number | null };
  categoryBreakdown: { category: string; queries: number; share: number }[];
}
interface Fingerprint {
  diversityIndex: number;
  repeatRatio: number;
  trackerRatio: number;
}
interface CategoryMomentum {
  category: string;
  shareBefore: number;
  shareAfter: number;
  momentumPercentagePoints: number;
}
interface ChurnRate {
  added: number;
  dropped: number;
  churnRate: number;
}
interface RetentionBucket {
  days: number;
  cohortSize: number;
  stillActiveShare: number | null;
}
interface ToolUsage {
  savedQueryCount: number;
  dashboardCount: number;
  reportScheduleCount: number;
}
interface StorageFootprint {
  dbFileSizeBytes: number;
  totalDnsEvents: number;
  perTable: { table: string; bytes: number }[];
  note: string;
}
interface SeasonalDay {
  date: string;
  dayOfWeek: string;
  actual: number;
  historicalAvgForWeekday: number;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export async function reportCommand(): Promise<void> {
  const [weekly, monthly, fingerprint, momentum, churn, retention, toolUsage, storage, seasonal] = await Promise.all([
    apiGet<WeeklyReport>("/api/analytics/weekly-report"), // #47
    apiGet<MonthlyReport>("/api/analytics/monthly-report"), // #82
    apiGet<Fingerprint>("/api/analytics/fingerprint"), // #48
    apiGet<CategoryMomentum[]>("/api/analytics/category-momentum"), // #74
    apiGet<ChurnRate>("/api/analytics/churn"), // #76
    apiGet<RetentionBucket[]>("/api/analytics/retention"), // #77
    apiGet<ToolUsage>("/api/analytics/tool-usage"), // #83
    apiGet<StorageFootprint>("/api/analytics/storage-footprint"), // #84
    apiGet<SeasonalDay[]>("/api/analytics/seasonal"), // #75
  ]);

  console.log(chalk.bold(`\nWeekly report (${weekly.period.from} → ${weekly.period.to})\n`));
  stat("Total queries", weekly.totalQueries.toLocaleString());
  stat("Cache hit rate", `${(weekly.cacheHitRate * 100).toFixed(1)}%`);
  stat("Week-over-week", weekly.weekOverWeek.queriesDeltaPercent !== null ? `${weekly.weekOverWeek.queriesDeltaPercent >= 0 ? "+" : ""}${weekly.weekOverWeek.queriesDeltaPercent.toFixed(1)}%` : "not enough history");
  stat("Diversity index", fingerprint.diversityIndex.toFixed(3));
  stat("Tracker ratio", `${(fingerprint.trackerRatio * 100).toFixed(1)}%`);

  console.log(chalk.bold(`\nMonthly report (${monthly.period.from} → ${monthly.period.to})\n`));
  stat("Total queries", monthly.totalQueries.toLocaleString());
  stat(
    "Month-over-month",
    monthly.monthOverMonth.queriesDeltaPercent !== null ? `${monthly.monthOverMonth.queriesDeltaPercent >= 0 ? "+" : ""}${monthly.monthOverMonth.queriesDeltaPercent.toFixed(1)}%` : "not enough history"
  );

  section("Category share momentum (week over week)");
  console.log(
    renderBarChart(
      momentum.slice(0, 10).map((m) => ({ label: m.category, value: Number(m.momentumPercentagePoints.toFixed(1)) })),
      { color: chalk.magenta, valueFormatter: (v) => `${v >= 0 ? "+" : ""}${v}pp` }
    )
  );

  section("Seasonal pattern (actual vs historical average by day)");
  console.log(
    renderTimeSeries(
      [
        { label: "actual", values: seasonal.map((d) => d.actual) },
        { label: "historical avg", values: seasonal.map((d) => d.historicalAvgForWeekday) },
      ],
      resolveChartStyle(),
      { height: 8 }
    )
  );

  section("Domain churn & retention");
  stat("Added", churn.added, 16);
  stat("Dropped", churn.dropped, 16);
  stat("Churn rate", `${(churn.churnRate * 100).toFixed(1)}%`, 16);
  console.log(
    renderBarChart(
      retention.filter((r) => r.stillActiveShare !== null).map((r) => ({ label: `${r.days}d cohort`, value: Number(((r.stillActiveShare ?? 0) * 100).toFixed(0)) })),
      { color: chalk.green, valueFormatter: (v) => `${v}%` }
    )
  );

  section("Tool usage");
  stat("Saved Explorer queries", toolUsage.savedQueryCount, 24);
  stat("Dashboards", toolUsage.dashboardCount, 24);
  stat("Report schedules", toolUsage.reportScheduleCount, 24);

  section("Storage footprint");
  stat("Database file size", formatBytes(storage.dbFileSizeBytes), 24);
  stat("Total DNS events", storage.totalDnsEvents.toLocaleString(), 24);
  table(
    storage.perTable.slice(0, 10).map((t) => ({ table: t.table, size: formatBytes(t.bytes) })),
    [
      { key: "table", label: "Table" },
      { key: "size", label: "Size" },
    ]
  );
  noDataNote(storage.note);

  console.log();
}
