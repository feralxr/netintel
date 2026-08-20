import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * Every metric surfaced in the dashboard renders this next to it. It reads
 * from the exact same metrics-registry entry that `netintel explain <id>`
 * prints in the terminal — one description source, two surfaces.
 */
export function MetricExplain({ metricId }: { metricId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["metric", metricId],
    queryFn: () => api.metric(metricId),
    enabled: open,
    staleTime: Infinity,
  });

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="What is this metric?"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] text-faint hover:border-accent hover:text-accent"
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 w-72 rounded border border-border bg-surface-2 p-3 text-xs shadow-lg">
          {isLoading && <p className="text-muted">Loading…</p>}
          {data && (
            <>
              <p className="mb-1 font-semibold text-text">{data.name}</p>
              <p className="text-muted">{data.description}</p>
              {data.formula && (
                <p className="mt-2 rounded bg-bg px-2 py-1 font-mono text-[11px] text-accent">{data.formula}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
