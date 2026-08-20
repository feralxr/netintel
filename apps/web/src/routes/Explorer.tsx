import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Layout } from "../components/Layout";
import { TimeRangeControl, useTimeRange } from "../components/TimeRange";
import { CHART_GRID_COLOR, CHART_AXIS_COLOR, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER } from "../components/charts/palette";
import { runExplorerQuery, type Dimension, type QueryMetric, type FilterCondition, type QueryResult } from "../lib/explorer-api";

const METRICS: { value: QueryMetric; label: string }[] = [
  { value: "count", label: "Count" },
  { value: "uniqueDomains", label: "Unique domains" },
  { value: "uniqueClients", label: "Unique clients" },
  { value: "avgResponseTime", label: "Avg response time" },
  { value: "blockedCount", label: "Blocked count" },
  { value: "nxdomainCount", label: "NXDOMAIN count" },
];

const DIMENSIONS: Dimension[] = [
  "domain",
  "registeredDomain",
  "clientId",
  "clientIp",
  "protocol",
  "queryType",
  "responseCode",
  "cached",
  "blocked",
  "recursive",
  "category",
];

const OPERATORS: { value: FilterCondition["operator"]; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "ne", label: "!=" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "contains", label: "contains" },
];

type ChartType = "table" | "line" | "bar" | "area";

export function ExplorerPage() {
  const [range, setRange] = useTimeRange("24h");
  const [metric, setMetric] = useState<QueryMetric>("count");
  const [groupBy, setGroupBy] = useState<Dimension | "">("");
  const [logic, setLogic] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const [chartType, setChartType] = useState<ChartType>("table");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [curlText, setCurlText] = useState<string | null>(null);

  const runQuery = useMutation({
    mutationFn: () =>
      runExplorerQuery({
        metric,
        groupBy: groupBy ? [groupBy] : undefined,
        filter: conditions.length > 0 ? { logic, conditions } : undefined,
        timeRange: { from: range.from, to: range.to },
        interval: chartType === "table" ? null : range.interval,
      }),
  });

  const saveView = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/explorer/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName,
          chartType,
          definition: {
            metric,
            groupBy: groupBy ? [groupBy] : undefined,
            filter: conditions.length > 0 ? { logic, conditions } : undefined,
            timeRange: { from: range.from, to: range.to },
            interval: chartType === "table" ? null : range.interval,
          },
        }),
      });
      if (!res.ok) throw new Error("failed to save view");
      return res.json();
    },
    onSuccess: () => {
      setSaveOpen(false);
      setSaveName("");
    },
  });

  const addCondition = () => setConditions((c) => [...c, { dimension: "domain", operator: "eq", value: "" }]);
  const updateCondition = (i: number, patch: Partial<FilterCondition>) =>
    setConditions((c) => c.map((cond, idx) => (idx === i ? { ...cond, ...patch } : cond)));
  const removeCondition = (i: number) => setConditions((c) => c.filter((_, idx) => idx !== i));

  const showApiCall = async () => {
    const res = await fetch("/api/explorer/query/curl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric,
        groupBy: groupBy ? [groupBy] : undefined,
        filter: conditions.length > 0 ? { logic, conditions } : undefined,
        timeRange: { from: range.from, to: range.to },
        interval: chartType === "table" ? null : range.interval,
      }),
    });
    const data = await res.json();
    setCurlText(data.curl);
  };

  return (
    <Layout title="Explorer">
      <div className="mb-6 rounded border border-border bg-surface p-4">
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Metric</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as QueryMetric)}
              className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            >
              {METRICS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Group by</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as Dimension | "")}
              className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            >
              <option value="">(none)</option>
              {DIMENSIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Chart</label>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as ChartType)}
              className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            >
              <option value="table">Table</option>
              <option value="line">Line</option>
              <option value="bar">Bar</option>
              <option value="area">Area</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Time range</label>
            <TimeRangeControl value={range.preset} onChange={setRange} />
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wide text-faint">Filters</label>
            {conditions.length > 1 && (
              <select
                value={logic}
                onChange={(e) => setLogic(e.target.value as "AND" | "OR")}
                className="rounded border border-border bg-bg px-1.5 py-0.5 text-xs text-text outline-none"
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            )}
            <button onClick={addCondition} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-accent">
              + add filter
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={cond.dimension}
                  onChange={(e) => updateCondition(i, { dimension: e.target.value as Dimension })}
                  className="rounded border border-border bg-bg px-2 py-1 text-xs text-text outline-none"
                >
                  {DIMENSIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  value={cond.operator}
                  onChange={(e) => updateCondition(i, { operator: e.target.value as FilterCondition["operator"] })}
                  className="rounded border border-border bg-bg px-2 py-1 text-xs text-text outline-none"
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
                <input
                  value={String(cond.value)}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                  placeholder="value"
                  className="w-40 rounded border border-border bg-bg px-2 py-1 text-xs text-text outline-none focus:border-accent"
                />
                <button onClick={() => removeCondition(i)} className="text-xs text-faint hover:text-crit">
                  remove
                </button>
              </div>
            ))}
            {conditions.length === 0 && <p className="text-xs text-faint">No filters — querying all events in range.</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => runQuery.mutate()}
            className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
          >
            Run query
          </button>
          <button onClick={() => setSaveOpen((o) => !o)} className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-text">
            Save as view
          </button>
          <button onClick={showApiCall} className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-text">
            Show API call
          </button>
        </div>

        {saveOpen && (
          <div className="mt-3 flex items-center gap-2">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="View name…"
              className="w-64 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            />
            <button
              onClick={() => saveView.mutate()}
              disabled={!saveName || saveView.isPending}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-bg disabled:opacity-50"
            >
              {saveView.isPending ? "Saving…" : "Save"}
            </button>
            {saveView.isSuccess && <span className="text-xs text-ok">Saved — available to pin in a dashboard.</span>}
          </div>
        )}

        {curlText && (
          <pre className="mt-3 overflow-x-auto rounded border border-border bg-bg p-2 text-[11px] text-muted">{curlText}</pre>
        )}
      </div>

      <div className="rounded border border-border bg-surface p-4">
        {runQuery.isPending && <p className="text-sm text-faint">Running…</p>}
        {runQuery.isError && <p className="text-sm text-crit">Query failed: {(runQuery.error as Error).message}</p>}
        {runQuery.data && <ResultsView result={runQuery.data} chartType={chartType} groupBy={groupBy || undefined} />}
        {!runQuery.data && !runQuery.isPending && <p className="text-sm text-faint">Run a query to see results.</p>}
      </div>
    </Layout>
  );
}

function ResultsView({ result, chartType, groupBy }: { result: QueryResult; chartType: ChartType; groupBy?: Dimension }) {
  if (result.rows.length === 0) {
    return <p className="text-sm text-faint">No results for this query.</p>;
  }

  if (chartType === "table") {
    const columns = Object.keys(result.rows[0]);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-faint">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-3 py-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className="border-t border-border-subtle">
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-muted">
                    {String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-faint">{result.rowCount} rows</p>
      </div>
    );
  }

  const xKey = groupBy ?? "bucket";
  const data = result.rows.map((r) => ({ ...r, label: r[xKey] !== undefined ? String(r[xKey]) : "" }));

  return (
    <div style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        {chartType === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
            <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
            <Tooltip contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 12 }} />
            <Line type="monotone" dataKey="value" stroke="#e8622c" strokeWidth={1.75} dot={false} isAnimationActive={false} />
          </LineChart>
        ) : chartType === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
            <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
            <Tooltip contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 12 }} />
            <Bar dataKey="value" fill="#e8622c" isAnimationActive={false} />
          </BarChart>
        ) : (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="explorer-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e8622c" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#e8622c" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
            <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
            <Tooltip contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 12 }} />
            <Area type="monotone" dataKey="value" stroke="#e8622c" strokeWidth={1.5} fill="url(#explorer-area)" isAnimationActive={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
