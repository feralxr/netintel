import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from "recharts";
import { CHART_GRID_COLOR, CHART_AXIS_COLOR, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER } from "./palette";
import { ChartPanel, EmptyChartState } from "./ChartPanel";

export interface RadarRow {
  axis: string;
  value: number;
}

export function RadarChartCard({
  title,
  metricId,
  data,
  height = 300,
  controls,
}: {
  title: string;
  metricId?: string;
  data: RadarRow[];
  height?: number;
  controls?: React.ReactNode;
}) {
  return (
    <ChartPanel title={title} metricId={metricId} controls={controls} height={height}>
      {data.length === 0 ? (
        <EmptyChartState />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid stroke={CHART_GRID_COLOR} />
            <PolarAngleAxis dataKey="axis" tick={{ fill: CHART_AXIS_COLOR, fontSize: 10 }} />
            <PolarRadiusAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 9 }} axisLine={false} />
            <Radar dataKey="value" stroke="#e8622c" fill="#e8622c" fillOpacity={0.35} isAnimationActive={false} />
            <Tooltip contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 12 }} />
          </RadarChart>
        </ResponsiveContainer>
      )}
    </ChartPanel>
  );
}
