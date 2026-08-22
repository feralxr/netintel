import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum } from "d3-force";
import { Layout } from "../components/Layout";
import { MetricExplain } from "../components/MetricExplain";
import { MetricCard } from "../components/MetricCard";
import { DataTable } from "../components/DataTable";
import { relationshipGraph, type RelationshipGraph, api, apiGet } from "../lib/api";

interface SimNode extends SimulationNodeDatum {
  id: string;
  clusterId: number;
  queryCount: number;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  weight: number;
  strength: number;
}

const CLUSTER_COLORS = ["#e8622c", "#3ba3e8", "#3be87a", "#e83b8f", "#e8c93b", "#8f3be8", "#3be8d1"];

function clusterColor(clusterId: number): string {
  if (clusterId < 0) return "#5a5a60"; // faint gray for domains not in any multi-domain cluster
  return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
}

interface SessionOverlap {
  maxConcurrentDevices: number;
  overlapWindowCount: number;
  note: string;
}
interface SequenceFingerprint {
  sequence: string;
  occurrences: number;
}
interface DwellEngagement {
  clientId: string;
  candidates: { registeredDomainSample: string; sessionStart: string; repeatQueries: number }[];
  note: string;
}
interface AutomationClassifier {
  clientId: string;
  automationScore?: number;
  avgPeriodicity?: number;
  avgSessionDiversity?: number;
  classification: "likely_automated" | "likely_human" | "mixed" | "unknown";
  note: string;
}

export function RelationshipMapPage() {
  const { data, isLoading } = useQuery({ queryKey: ["relationship-graph"], queryFn: relationshipGraph, refetchInterval: 30000 });
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);

  const { data: sessionOverlap } = useQuery({ queryKey: ["session-overlap"], queryFn: () => apiGet<SessionOverlap>("/behavioral/session-overlap"), refetchInterval: 30000 });
  const { data: sequenceFingerprints } = useQuery({
    queryKey: ["sequence-fingerprints"],
    queryFn: () => apiGet<SequenceFingerprint[]>("/behavioral/sequence-fingerprints"),
    refetchInterval: 60000,
  });
  const { data: devices } = useQuery({ queryKey: ["devices"], queryFn: api.devices });
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const { data: engagement } = useQuery({
    queryKey: ["dwell-engagement", selectedDevice],
    queryFn: () => apiGet<DwellEngagement>(`/behavioral/engagement/${selectedDevice}`),
    enabled: !!selectedDevice,
  });
  const { data: automationClass } = useQuery({
    queryKey: ["automation-classifier", selectedDevice],
    queryFn: () => apiGet<AutomationClassifier>(`/behavioral/automation-classifier/${selectedDevice}`),
    enabled: !!selectedDevice,
  });

  const width = 900;
  const height = 560;

  useEffect(() => {
    if (!data || data.nodes.length === 0) return;

    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = data.edges.map((e) => ({ ...e }));

    const simulation = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => 140 - l.strength * 80) // stronger relationships pull nodes closer together
          .strength((l) => 0.1 + l.strength * 0.4)
      )
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(28))
      .stop();

    // Run synchronously to a stable layout rather than animating every
    // frame into React state (much cheaper, and the graph doesn't need to
    // visibly "settle" for this use case).
    simulation.tick(300);

    const next = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      next.set(n.id, { x: n.x ?? width / 2, y: n.y ?? height / 2 });
    }
    setPositions(next);
    simRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [data]);

  const edgesWithPositions = (data?.edges ?? [])
    .map((e) => {
      const from = positions.get(typeof e.source === "string" ? e.source : (e.source as { id: string }).id);
      const to = positions.get(typeof e.target === "string" ? e.target : (e.target as { id: string }).id);
      if (!from || !to) return null;
      return { ...e, from, to };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const maxQueryCount = Math.max(1, ...(data?.nodes ?? []).map((n) => n.queryCount));

  return (
    <Layout title="Relationship Map">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-faint">
          Domains that appear together in the same browsing session, clustered and weighted by co-occurrence.
          <MetricExplain metricId="domain_correlation" />
        </p>
        <span className="text-xs text-faint">
          {data ? `${data.nodes.length} domains · ${data.edges.length} relationships` : ""}
        </span>
      </div>

      <div className="overflow-hidden rounded border border-border bg-surface">
        {isLoading && <div className="flex h-[560px] items-center justify-center text-sm text-faint">Loading…</div>}

        {!isLoading && (!data || data.nodes.length === 0) && (
          <div className="flex h-[560px] flex-col items-center justify-center gap-2 text-sm text-faint">
            <p>No domain relationships yet.</p>
            <p className="text-xs">
              This builds up as real browsing sessions accumulate — domains that appear together within a session
              (30-minute inactivity gap) become connected here.
            </p>
          </div>
        )}

        {data && data.nodes.length > 0 && (
          <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="select-none">
            {edgesWithPositions.map((e, i) => {
              const sourceId = typeof e.source === "string" ? e.source : (e.source as { id: string }).id;
              const targetId = typeof e.target === "string" ? e.target : (e.target as { id: string }).id;
              const dimmed = selectedNode && sourceId !== selectedNode && targetId !== selectedNode;
              return (
                <line
                  key={i}
                  x1={e.from.x}
                  y1={e.from.y}
                  x2={e.to.x}
                  y2={e.to.y}
                  stroke="#e8622c"
                  strokeOpacity={dimmed ? 0.05 : 0.15 + e.strength * 0.4}
                  strokeWidth={0.5 + e.strength * 2}
                />
              );
            })}
            {data.nodes.map((n) => {
              const pos = positions.get(n.id);
              if (!pos) return null;
              const radius = 6 + (n.queryCount / maxQueryCount) * 14;
              const dimmed = selectedNode && selectedNode !== n.id && !edgesWithPositions.some((e) => {
                const sourceId = typeof e.source === "string" ? e.source : (e.source as { id: string }).id;
                const targetId = typeof e.target === "string" ? e.target : (e.target as { id: string }).id;
                return selectedNode === sourceId || selectedNode === targetId ? sourceId === n.id || targetId === n.id : false;
              });
              return (
                <g
                  key={n.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onMouseEnter={() => setHoveredNode(n.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => setSelectedNode(selectedNode === n.id ? null : n.id)}
                  className="cursor-pointer"
                >
                  <circle r={radius} fill={clusterColor(n.clusterId)} fillOpacity={dimmed ? 0.25 : 0.85} stroke="#0a0a0b" strokeWidth={1.5} />
                  {(hoveredNode === n.id || selectedNode === n.id) && (
                    <text y={-radius - 6} textAnchor="middle" fontSize={11} fill="#e8e6e2" className="font-mono">
                      {n.id}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {selectedNode && (
        <div className="mt-4 rounded border border-border bg-surface p-4 text-sm">
          <p className="mb-2 font-semibold text-text">{selectedNode}</p>
          <div className="flex flex-col gap-1">
            {edgesWithPositions
              .filter((e) => {
                const sourceId = typeof e.source === "string" ? e.source : (e.source as { id: string }).id;
                const targetId = typeof e.target === "string" ? e.target : (e.target as { id: string }).id;
                return sourceId === selectedNode || targetId === selectedNode;
              })
              .sort((a, b) => b.strength - a.strength)
              .map((e, i) => {
                const sourceId = typeof e.source === "string" ? e.source : (e.source as { id: string }).id;
                const targetId = typeof e.target === "string" ? e.target : (e.target as { id: string }).id;
                const other = sourceId === selectedNode ? targetId : sourceId;
                return (
                  <div key={i} className="flex items-center justify-between text-xs text-muted">
                    <span>{other}</span>
                    <span>
                      seen together {e.weight}x · {(e.strength * 100).toFixed(0)}% correlation
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <h2 className="mb-3 mt-8 flex items-center gap-1.5 text-sm font-semibold text-muted">
        Behavioral patterns <MetricExplain metricId="multi_device_session_overlap" />
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Max concurrent devices" value={sessionOverlap?.maxConcurrentDevices ?? "–"} />
        <MetricCard label="Overlap windows" value={sessionOverlap?.overlapWindowCount ?? "–"} />
      </div>

      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
        Recurring domain sequences <MetricExplain metricId="domain_sequence_fingerprint" />
      </h2>
      <div className="mb-6">
        <DataTable
          rows={sequenceFingerprints}
          columns={[{ key: "sequence", label: "Sequence" }, { key: "occurrences", label: "Occurrences" }]}
          emptyMessage="No recurring sequences found yet."
        />
      </div>

      <div className="mb-3 flex items-center gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted">
          Per-device engagement & automation classifier <MetricExplain metricId="automation_vs_human_pattern_classifier" />
        </h2>
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
        >
          <option value="">Select a device…</option>
          {(devices ?? []).map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.hostname ?? d.deviceId}
            </option>
          ))}
        </select>
      </div>
      {selectedDevice && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded border border-border bg-surface p-4 text-sm">
            <p className="mb-2 text-xs text-faint">Classification</p>
            <p className="text-lg text-text">{automationClass?.classification ?? "…"}</p>
            {automationClass?.automationScore !== undefined && (
              <p className="mt-1 text-xs text-faint">automation score: {automationClass.automationScore.toFixed(2)}</p>
            )}
            {automationClass?.note && <p className="mt-2 text-xs text-faint">{automationClass.note}</p>}
          </div>
          <div>
            <p className="mb-2 text-xs text-faint">{engagement?.note}</p>
            <DataTable
              rows={engagement?.candidates.map((c) => ({ domain: c.registeredDomainSample, repeatQueries: c.repeatQueries }))}
              columns={[{ key: "domain", label: "Domain" }, { key: "repeatQueries", label: "Repeat queries" }]}
              emptyMessage="No engagement candidates for this device yet."
            />
          </div>
        </div>
      )}
    </Layout>
  );
}
