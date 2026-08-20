import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { runExplorerQuery, type QueryMetric, type Dimension, type FilterGroup } from "../../lib/explorer-api";
import type { TimeRangeState } from "../TimeRange";
import { colorFor, CHART_GRID_COLOR, CHART_AXIS_COLOR, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER } from "./palette";
import { ChartPanel, EmptyChartState } from "./ChartPanel";

interface TrendChartProps {
  title: string;
  metricId?: string;
  queryMetric: QueryMetric;
  range: TimeRangeState;
  groupBy?: Dimension;
  filter?: FilterGroup;
  chartType?: "line" | "area";
  stacked?: boolean;
  height?: number;
  controls?: React.ReactNode;
  maxSeries?: number; // cap the number of distinct series shown, keeping the highest-volume ones
}

function formatBucket(bucket: string, interval: "hour" | "day"): string {
  const d = new Date(interval === "day" ? bucket : bucket);
  if (interval === "day") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function TrendChart({
  title,
  metricId,
  queryMetric,
  range,
  groupBy,
  filter,
  chartType = "area",
  stacked = false,
  height = 280,
  controls,
  maxSeries = 6,
}: TrendChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["explorer-trend", queryMetric, range.from, range.to, range.interval, groupBy, JSON.stringify(filter)],
    queryFn: () =>
      runExplorerQuery({
        metric: queryMetric,
        groupBy: groupBy ? [groupBy] : undefined,
        filter,
        timeRange: { from: range.from, to: range.to },
        interval: range.interval,
        limit: 5000,
      }),
    refetchInterval: 30000,
  });

  const { pivoted, seriesKeys } = usePivot(data?.rows, groupBy, range.interval, maxSeries);

  return (
    <ChartPanel title={title} metricId={metricId} controls={controls} height={height}>
      {isLoading && <EmptyChartState message="Loading…" />}
      {!isLoading && pivoted.length === 0 && <EmptyChartState />}
      {!isLoading && pivoted.length > 0 && (
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "line" ? (
            <LineChart data={pivoted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
              <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 12 }} />
              {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {seriesKeys.map((key) => (
                <Line key={key} type="monotone" dataKey={key} stroke={colorFor(key)} strokeWidth={1.75} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={pivoted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {seriesKeys.map((key) => (
                  <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorFor(key)} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={colorFor(key)} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
              <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 12 }} />
              {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {seriesKeys.map((key) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colorFor(key)}
                  strokeWidth={1.5}
                  fill={`url(#grad-${key})`}
                  stackId={stacked ? "stack" : undefined}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      )}
    </ChartPanel>
  );
}

function usePivot(
  rows: { [k: string]: string | number | boolean | null }[] | undefined,
  groupBy: Dimension | undefined,
  interval: "hour" | "day",
  maxSeries: number
): { pivoted: Record<string, string | number>[]; seriesKeys: string[] } {
  if (!rows || rows.length === 0) return { pivoted: [], seriesKeys: [] };

  if (!groupBy) {
    const sorted = [...rows].sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));
    return {
      pivoted: sorted.map((r) => ({ label: formatBucket(String(r.bucket), interval), value: Number(r.value) })),
      seriesKeys: ["value"],
    };
  }

  // Rank series by total volume, keep the top N, everything else folds into "other".
  const totals = new Map<string, number>();
  for (const r of rows) {
    const key = String(r[groupBy] ?? "unknown");
    totals.set(key, (totals.get(key) ?? 0) + Number(r.value));
  }
  const topKeys = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxSeries)
    .map(([k]) => k);
  const topKeySet = new Set(topKeys);

  const byBucket = new Map<string, Record<string, string | number>>();
  for (const r of rows) {
    const bucket = String(r.bucket);
    const key = String(r[groupBy] ?? "unknown");
    const seriesKey = topKeySet.has(key) ? key : "other";
    if (!byBucket.has(bucket)) byBucket.set(bucket, { label: formatBucket(bucket, interval), bucket });
    const row = byBucket.get(bucket)!;
    row[seriesKey] = (Number(row[seriesKey]) || 0) + Number(r.value);
  }

  const pivoted = [...byBucket.values()].sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));
  const seriesKeys = [...topKeys, ...(rows.some((r) => !topKeySet.has(String(r[groupBy] ?? "unknown"))) ? ["other"] : [])];

  return { pivoted, seriesKeys };
}
