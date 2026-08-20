import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { alertPolicies, alertEvents } from "../db/schema.js";
import { runQuery, type QueryDefinition } from "../explorer/query-engine.js";
import { emitNotification } from "../notifications/engine.js";
import { executeAction, type ActionDefinition } from "./actions.js";
import { dispatchToChannels } from "./dispatch.js";
import { randomUUID } from "node:crypto";

export type ComparisonOperator = "gt" | "lt" | "gte" | "lte" | "eq" | "ne";

export interface AlertCondition {
  query: Omit<QueryDefinition, "timeRange">; // timeRange is computed from windowMinutes at evaluation time
  windowMinutes: number;
  comparison: { operator: ComparisonOperator; threshold: number };
}

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

export function evaluateCondition(condition: AlertCondition): ConditionResult {
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

    const shortestWindowMinutes = Math.min(...definition.conditions.map((c) => c.windowMinutes), 60);
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
