import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "../components/Layout";

interface SyntheticTest {
  id: string;
  name: string;
  targetDomain: string;
  resolver: string;
  intervalSeconds: number;
  enabled: boolean;
}

interface TestSummary {
  totalProbes: number;
  successCount: number;
  failureCount: number;
  uptimePercent: number | null;
  latency: { mean: number; p95: number } | null;
}

async function fetchTests(): Promise<SyntheticTest[]> {
  const res = await fetch("/api/synthetics/tests");
  if (!res.ok) throw new Error("failed to load tests");
  return res.json();
}

async function fetchSummary(id: string): Promise<TestSummary> {
  const res = await fetch(`/api/synthetics/tests/${id}/summary?hours=24`);
  if (!res.ok) throw new Error("failed to load summary");
  return res.json();
}

const RESOLVERS = ["technitium", "cloudflare", "google", "quad9"];

export function SyntheticsPage() {
  const queryClient = useQueryClient();
  const { data: tests } = useQuery({ queryKey: ["synthetic-tests"], queryFn: fetchTests, refetchInterval: 10000 });

  const [name, setName] = useState("");
  const [targetDomain, setTargetDomain] = useState("");
  const [resolver, setResolver] = useState(RESOLVERS[0]);
  const [intervalSeconds, setIntervalSeconds] = useState("60");

  const createTest = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/synthetics/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, targetDomain, resolver, intervalSeconds: Number(intervalSeconds) }),
      });
      if (!res.ok) throw new Error("failed to create test");
      return res.json();
    },
    onSuccess: () => {
      setName("");
      setTargetDomain("");
      queryClient.invalidateQueries({ queryKey: ["synthetic-tests"] });
    },
  });

  const toggleTest = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await fetch(`/api/synthetics/tests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["synthetic-tests"] }),
  });

  const deleteTest = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/synthetics/tests/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["synthetic-tests"] }),
  });

  return (
    <Layout title="Synthetics">
      <p className="mb-4 text-xs text-faint">
        Active scheduled DNS probes — real network resolution against a chosen resolver, independent of passive
        traffic. "technitium" resolves against your configured Technitium instance's DNS port.
      </p>

      <div className="mb-6 rounded border border-border bg-surface p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">New test</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Test name"
              className="w-40 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Target domain</label>
            <input
              value={targetDomain}
              onChange={(e) => setTargetDomain(e.target.value)}
              placeholder="example.com"
              className="w-40 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Resolver</label>
            <select value={resolver} onChange={(e) => setResolver(e.target.value)} className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none">
              {RESOLVERS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-faint">Interval (sec)</label>
            <input
              type="number"
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(e.target.value)}
              className="w-24 rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <button
            onClick={() => createTest.mutate()}
            disabled={!name || !targetDomain || createTest.isPending}
            className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
          >
            Create test
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(tests ?? []).map((t) => (
          <TestCard key={t.id} test={t} onToggle={() => toggleTest.mutate({ id: t.id, enabled: !t.enabled })} onDelete={() => deleteTest.mutate(t.id)} />
        ))}
        {(!tests || tests.length === 0) && <p className="text-sm text-faint">No synthetic tests yet.</p>}
      </div>
    </Layout>
  );
}

function TestCard({ test, onToggle, onDelete }: { test: SyntheticTest; onToggle: () => void; onDelete: () => void }) {
  const { data: summary } = useQuery({ queryKey: ["synthetic-summary", test.id], queryFn: () => fetchSummary(test.id), refetchInterval: 15000 });

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">{test.name}</h3>
        <div className="flex items-center gap-3">
          <button onClick={onToggle} className={test.enabled ? "text-xs text-ok" : "text-xs text-faint"}>
            {test.enabled ? "enabled" : "disabled"}
          </button>
          <button onClick={onDelete} className="text-xs text-faint hover:text-crit">
            delete
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-faint">
        {test.targetDomain} via {test.resolver} · every {test.intervalSeconds}s
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-faint">Uptime (24h)</p>
          <p className="text-lg font-semibold text-text">
            {summary?.uptimePercent != null ? `${summary.uptimePercent.toFixed(1)}%` : "–"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-faint">Avg latency</p>
          <p className="text-lg font-semibold text-text">{summary?.latency ? `${summary.latency.mean.toFixed(1)}ms` : "–"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-faint">Probes</p>
          <p className="text-lg font-semibold text-text">{summary?.totalProbes ?? "–"}</p>
        </div>
      </div>
    </div>
  );
}
