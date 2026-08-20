import type { ReactNode } from "react";
import { MetricExplain } from "../MetricExplain";

export function ChartPanel({
  title,
  metricId,
  controls,
  children,
  height = 280,
}: {
  title: string;
  metricId?: string;
  controls?: ReactNode;
  children: ReactNode;
  height?: number;
}) {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
          {metricId && <MetricExplain metricId={metricId} />}
        </div>
        {controls}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

export function EmptyChartState({ message = "Not enough data yet" }: { message?: string }) {
  return <div className="flex h-full items-center justify-center text-xs text-faint">{message}</div>;
}
