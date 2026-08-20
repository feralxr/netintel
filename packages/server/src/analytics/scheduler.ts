import { recomputeAllPopularityScores } from "./domain-metrics.js";
import { recomputeAllLifecycleStates } from "./lifecycle.js";
import { runAnomalyDetectionAndNotify } from "./anomaly.js";
import { rebuildDomainRelationships } from "./relationships.js";
import { runAllAlertPolicies } from "../alerting/policy-engine.js";
import { runAdvisor } from "../advisor/engine.js";
import { takeDailySnapshot } from "../capacity/snapshot.js";
import { runDueSchedules } from "../reports/scheduler.js";

/**
 * Popularity scores (#2), lifecycle states (#17), the domain relationship
 * graph (#42-45), anomaly detection (#30/#31), alert policies, and the
 * Advisor's correlation/trend narration all touch a meaningful slice of the
 * dataset, so they run periodically here rather than per request. Cheap
 * enough at v1 data volumes; revisit with incremental updates if the
 * dataset grows into the hundreds of thousands of rows.
 */
export function startAnalyticsScheduler(intervalMs = 60_000): () => void {
  const run = async () => {
    try {
      recomputeAllPopularityScores();
      recomputeAllLifecycleStates();
      runAnomalyDetectionAndNotify();
      rebuildDomainRelationships();
      await runAllAlertPolicies();
      runAdvisor();
      takeDailySnapshot();
      await runDueSchedules();
    } catch (err) {
      console.error("[analytics] scheduled recompute failed:", err);
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  return () => clearInterval(timer);
}
