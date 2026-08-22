import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { serverRestarts } from "../db/schema.js";

let currentRestartId: number | null = null;

/**
 * Logs the start of this process lifetime. Call once at boot, before the
 * shutdown handler can possibly fire. Feeds #99 (Process Uptime & Restart
 * History) — a row whose ended_at is still null when the *next* boot
 * happens means that prior process ended uncleanly (crash/kill), inferred
 * at query time rather than guessed here.
 */
export function recordServerStart(): void {
  const startedAt = new Date().toISOString();
  const result = db.insert(serverRestarts).values({ startedAt, cleanShutdown: false }).run();
  currentRestartId = Number(result.lastInsertRowid);
}

/** Marks the current process lifetime as having exited cleanly. */
export function recordServerStop(): void {
  if (currentRestartId === null) return;
  db.update(serverRestarts)
    .set({ endedAt: new Date().toISOString(), cleanShutdown: true })
    .where(eq(serverRestarts.id, currentRestartId))
    .run();
}

export interface RestartHistoryEntry {
  startedAt: string;
  endedAt: string | null;
  cleanShutdown: boolean;
  uptimeSeconds: number | null; // null while still running or if endedAt is missing (unclean exit)
}

/** Restart history for #99, most recent first. */
export function getRestartHistory(limit = 50): RestartHistoryEntry[] {
  const rows = db.select().from(serverRestarts).orderBy(desc(serverRestarts.id)).limit(limit).all();
  return rows.map((r) => ({
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    cleanShutdown: r.cleanShutdown,
    uptimeSeconds: r.endedAt
      ? (new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 1000
      : null,
  }));
}
