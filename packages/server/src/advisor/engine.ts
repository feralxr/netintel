import { desc, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { notifications, insights } from "../db/schema.js";
import { emitNotification } from "../notifications/engine.js";
import { internetActivityTrends } from "../analytics/trends.js";
import { categoryBreakdown } from "../analytics/categories-tracking.js";

const CORRELATION_WINDOW_MS = 5 * 60_000; // notifications within 5 min of each other are considered "the same incident"
const already_narrated = new Set<string>(); // cluster fingerprint -> narrated, avoids re-narrating the same cluster every scheduler tick

interface NotificationRow {
  id: string;
  category: string;
  severity: string;
  timestamp: string;
  title: string;
}

/**
 * Groups recent notifications into time-clustered "incidents" — consecutive
 * notifications where each one lands within CORRELATION_WINDOW_MS of the
 * previous one in the same cluster. This is Kentik's "root cause analysis"
 * pattern (correlate an anomaly with related signals) done with a simple,
 * honest template rather than an ML model or LLM, per the v2 decision to
 * keep Advisor template-based.
 */
function clusterByTime(rows: NotificationRow[]): NotificationRow[][] {
  const sorted = [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const clusters: NotificationRow[][] = [];
  let current: NotificationRow[] = [];

  for (const row of sorted) {
    if (current.length === 0) {
      current = [row];
      continue;
    }
    const last = current[current.length - 1];
    const gap = new Date(row.timestamp).getTime() - new Date(last.timestamp).getTime();
    if (gap <= CORRELATION_WINDOW_MS) {
      current.push(row);
    } else {
      clusters.push(current);
      current = [row];
    }
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

function clusterFingerprint(cluster: NotificationRow[]): string {
  return cluster.map((n) => n.id).join(",");
}

function narrateCluster(cluster: NotificationRow[]): string {
  const categories = [...new Set(cluster.map((n) => n.category))];
  const titles = cluster.map((n) => n.title);
  const span = Math.round(
    (new Date(cluster[cluster.length - 1].timestamp).getTime() - new Date(cluster[0].timestamp).getTime()) / 1000
  );

  if (categories.length === 1) {
    return `${cluster.length} related "${categories[0]}" events happened within ${span}s of each other: ${titles.join("; ")}.`;
  }
  return `${cluster.length} events across ${categories.join(", ")} happened within ${span}s of each other, possibly related: ${titles.join("; ")}.`;
}

/** Correlates recent multi-signal notification clusters into one narrated insight, per cluster, once. */
export function correlateRecentNotifications(lookbackMinutes = 30): void {
  const since = new Date(Date.now() - lookbackMinutes * 60_000).toISOString();
  const rows = db
    .select({
      id: notifications.id,
      category: notifications.category,
      severity: notifications.severity,
      timestamp: notifications.timestamp,
      title: notifications.title,
    })
    .from(notifications)
    .where(gte(notifications.timestamp, since))
    .orderBy(desc(notifications.timestamp))
    .all()
    // Exclude Advisor's own output (category "insights") from its own input
    // — without this, each narrated cluster becomes a new notification that
    // gets pulled into the *next* correlation pass, snowballing the cluster
    // forever. Found via live verification, not a hypothetical.
    .filter((n) => n.category !== "insights");

  const clusters = clusterByTime(rows).filter((c) => c.length >= 2); // a cluster of 1 isn't a correlation, it's just a notification

  for (const cluster of clusters) {
    // Only narrate clusters that just finished forming (most recent member
    // within the last ~90s, roughly one scheduler tick). This makes "narrate
    // once" fall out naturally from time itself rather than needing durable
    // dedup state — an old cluster simply ages out of eligibility, so a
    // server restart can't cause it to be re-narrated the way pure in-memory
    // dedup would risk.
    const mostRecent = new Date(cluster[cluster.length - 1].timestamp).getTime();
    if (Date.now() - mostRecent > 90_000) continue;

    const fingerprint = clusterFingerprint(cluster);
    if (already_narrated.has(fingerprint)) continue;
    already_narrated.add(fingerprint);

    const explanation = narrateCluster(cluster);
    const highestSeverity = cluster.some((n) => n.severity === "critical")
      ? "critical"
      : cluster.some((n) => n.severity === "warning")
        ? "warning"
        : "info";

    db.insert(insights).values({ timestamp: new Date().toISOString(), type: "correlated_incident", score: cluster.length, explanation }).run();
    emitNotification({
      category: "insights",
      severity: highestSeverity as "info" | "warning" | "critical",
      title: "Advisor: correlated events detected",
      explanation,
      metricId: "personal_internet_fingerprint",
    });
  }
}

const lastTrendNarration = new Map<string, string>(); // category -> last narrated direction bucket, avoids repeating the same week-over-week story every tick

/** Flags a standout week-over-week volume shift as a narrated trend insight. */
export function narrateStandoutTrends(): void {
  const trends = internetActivityTrends();
  if (!trends.lastWeek.queries || trends.lastWeek.queries < 20) return; // not enough history for a meaningful week-over-week story

  const deltaPct = trends.queriesMoMPercent;
  if (Math.abs(deltaPct) < 25) return; // not a standout move

  const bucket = deltaPct > 0 ? "up" : "down";
  if (lastTrendNarration.get("overall") === bucket) return; // already narrated this direction, don't repeat every tick
  lastTrendNarration.set("overall", bucket);

  const breakdown = categoryBreakdown();
  const topCategory = breakdown[0];
  const explanation = `Overall query volume is ${bucket} ${Math.abs(deltaPct).toFixed(0)}% vs. last week (${trends.thisWeek.queries} vs ${trends.lastWeek.queries} queries).${
    topCategory ? ` Most active category right now: ${topCategory.category} (${(topCategory.share * 100).toFixed(0)}% of traffic).` : ""
  }`;

  db.insert(insights).values({ timestamp: new Date().toISOString(), type: "internet_activity_trends", score: deltaPct, explanation }).run();
  emitNotification({
    category: "insights",
    severity: "info",
    title: `Advisor: notable ${bucket === "up" ? "increase" : "decrease"} in activity this week`,
    explanation,
    metricId: "internet_activity_trends",
  });
}

export function runAdvisor(): void {
  correlateRecentNotifications();
  narrateStandoutTrends();
}
