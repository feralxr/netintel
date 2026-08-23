import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { alertPolicies, alertEvents } from "../db/schema.js";
import { runQuery, type QueryDefinition } from "../explorer/query-engine.js";
import { emitNotification } from "../notifications/engine.js";
import { executeAction, type ActionDefinition } from "./actions.js";
import { dispatchToChannels } from "./dispatch.js";
import { ALERTABLE_METRICS_BY_ID } from "./metric-snapshots.js";
import { randomUUID } from "node:crypto";

export type ComparisonOperator = "gt" | "lt" | "gte" | "lte" | "eq" | "ne";

interface Comparison {
  operator: ComparisonOperator;
  threshold: number;
}

/**
 * "explorer" conditions (the original and default) query dns_events via the
 * Explorer's generic metric vocabulary over a rolling time window.
 * "metric_snapshot" conditions (v2.13) read one of a curated set of
 * point-in-time metrics from tables/computed values the Explorer can't
 * reach — DHCP lease events, host health samples, capacity forecasts,
 * security candidate-signal counts (see metric-snapshots.ts). `source` is
 * optional and defaults to "explorer" so existing stored policies (created
 * before this type existed, with no `source` field at all) keep working
 * unchanged.
 */
export type AlertCondition =
  | {
      source?: "explorer";
      query: Omit<QueryDefinition, "timeRange">; // timeRange is computed from windowMinutes at evaluation time
      windowMinutes: number;
      comparison: Comparison;
    }
  | {
      source: "metric_snapshot";
      metricId: string;
      windowMinutes?: number; // used only for the trigger cooldown, not for the read itself (which is always "right now")
      comparison: Comparison;
    };

export interface AlertPolicyDefinition {
  logic: "AND" | "OR";
  conditions: AlertCondition[];
}

interface ConditionResult {
  breached: boolean;
  value: number | null;
  explanation: string;
}

function compare(value: number, op: ComparisonOperator, threshold: number): boolean {
  switch (op) {
    case "gt":
      return value > threshold;
    case "lt":
      return value < threshold;
    case "gte":
      return value >= threshold;
    case "lte":
      return value <= threshold;
    case "eq":
      return value === threshold;
    case "ne":
      return value !== threshold;
  }
}

function opSymbol(op: ComparisonOperator): string {
  return { gt: ">", lt: "<", gte: ">=", lte: "<=", eq: "==", ne: "!=" }[op];
}

function evaluateExplorerCondition(condition: Extract<AlertCondition, { source?: "explorer" }>): ConditionResult {
  const to = new Date();
  const from = new Date(to.getTime() - condition.windowMinutes * 60_000);

  const def: QueryDefinition = { ...condition.query, timeRange: { from: from.toISOString(), to: to.toISOString() } };
  const result = runQuery(def);

  // No groupBy -> single aggregate row. With groupBy -> alert if ANY group breaches (matches Kentik's per-entity alerting pattern).
  const rowsToCheck = result.rows.length > 0 ? result.rows : [{ value: 0 }];
  for (const row of rowsToCheck) {
    const value = typeof row.value === "number" ? row.value : 0;
    if (compare(value, condition.comparison.operator, condition.comparison.threshold)) {
      return {
        breached: true,
        value,
        explanation: `${condition.query.metric} = ${value.toFixed(2)} ${opSymbol(condition.comparison.operator)} ${condition.comparison.threshold} over the last ${condition.windowMinutes}min`,
      };
    }
  }
  return { breached: false, value: null, explanation: "no breach" };
}

function evaluateMetricSnapshotCondition(condition: Extract<AlertCondition, { source: "metric_snapshot" }>): ConditionResult {
  const metric = ALERTABLE_METRICS_BY_ID.get(condition.metricId);
  if (!metric) {
    return { breached: false, value: null, explanation: `unknown metric_snapshot id "${condition.metricId}"` };
  }

  const value = metric.compute();
  if (value === null) {
    return { breached: false, value: null, explanation: `${metric.label} is not currently available` };
  }

  if (compare(value, condition.comparison.operator, condition.comparison.threshold)) {
    return {
      breached: true,
      value,
      explanation: `${metric.label} = ${value.toFixed(2)}${metric.unit} ${opSymbol(condition.comparison.operator)} ${condition.comparison.threshold}${metric.unit}`,
    };
  }
  return { breached: false, value: null, explanation: "no breach" };
}

export function evaluateCondition(condition: AlertCondition): ConditionResult {
  return condition.source === "metric_snapshot" ? evaluateMetricSnapshotCondition(condition) : evaluateExplorerCondition(condition);
}

export function evaluatePolicy(definition: AlertPolicyDefinition): { triggered: boolean; explanation: string; value: number | null } {
  const results = definition.conditions.map(evaluateCondition);
  const triggered = definition.logic === "AND" ? results.every((r) => r.breached) : results.some((r) => r.breached);
  const breachedExplanations = results.filter((r) => r.breached).map((r) => r.explanation);

  return {
    triggered,
    explanation: breachedExplanations.length > 0 ? breachedExplanations.join(definition.logic === "AND" ? " AND " : " OR ") : "no conditions breached",
    value: results.find((r) => r.breached)?.value ?? null,
  };
}

/** Runs every enabled policy. Cooldown = the policy's own window, so a still-breaching condition doesn't re-notify every scheduler tick. */
export async function runAllAlertPolicies(): Promise<void> {
  const policies = db.select().from(alertPolicies).where(eq(alertPolicies.enabled, true)).all();
  const now = new Date();

  for (const policy of policies) {
    let definition: AlertPolicyDefinition;
    try {
      definition = JSON.parse(policy.definition);
    } catch {
      continue; // malformed policy definition, skip rather than crash the whole scheduler
    }

    const shortestWindowMinutes = Math.min(...definition.conditions.map((c) => c.windowMinutes ?? 15), 60);
    if (policy.lastTriggeredAt) {
      const cooldownMs = shortestWindowMinutes * 60_000;
      if (now.getTime() - new Date(policy.lastTriggeredAt).getTime() < cooldownMs) {
        db.update(alertPolicies).set({ lastEvaluatedAt: now.toISOString() }).where(eq(alertPolicies.id, policy.id)).run();
        continue;
      }
    }

    const { triggered, explanation, value } = evaluatePolicy(definition);
    db.update(alertPolicies).set({ lastEvaluatedAt: now.toISOString() }).where(eq(alertPolicies.id, policy.id)).run();

    if (triggered) {
      db.update(alertPolicies).set({ lastTriggeredAt: now.toISOString() }).where(eq(alertPolicies.id, policy.id)).run();
      db.insert(alertEvents)
        .values({ id: randomUUID(), policyId: policy.id, timestamp: now.toISOString(), triggeredValue: value, explanation, acknowledged: false })
        .run();

      const channels: string[] = JSON.parse(policy.channels || "[]");
      if (channels.length === 0 || channels.includes("in_app")) {
        emitNotification({
          category: "insights",
          severity: policy.severity as "info" | "warning" | "critical",
          title: `Alert policy triggered: ${policy.name}`,
          explanation,
        });
      }

      // Dispatch to any configured webhook:/email: channels, then report the
      // outcome of each honestly as its own notification — success or failure.
      const dispatchTargets = channels.filter((ch) => ch.startsWith("webhook:") || ch.startsWith("email:"));
      if (dispatchTargets.length > 0) {
        const outcomes = await dispatchToChannels(dispatchTargets, {
          policyName: policy.name,
          severity: policy.severity,
          explanation,
          timestamp: now.toISOString(),
        });
        for (const outcome of outcomes) {
          if (!outcome.success) {
            emitNotification({
              category: "system",
              severity: "warning",
              title: `Alert dispatch failed: ${policy.name}`,
              explanation: `${outcome.channel} — ${outcome.message}`,
            });
          }
        }
      }

      // v2.6 — Auto-Response Actions: opt-in per policy, defaults to "none".
      try {
        const action: ActionDefinition = JSON.parse(policy.action || '{"type":"none"}');
        await executeAction(action, policy.name);
      } catch {
        // malformed action definition — don't let it break alert delivery, which already succeeded above
      }
    }
  }
}
