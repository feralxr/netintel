import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "../components/Layout";

interface AlertPolicy {
  id: string;
  name: string;
  enabled: boolean;
  severity: string;
  channels: string;
  action: string;
  lastEvaluatedAt: string | null;
  lastTriggeredAt: string | null;
}

interface AlertEvent {
  id: string;
  policyId: string;
  timestamp: string;
  explanation: string;
  acknowledged: boolean;
}

interface SnapshotMetric {
  id: string;
  label: string;
  group: string;
  unit: string;
}

const EXPLORER_METRICS = ["count", "uniqueDomains", "uniqueClients", "avgResponseTime", "blockedCount", "nxdomainCount"];
const OPERATORS = ["gt", "lt", "gte", "lte", "eq", "ne"];

async function fetchPolicies(): Promise<AlertPolicy[]> {
  const res = await fetch("/api/alerts/policies");
  if (!res.ok) throw new Error("failed to load policies");
  return res.json();
}

async function fetchEvents(): Promise<AlertEvent[]> {
  const res = await fetch("/api/alerts/events");
  if (!res.ok) throw new Error("failed to load events");
  return res.json();
}

async function fetchSnapshotMetrics(): Promise<SnapshotMetric[]> {
  const res = await fetch("/api/alerts/snapshot-metrics");
  if (!res.ok) throw new Error("failed to load snapshot metrics");
  return res.json();
}

export function AlertsPage() {
  const queryClient = useQueryClient();
  const { data: policies } = useQuery({ queryKey: ["alert-policies"], queryFn: fetchPolicies, refetchInterval: 15000 });
  const { data: events } = useQuery({ queryKey: ["alert-events"], queryFn: fetchEvents, refetchInterval: 15000 });
  const { data: snapshotMetrics } = useQuery({ queryKey: ["alert-snapshot-metrics"], queryFn: fetchSnapshotMetrics });

  const [name, setName] = useState("");
  const [source, setSource] = useState<"explorer" | "metric_snapshot">("explorer");
  const [metric, setMetric] = useState(EXPLORER_METRICS[0]);
  const [snapshotMetricId, setSnapshotMetricId] = useState("");
  const [operator, setOperator] = useState(OPERATORS[0]);
  const [threshold, setThreshold] = useState("0");
  const [windowMinutes, setWindowMinutes] = useState("60");
  const [severity, setSeverity] = useState("warning");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [emailTo, setEmailTo] = useState("");

  const activeSnapshotMetric = snapshotMetrics?.find((m) => m.id === snapshotMetricId);

  const createPolicy = useMutation({
    mutationFn: async () => {
      const channels = ["in_app"];
      if (webhookUrl) channels.push(`webhook:${webhookUrl}`);
      if (emailTo) channels.push(`email:${emailTo}`);

      const condition =
        source === "explorer"
          ? {
              source: "explorer",
              query: { metric },
              windowMinutes: Number(windowMinutes),
              comparison: { operator, threshold: Number(threshold) },
            }
          : {
              source: "metric_snapshot",
              metricId: snapshotMetricId,
              windowMinutes: Number(windowMinutes), // cooldown only — the read itself is always "right now"
              comparison: { operator, threshold: Number(threshold) },
            };

      const res = await fetch("/api/alerts/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          severity,
          channels,
          definition: { logic: "AND", conditions: [condition] },
        }),
      });
      if (!res.ok) throw new Error("failed to create policy");
      return res.json();
    },
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["alert-policies"] });
    },
  });

  const togglePolicy = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await fetch(`/api/alerts/policies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alert-policies"] }),
  });

  const deletePolicy = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/alerts/policies/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alert-policies"] }),
  });

  const acknowledgeEvent = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/alerts/events/${id}/acknowledge`, { method: "POST" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alert-events"] }),
  });

  return (
    <Layout title="Alerts">
      <div className="mb-6 rounded border border-border bg-surface p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">New policy</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Policy name"
              className="w-48 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Metric source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as "explorer" | "metric_snapshot")}
              className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none"
            >
              <option value="explorer">DNS traffic (Explorer)</option>
              <option value="metric_snapshot">System / security metric</option>
            </select>
          </div>
          {source === "explorer" ? (
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Metric</label>
              <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none">
                {EXPLORER_METRICS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Metric</label>
              <select
                value={snapshotMetricId}
                onChange={(e) => setSnapshotMetricId(e.target.value)}
                className="w-64 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none"
              >
                <option value="">Select a metric…</option>
                {(snapshotMetrics ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.group}] {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Operator</label>
            <select value={operator} onChange={(e) => setOperator(e.target.value)} className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none">
              {OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">
              Threshold{activeSnapshotMetric?.unit ? ` (${activeSnapshotMetric.unit})` : ""}
            </label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-24 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">
              {source === "explorer" ? "Window (min)" : "Cooldown (min)"}
            </label>
            <input
              type="number"
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(e.target.value)}
              className="w-20 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none">
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="critical">critical</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Webhook URL (optional)</label>
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://…"
              className="w-56 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Email (optional)</label>
            <input
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="you@example.com"
              className="w-56 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <button
            onClick={() => createPolicy.mutate()}
            disabled={!name || createPolicy.isPending || (source === "metric_snapshot" && !snapshotMetricId)}
            className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
          >
            Create policy
          </button>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted">Policies</h2>
      <div className="mb-6 overflow-hidden rounded border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Enabled</th>
              <th className="px-4 py-2 font-medium">Last evaluated</th>
              <th className="px-4 py-2 font-medium">Last triggered</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(policies ?? []).map((p) => (
              <tr key={p.id} className="border-t border-border-subtle">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2 text-muted">{p.severity}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => togglePolicy.mutate({ id: p.id, enabled: !p.enabled })}
                    className={p.enabled ? "text-ok" : "text-faint"}
                  >
                    {p.enabled ? "enabled" : "disabled"}
                  </button>
                </td>
                <td className="px-4 py-2 text-faint">{p.lastEvaluatedAt ? new Date(p.lastEvaluatedAt).toLocaleTimeString() : "–"}</td>
                <td className="px-4 py-2 text-faint">{p.lastTriggeredAt ? new Date(p.lastTriggeredAt).toLocaleTimeString() : "never"}</td>
                <td className="px-4 py-2">
                  <button onClick={() => deletePolicy.mutate(p.id)} className="text-xs text-faint hover:text-crit">
                    delete
                  </button>
                </td>
              </tr>
            ))}
            {(!policies || policies.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-faint">
                  No alert policies yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted">Recent alert events</h2>
      <div className="flex flex-col gap-2">
        {(events ?? []).map((e) => (
          <div key={e.id} className="flex items-start justify-between rounded border border-border bg-surface p-3">
            <div>
              <p className="text-sm text-text">{e.explanation}</p>
              <p className="mt-1 text-xs text-faint">{new Date(e.timestamp).toLocaleString()}</p>
            </div>
            {!e.acknowledged && (
              <button onClick={() => acknowledgeEvent.mutate(e.id)} className="text-xs text-accent hover:underline">
                acknowledge
              </button>
            )}
            {e.acknowledged && <span className="text-xs text-faint">acknowledged</span>}
          </div>
        ))}
        {(!events || events.length === 0) && <p className="text-xs text-faint">No alert events yet.</p>}
      </div>
    </Layout>
  );
}
