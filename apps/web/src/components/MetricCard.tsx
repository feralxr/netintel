import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { MetricExplain } from "./MetricExplain";

interface MetricCardProps {
  label: string;
  value: string | number;
  metricId?: string;
  delta?: string;
  deltaTone?: "ok" | "warn" | "crit";
  sparkline?: number[];
}

export function MetricCard({ label, value, metricId, delta, deltaTone = "ok", sparkline }: MetricCardProps) {
  const deltaColor = deltaTone === "ok" ? "text-ok" : deltaTone === "warn" ? "text-warn" : "text-crit";

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
        {metricId && <MetricExplain metricId={metricId} />}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-text">{value}</div>
          {delta && <div className={`mt-1 text-xs ${deltaColor}`}>{delta}</div>}
        </div>
        {sparkline && sparkline.length > 1 && (
          <div className="h-10 w-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkline.map((v, i) => ({ i, v }))}>
                <defs>
                  <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e8622c" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#e8622c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#e8622c"
                  strokeWidth={1.5}
                  fill={`url(#spark-${label})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
