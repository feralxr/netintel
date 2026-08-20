import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { domains } from "../db/schema.js";
import type { DomainLifecycleState } from "@netintel/shared";

const DAY_MS = 86_400_000;

/**
 * Metric #17 — Domain Lifecycle Classification.
 * Simple v1 rule set operating on (firstSeen, lastSeen, queryCount,
 * uniqueDays) — enough to be useful without needing a full time-series
 * model. Revisit with a proper trend-shape classifier in a later version.
 */
export function classifyLifecycle(d: typeof domains.$inferSelect): DomainLifecycleState {
  const now = Date.now();
  const first = new Date(d.firstSeen).getTime();
  const last = new Date(d.lastSeen).getTime();
  const ageDays = (now - first) / DAY_MS;
  const daysSinceLastSeen = (now - last) / DAY_MS;

  if (d.queryCount === 1 && ageDays > 3) return "one_time";
  if (ageDays <= 1) return "new";
  if (ageDays <= 7 && d.uniqueDays >= 2) return "emerging";
  if (daysSinceLastSeen > 30) return "disappeared";
  if (daysSinceLastSeen > 7) return "dormant";
  if (ageDays > 30 && daysSinceLastSeen <= 7 && d.uniqueDays >= ageDays * 0.3) return "regular";
  if (daysSinceLastSeen <= 3 && ageDays > 14) return "returning";
  return "regular";
}

export function recomputeAllLifecycleStates(): void {
  const all = db.select().from(domains).all();
  for (const d of all) {
    const state = classifyLifecycle(d);
    db.update(domains).set({ lifecycleState: state }).where(eq(domains.domain, d.domain)).run();
  }
}
