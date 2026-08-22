import { ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { colorFor, CHART_GRID_COLOR, CHART_AXIS_COLOR, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER } from "./palette";
import { ChartPanel, EmptyChartState } from "./ChartPanel";

/**
 * Like TrendChart, but takes already-computed rows directly instead of
 * going through the Explorer query engine — for the many new metrics whose
 * series come straight from a dedicated analytics endpoint (lease churn by
 * day, host resource samples, category momentum, etc.) rather than from
 * dns_events via the Explorer's QueryMetric vocabulary.
 */
export function SeriesLineChart({
  title,
  metricId,
  data,
  seriesKeys,
  labelKey = "label",
  chartType = "line",
  height = 260,
  controls,
  valueFormatter,
}: {
  title: string;
  metricId?: string;
  data: Record<string, string | number>[];
  seriesKeys: string[];
  labelKey?: string;
  chartType?: "line" | "area";
  height?: number;
  controls?: React.ReactNode;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <ChartPanel title={title} metricId={metricId} controls={controls} height={height}>
      {data.length === 0 ? (
        <EmptyChartState />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "line" ? (
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis dataKey={labelKey} tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
              <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 12 }}
                formatter={(v: number) => (valueFormatter ? valueFormatter(v) : v)}
              />
              {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {seriesKeys.map((key) => (
                <Line key={key} type="monotone" dataKey={key} stroke={colorFor(key)} strokeWidth={1.75} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {seriesKeys.map((key) => (
                  <linearGradient key={key} id={`sgrad-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorFor(key)} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={colorFor(key)} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis dataKey={labelKey} tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
              <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 12 }}
                formatter={(v: number) => (valueFormatter ? valueFormatter(v) : v)}
              />
              {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {seriesKeys.map((key) => (
                <Area key={key} type="monotone" dataKey={key} stroke={colorFor(key)} strokeWidth={1.5} fill={`url(#sgrad-${key})`} isAnimationActive={false} />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      )}
    </ChartPanel>
  );
}
