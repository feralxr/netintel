import fs from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db, dbPath } from "../db/client.js";
import { systemMetricsDaily, devices, dnsEvents } from "../db/schema.js";

/**
 * Available disk space on the volume holding the database.
 * fs.statfsSync is well-supported on Linux; its Windows behavior has NOT
 * been verified against a real Windows instance (the same category of gap
 * that caused real breakage with the Technitium API assumptions earlier) —
 * so this is wrapped defensively and reports null rather than guessing if
 * it throws or returns something unexpected.
 */
function availableDiskBytes(): number | null {
  try {
    const stats = fs.statfsSync(dbPath);
    return stats.bavail * stats.bsize;
  } catch {
    return null; // not available on this platform/Node version — reported honestly as "unknown", not faked
  }
}

/** Upserts today's snapshot row. Safe to call as often as the scheduler likes — always reflects the latest values for "today". */
export function takeDailySnapshot(): void {
  const date = new Date().toISOString().slice(0, 10);

  let dbSizeBytes = 0;
  try {
    dbSizeBytes = fs.statSync(dbPath).size;
  } catch {
    // db not created yet
  }

  const deviceCount = db.select({ c: sql<number>`count(*)` }).from(devices).where(eq(devices.isActive, true)).get()?.c ?? 0;
  const totalQueries = db.select({ c: sql<number>`count(*)` }).from(dnsEvents).get()?.c ?? 0;
  const availableDisk = availableDiskBytes();

  const existing = db.select().from(systemMetricsDaily).where(eq(systemMetricsDaily.date, date)).get();
  if (existing) {
    db.update(systemMetricsDaily)
      .set({ dbSizeBytes, deviceCount, totalQueries, availableDiskBytes: availableDisk })
      .where(eq(systemMetricsDaily.date, date))
      .run();
  } else {
    db.insert(systemMetricsDaily).values({ date, dbSizeBytes, deviceCount, totalQueries, availableDiskBytes: availableDisk }).run();
  }
}
