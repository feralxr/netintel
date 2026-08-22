import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Layout } from "../components/Layout";
import { MetricCard } from "../components/MetricCard";
import { MetricExplain } from "../components/MetricExplain";
import { DonutChart } from "../components/charts/DonutChart";
import { DistributionBar } from "../components/charts/DistributionBar";
import { api, analytics, apiGet } from "../lib/api";

interface FragmentedDomain {
  registeredDomain: string;
  distinctSubdomainCount: number;
}

export function DomainsPage() {
  const [search, setSearch] = useState("");
  const { data: domains } = useQuery({
    queryKey: ["domains-full"],
    queryFn: () => api.domains(500),
    refetchInterval: 5000,
  });
  const { data: concentration } = useQuery({
    queryKey: ["concentration"],
    queryFn: analytics.concentration,
    refetchInterval: 10000,
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: analytics.categories,
    refetchInterval: 10000,
  });
  const { data: tracking } = useQuery({
    queryKey: ["tracking"],
    queryFn: analytics.tracking,
    refetchInterval: 10000,
  });
  const { data: fragmented } = useQuery({
    queryKey: ["fragmentation-top"],
    queryFn: () => apiGet<FragmentedDomain[]>("/domains/fragmentation/top"),
    refetchInterval: 30000,
  });

  const filtered = (domains ?? []).filter((d) => d.domain.includes(search.toLowerCase()));

  const categoryDonutData = (categories ?? []).slice(0, 8).map((c) => ({ name: c.category, value: c.queries }));

  const concentrationBarData = concentration
    ? [
        { name: "Top 1", value: concentration.top1Share * 100 },
        { name: "Top 5", value: concentration.top5Share * 100 },
        { name: "Top 10", value: concentration.top10Share * 100 },
        { name: "Top 50", value: concentration.top50Share * 100 },
      ]
    : [];

  const lifecycleBarData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of domains ?? []) {
      const state = d.lifecycleState ?? "unclassified";
      counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [domains]);

  const popularityBarData = useMemo(() => {
    return [...(domains ?? [])]
      .filter((d) => d.popularityScore !== null)
      .sort((a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0))
      .slice(0, 10)
      .map((d) => ({ name: d.domain, value: Number((d.popularityScore ?? 0).toFixed(3)) }));
  }, [domains]);

  const fragmentationBarData = useMemo(
    () => (fragmented ?? []).slice(0, 10).map((f) => ({ name: f.registeredDomain, value: f.distinctSubdomainCount })),
    [fragmented]
  );

  return (
    <Layout title="Domains">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="Top 10 domain share"
          value={concentration ? `${(concentration.top10Share * 100).toFixed(1)}%` : "–"}
          metricId="domain_concentration"
        />
        <MetricCard
          label="HHI (concentration)"
          value={concentration ? concentration.hhi.toFixed(3) : "–"}
          metricId="domain_concentration"
        />
        <MetricCard
          label="Tracker ratio"
          value={tracking ? `${(tracking.trackerRatio * 100).toFixed(1)}%` : "–"}
          metricId="tracking_footprint"
        />
        <MetricCard label="Unique trackers seen" value={tracking?.uniqueTrackers ?? "–"} metricId="tracking_footprint" />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <DonutChart title="Category breakdown" metricId="domain_categories" data={categoryDonutData} height={280} />
        <DistributionBar
          title="Domain concentration (top-N share)"
          metricId="domain_concentration"
          data={concentrationBarData}
          valueFormatter={(v) => `${v.toFixed(1)}%`}
          singleColor="#e8622c"
          height={280}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <DistributionBar title="Domains by lifecycle state" metricId="domain_lifecycle_classification" data={lifecycleBarData} height={260} />
        <DistributionBar
          title="Top domains by popularity score"
          metricId="domain_popularity_score"
          data={popularityBarData}
          singleColor="#4f9dde"
          height={260}
        />
      </div>

      <div className="mb-6">
        <DistributionBar
          title="Most fragmented domains (distinct subdomains)"
          metricId="subdomain_fragmentation"
          data={fragmentationBarData}
          singleColor="#9d6fd6"
          height={260}
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter domains…"
          className="w-64 rounded border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <span className="text-xs text-faint">{filtered.length} domains</span>
      </div>

      <div className="overflow-hidden rounded border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-4 py-2 font-medium">Domain</th>
              <th className="px-4 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  Queries <MetricExplain metricId="domain_statistics" />
                </span>
              </th>
              <th className="px-4 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  Popularity <MetricExplain metricId="domain_popularity_score" />
                </span>
              </th>
              <th className="px-4 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  Lifecycle <MetricExplain metricId="domain_lifecycle_classification" />
                </span>
              </th>
              <th className="px-4 py-2 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.domain} className="border-t border-border-subtle hover:bg-surface/50">
                <td className="px-4 py-2">
                  <Link to="/domains/$domain" params={{ domain: d.domain }} className="text-accent hover:underline">
                    {d.domain}
                  </Link>
                </td>
                <td className="px-4 py-2 text-muted">{d.queryCount}</td>
                <td className="px-4 py-2 text-muted">{d.popularityScore?.toFixed(2) ?? "–"}</td>
                <td className="px-4 py-2 text-faint">{d.lifecycleState ?? "unclassified"}</td>
                <td className="px-4 py-2 text-faint">{new Date(d.lastSeen).toLocaleTimeString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-faint">
                  No domains match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
