import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { colorFor, CHART_GRID_COLOR, CHART_AXIS_COLOR, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER } from "./palette";
import { ChartPanel, EmptyChartState } from "./ChartPanel";

export interface DistributionRow {
  name: string;
  value: number;
}

export function DistributionBar({
  title,
  metricId,
  data,
  height = 280,
  valueFormatter,
  singleColor,
  controls,
}: {
  title: string;
  metricId?: string;
  data: DistributionRow[];
  height?: number;
  valueFormatter?: (v: number) => string;
  singleColor?: string;
  controls?: React.ReactNode;
}) {
  return (
    <ChartPanel title={title} metricId={metricId} controls={controls} height={height}>
      {data.length === 0 ? (
        <EmptyChartState />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} horizontal={false} />
            <XAxis type="number" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 12 }}
              formatter={(v: number) => (valueFormatter ? valueFormatter(v) : v)}
            />
            <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {data.map((row) => (
                <Cell key={row.name} fill={singleColor ?? colorFor(row.name)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartPanel>
  );
}
