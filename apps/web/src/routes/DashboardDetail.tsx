import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Layout } from "../components/Layout";
import { CHART_GRID_COLOR, CHART_AXIS_COLOR, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER } from "../components/charts/palette";

interface SavedQuery {
  id: string;
  name: string;
  chartType: string;
}

interface RenderedPanel {
  id: string;
  title: string;
  chartType: string;
  queryName: string;
  error: string | null;
  result: { rows: Record<string, string | number | boolean | null>[] } | null;
}

async function fetchSavedQueries(): Promise<SavedQuery[]> {
  const res = await fetch("/api/explorer/views");
  if (!res.ok) throw new Error("failed to load saved queries");
  return res.json();
}

async function fetchRenderedDashboard(id: string): Promise<{ dashboard: { name: string }; panels: RenderedPanel[] }> {
  const res = await fetch(`/api/dashboards/${id}/render`);
  if (!res.ok) throw new Error("failed to load dashboard");
  return res.json();
}

export function DashboardDetailPage() {
  const { id } = useParams({ from: "/dashboards/$id" });
  const [addOpen, setAddOpen] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState("");
  const [panelTitle, setPanelTitle] = useState("");
  const queryClient = useQueryClient();

  const { data } = useQuery({ queryKey: ["dashboard-render", id], queryFn: () => fetchRenderedDashboard(id), refetchInterval: 15000 });
  const { data: savedQueries } = useQuery({ queryKey: ["saved-queries"], queryFn: fetchSavedQueries });

  const addPanel = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/dashboards/${id}/panels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedQueryId: selectedQuery, title: panelTitle || "Untitled panel", w: 6, h: 3 }),
      });
      if (!res.ok) throw new Error("failed to add panel");
      return res.json();
    },
    onSuccess: () => {
      setAddOpen(false);
      setSelectedQuery("");
      setPanelTitle("");
      queryClient.invalidateQueries({ queryKey: ["dashboard-render", id] });
    },
  });

  const removePanel = useMutation({
    mutationFn: async (panelId: string) => {
      await fetch(`/api/dashboards/${id}/panels/${panelId}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-render", id] }),
  });

  return (
    <Layout title={data?.dashboard.name ?? "Dashboard"}>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => setAddOpen((o) => !o)} className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-text">
          + add panel
        </button>
      </div>

      {addOpen && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded border border-border bg-surface p-3">
          <select
            value={selectedQuery}
            onChange={(e) => setSelectedQuery(e.target.value)}
            className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none"
          >
            <option value="">Select a saved query…</option>
            {(savedQueries ?? []).map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
          <input
            value={panelTitle}
            onChange={(e) => setPanelTitle(e.target.value)}
            placeholder="Panel title (optional)"
            className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
          />
          <button
            onClick={() => addPanel.mutate()}
            disabled={!selectedQuery || addPanel.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
          >
            Add
          </button>
          {(!savedQueries || savedQueries.length === 0) && (
            <span className="text-xs text-faint">No saved queries yet — save one in Explorer first.</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(data?.panels ?? []).map((panel) => (
          <div key={panel.id} className="rounded border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{panel.title}</h3>
              <button onClick={() => removePanel.mutate(panel.id)} className="text-xs text-faint hover:text-crit">
                remove
              </button>
            </div>
            {panel.error && <p className="text-xs text-crit">{panel.error}</p>}
            {!panel.error && panel.result && <PanelChart chartType={panel.chartType} rows={panel.result.rows} />}
          </div>
        ))}
        {data && data.panels.length === 0 && <p className="text-sm text-faint">No panels yet — add one above.</p>}
      </div>
    </Layout>
  );
}

function PanelChart({ chartType, rows }: { chartType: string; rows: Record<string, string | number | boolean | null>[] }) {
  if (rows.length === 0) return <p className="text-xs text-faint">No data.</p>;

  if (chartType === "table") {
    const columns = Object.keys(rows[0]);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-faint">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-2 py-1 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((row, i) => (
              <tr key={i} className="border-t border-border-subtle text-muted">
                {columns.map((c) => (
                  <td key={c} className="px-2 py-1">
                    {String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const groupKey = Object.keys(rows[0]).find((k) => k !== "value" && k !== "bucket");
  const xKey = groupKey ?? "bucket";
  const data = rows.map((r) => ({ ...r, label: r[xKey] !== undefined ? String(r[xKey]) : "" }));

  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        {chartType === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: CHART_AXIS_COLOR, fontSize: 10 }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
            <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
            <Tooltip contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 11 }} />
            <Bar dataKey="value" fill="#e8622c" isAnimationActive={false} />
          </BarChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: CHART_AXIS_COLOR, fontSize: 10 }} axisLine={{ stroke: CHART_GRID_COLOR }} tickLine={false} />
            <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
            <Tooltip contentStyle={{ background: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 11 }} />
            <Line type="monotone" dataKey="value" stroke="#e8622c" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
