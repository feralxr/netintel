import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Layout } from "../components/Layout";

interface Dashboard {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

async function fetchDashboards(): Promise<Dashboard[]> {
  const res = await fetch("/api/dashboards");
  if (!res.ok) throw new Error("failed to load dashboards");
  return res.json();
}

export function DashboardsPage() {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const { data: dashboards } = useQuery({ queryKey: ["dashboards"], queryFn: fetchDashboards });

  const createDashboard = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("failed to create dashboard");
      return res.json();
    },
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });

  const deleteDashboard = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboards"] }),
  });

  return (
    <Layout title="Dashboards">
      <div className="mb-6 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New dashboard name…"
          className="w-64 rounded border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
        />
        <button
          onClick={() => createDashboard.mutate()}
          disabled={!name || createDashboard.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-50"
        >
          Create
        </button>
      </div>

      <p className="mb-4 text-xs text-faint">
        Build panels from saved queries — save a query in{" "}
        <Link to="/explorer" className="text-accent hover:underline">
          Explorer
        </Link>{" "}
        first, then pin it here.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(dashboards ?? []).map((d) => (
          <div key={d.id} className="rounded border border-border bg-surface p-4">
            <Link to="/dashboards/$id" params={{ id: d.id }} className="text-sm font-medium text-text hover:text-accent">
              {d.name}
            </Link>
            <p className="mt-1 text-xs text-faint">Updated {new Date(d.updatedAt).toLocaleString()}</p>
            <button onClick={() => deleteDashboard.mutate(d.id)} className="mt-2 text-xs text-faint hover:text-crit">
              delete
            </button>
          </div>
        ))}
        {(!dashboards || dashboards.length === 0) && <p className="text-sm text-faint">No dashboards yet.</p>}
      </div>
    </Layout>
  );
}
