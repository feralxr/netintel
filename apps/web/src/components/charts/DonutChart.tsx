import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { colorFor, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER } from "./palette";
import { ChartPanel, EmptyChartState } from "./ChartPanel";

export interface DonutRow {
  name: string;
  value: number;
}

export function DonutChart({
  title,
  metricId,
  data,
  height = 280,
  centerLabel,
  controls,
}: {
  title: string;
  metricId?: string;
  data: DonutRow[];
  height?: number;
  centerLabel?: string;
  controls?: React.ReactNode;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <ChartPanel title={title} metricId={metricId} controls={controls} height={height}>
      {data.length === 0 || total === 0 ? (
        <EmptyChartState />
      ) : (
        <div className="relative h-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                isAnimationActive={false}
              >
                {data.map((row) => (
                  <Cell key={row.name} fill={colorFor(row.name)} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 12 }}
                formatter={(v: number, name: string) => [`${v} (${((v / total) * 100).toFixed(1)}%)`, name]}
              />
              <Legend
                layout="vertical"
                verticalAlign="middle"
                align="right"
                wrapperStyle={{ fontSize: 11, lineHeight: "18px" }}
              />
            </PieChart>
          </ResponsiveContainer>
          {centerLabel && (
            <div className="pointer-events-none absolute left-[27%] top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="text-lg font-semibold text-text">{centerLabel}</div>
            </div>
          )}
        </div>
      )}
    </ChartPanel>
  );
}
