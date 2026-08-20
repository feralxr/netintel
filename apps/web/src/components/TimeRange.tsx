import { useState, useMemo } from "react";

export type RangePreset = "1h" | "6h" | "24h" | "7d" | "30d";

const PRESET_HOURS: Record<RangePreset, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

const PRESET_LABELS: Record<RangePreset, string> = {
  "1h": "1h",
  "6h": "6h",
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
};

/** Auto-picks a sane bucketing interval for a given range — hourly for anything under 3 days, daily beyond that. */
function intervalForPreset(preset: RangePreset): "hour" | "day" {
  return PRESET_HOURS[preset] <= 72 ? "hour" : "day";
}

export interface TimeRangeState {
  preset: RangePreset;
  from: string;
  to: string;
  interval: "hour" | "day";
}

export function useTimeRange(initial: RangePreset = "24h"): [TimeRangeState, (p: RangePreset) => void] {
  const [preset, setPreset] = useState<RangePreset>(initial);

  const state = useMemo<TimeRangeState>(() => {
    const to = new Date();
    const from = new Date(to.getTime() - PRESET_HOURS[preset] * 3_600_000);
    return { preset, from: from.toISOString(), to: to.toISOString(), interval: intervalForPreset(preset) };
  }, [preset]);

  return [state, setPreset];
}

export function TimeRangeControl({ value, onChange }: { value: RangePreset; onChange: (p: RangePreset) => void }) {
  const presets: RangePreset[] = ["1h", "6h", "24h", "7d", "30d"];
  return (
    <div className="flex items-center gap-1 rounded border border-border bg-surface p-0.5">
      {presets.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`rounded px-2.5 py-1 text-xs transition-colors ${
            value === p ? "bg-accent text-bg font-medium" : "text-muted hover:text-text"
          }`}
        >
          {PRESET_LABELS[p]}
        </button>
      ))}
    </div>
  );
}
