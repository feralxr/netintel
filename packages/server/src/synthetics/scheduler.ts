import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { syntheticTests, syntheticResults } from "../db/schema.js";
import { probe } from "./prober.js";
import { emitNotification } from "../notifications/engine.js";

const timers = new Map<string, NodeJS.Timeout>();
const lastFailureNotified = new Map<string, boolean>(); // testId -> was the previous result a failure? avoids re-notifying on every consecutive failure

async function runAndStore(test: typeof syntheticTests.$inferSelect): Promise<void> {
  const result = await probe(test.targetDomain, test.resolver);
  db.insert(syntheticResults)
    .values({
      testId: test.id,
      timestamp: new Date().toISOString(),
      success: result.success,
      responseTimeMs: result.responseTimeMs,
      resolvedIp: result.resolvedIp,
      errorMessage: result.errorMessage,
    })
    .run();

  const wasAlreadyFailing = lastFailureNotified.get(test.id) ?? false;
  if (!result.success && !wasAlreadyFailing) {
    emitNotification({
      category: "performance",
      severity: "warning",
      title: `Synthetic test failing: ${test.name}`,
      explanation: `Resolving ${test.targetDomain} via ${test.resolver} failed: ${result.errorMessage}`,
    });
  }
  lastFailureNotified.set(test.id, !result.success);
}

/** Clears all scheduled probes and reloads from the current DB state. Call after any synthetic_tests CRUD change. */
export function reloadSyntheticsScheduler(): void {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();

  const tests = db.select().from(syntheticTests).where(eq(syntheticTests.enabled, true)).all();
  for (const test of tests) {
    void runAndStore(test); // fire once immediately so there's data right away, not just after the first interval
    const timer = setInterval(() => void runAndStore(test), Math.max(5, test.intervalSeconds) * 1000);
    timers.set(test.id, timer);
  }
}

export function stopSyntheticsScheduler(): void {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
}
