import { db } from "../db/client.js";
import { devices, domainRelationships, domains } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { computeSessions, type Session } from "./time-behavior.js";

function allActiveSessions(): Session[] {
  const activeDevices = db.select().from(devices).where(eq(devices.isActive, true)).all();
  const sessions: Session[] = [];
  for (const device of activeDevices) {
    sessions.push(...computeSessions(device.deviceId));
  }
  return sessions;
}

// -----------------------------------------------------------------------
// Metric #42 — Domain Correlation:  P(B|A) = Sessions(A,B) / Sessions(A)
// Metric #43 — Domain Clusters: connected components over strong pairs
// -----------------------------------------------------------------------
export function rebuildDomainRelationships(): void {
  const sessions = allActiveSessions();

  const sessionsContaining = new Map<string, number>();
  const cooccurrence = new Map<string, number>(); // key: "a|b" with a<b lexically

  for (const s of sessions) {
    const uniqueDomains = [...new Set(s.domainSequence)];
    for (const d of uniqueDomains) sessionsContaining.set(d, (sessionsContaining.get(d) ?? 0) + 1);

    for (let i = 0; i < uniqueDomains.length; i++) {
      for (let j = i + 1; j < uniqueDomains.length; j++) {
        const [a, b] = [uniqueDomains[i], uniqueDomains[j]].sort();
        const key = `${a}|${b}`;
        cooccurrence.set(key, (cooccurrence.get(key) ?? 0) + 1);
      }
    }
  }

  db.delete(domainRelationships).run();
  for (const [key, count] of cooccurrence.entries()) {
    const [a, b] = key.split("|");
    const sessionsA = sessionsContaining.get(a) ?? 0;
    const conditionalProbability = sessionsA > 0 ? count / sessionsA : 0;
    db.insert(domainRelationships)
      .values({ domainA: a, domainB: b, cooccurrence: count, conditionalProbability })
      .run();
  }
}

export function domainCorrelations(domain: string, limit = 10) {
  const rows = db.select().from(domainRelationships).all();
  return rows
    .filter((r) => r.domainA === domain || r.domainB === domain)
    .map((r) => ({
      relatedDomain: r.domainA === domain ? r.domainB : r.domainA,
      cooccurrence: r.cooccurrence,
      conditionalProbability: r.conditionalProbability,
    }))
    .sort((a, b) => b.cooccurrence - a.cooccurrence)
    .slice(0, limit);
}

/** Metric #43: connected components over relationship pairs above a co-occurrence threshold. */
export function domainClusters(minCooccurrence = 2) {
  const rows = db.select().from(domainRelationships).all().filter((r) => r.cooccurrence >= minCooccurrence);

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const r of rows) union(r.domainA, r.domainB);

  const clusters = new Map<string, Set<string>>();
  for (const domain of parent.keys()) {
    const root = find(domain);
    if (!clusters.has(root)) clusters.set(root, new Set());
    clusters.get(root)!.add(domain);
  }

  return [...clusters.values()]
    .filter((c) => c.size >= 2)
    .map((c) => [...c])
    .sort((a, b) => b.length - a.length);
}

// -----------------------------------------------------------------------
// v2 — Relationship Map data: nodes + weighted edges + cluster assignment,
// shaped for a force-directed graph visualization (Kentik Map-inspired).
// -----------------------------------------------------------------------
export interface GraphNode {
  id: string;
  clusterId: number; // -1 = not in any multi-domain cluster
  queryCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number; // cooccurrence count
  strength: number; // conditionalProbability, 0-1
}

export interface RelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function relationshipGraph(minCooccurrence = 2, maxEdges = 300): RelationshipGraph {
  const relRows = db
    .select()
    .from(domainRelationships)
    .all()
    .filter((r) => r.cooccurrence >= minCooccurrence)
    .sort((a, b) => b.cooccurrence - a.cooccurrence)
    .slice(0, maxEdges);

  const clusters = domainClusters(minCooccurrence);
  const clusterOf = new Map<string, number>();
  clusters.forEach((cluster, idx) => cluster.forEach((domain) => clusterOf.set(domain, idx)));

  const involvedDomains = new Set<string>();
  for (const r of relRows) {
    involvedDomains.add(r.domainA);
    involvedDomains.add(r.domainB);
  }

  const queryCounts = new Map(
    db
      .select({ domain: domains.domain, queryCount: domains.queryCount })
      .from(domains)
      .all()
      .map((d) => [d.domain, d.queryCount])
  );

  const nodes: GraphNode[] = [...involvedDomains].map((domain) => ({
    id: domain,
    clusterId: clusterOf.get(domain) ?? -1,
    queryCount: queryCounts.get(domain) ?? 0,
  }));

  const edges: GraphEdge[] = relRows.map((r) => ({
    source: r.domainA,
    target: r.domainB,
    weight: r.cooccurrence,
    strength: r.conditionalProbability ?? 0,
  }));

  return { nodes, edges };
}

// -----------------------------------------------------------------------
// Metrics #44/#45 — Domain Transition Analysis & Predictive DNS
//   Bigram transition probabilities from chronological in-session domain
//   sequences: P(B|A) = count(A -> B) / count(A -> *)
// -----------------------------------------------------------------------
export function transitionMatrix(): Map<string, Map<string, number>> {
  const sessions = allActiveSessions();
  const matrix = new Map<string, Map<string, number>>();

  for (const s of sessions) {
    for (let i = 0; i < s.domainSequence.length - 1; i++) {
      const from = s.domainSequence[i];
      const to = s.domainSequence[i + 1];
      if (from === to) continue; // skip immediate repeats, not a real "transition"
      if (!matrix.has(from)) matrix.set(from, new Map());
      const toMap = matrix.get(from)!;
      toMap.set(to, (toMap.get(to) ?? 0) + 1);
    }
  }
  return matrix;
}

export function predictNextDomains(domain: string, limit = 5) {
  const matrix = transitionMatrix();
  const toMap = matrix.get(domain);
  if (!toMap) return [];

  const total = [...toMap.values()].reduce((a, b) => a + b, 0);
  return [...toMap.entries()]
    .map(([to, count]) => ({ domain: to, probability: total > 0 ? count / total : 0, observedTransitions: count }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, limit);
}
