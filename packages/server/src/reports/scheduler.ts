import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, dbPath } from "../db/client.js";
import { reportSchedules, generatedReports } from "../db/schema.js";
import { weeklyReport } from "../analytics/reporting.js";
import { serialize, buildPdfBuffer } from "../export/exporter.js";
import { dispatchEmail } from "../alerting/dispatch.js";

function reportsDir(): string {
  const dir = path.join(path.dirname(dbPath), "reports");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Pure decision function — given a schedule and "now", is this schedule due
 * to run? Split out from the I/O so it can be unit-verified directly against
 * many (schedule, now) combinations without needing real elapsed time.
 */
export function isDue(schedule: typeof reportSchedules.$inferSelect, now: Date): boolean {
  if (!schedule.enabled) return false;

  const nowHour = now.getUTCHours();
  const nowDay = now.getUTCDay();
  const todayDate = now.toISOString().slice(0, 10);

  if (schedule.lastGeneratedAt) {
    const lastDate = schedule.lastGeneratedAt.slice(0, 10);
    if (schedule.frequency === "daily" && lastDate === todayDate) return false;
    if (schedule.frequency === "weekly") {
      const daysSinceLast = (now.getTime() - new Date(schedule.lastGeneratedAt).getTime()) / 86_400_000;
      if (daysSinceLast < 6) return false;
    }
  }

  if (nowHour !== schedule.hourUtc) return false;
  if (schedule.frequency === "weekly" && nowDay !== (schedule.dayOfWeekUtc ?? 1)) return false;

  return true;
}

async function generateAndStore(schedule: typeof reportSchedules.$inferSelect): Promise<void> {
  const payload = weeklyReport();
  const { body, contentType } = serialize(payload, schedule.format === "html" ? "html" : "json");

  let fileBuffer: Buffer;
  let ext: string;
  if (schedule.format === "pdf") {
    fileBuffer = await buildPdfBuffer(payload);
    ext = "pdf";
  } else {
    fileBuffer = Buffer.from(body, "utf-8");
    ext = contentType.includes("html") ? "html" : "json";
  }

  const filename = `${schedule.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${Date.now()}.${ext}`;
  const filePath = path.join(reportsDir(), filename);
  fs.writeFileSync(filePath, fileBuffer);

  const now = new Date().toISOString();
  db.insert(generatedReports)
    .values({ id: randomUUID(), scheduleId: schedule.id, generatedAt: now, format: schedule.format, filePath, fileSizeBytes: fileBuffer.length })
    .run();
  db.update(reportSchedules).set({ lastGeneratedAt: now }).where(eq(reportSchedules.id, schedule.id)).run();

  if (schedule.emailTo) {
    await dispatchEmail(schedule.emailTo, {
      policyName: `Scheduled report: ${schedule.name}`,
      severity: "info",
      explanation: `Your ${schedule.frequency} report "${schedule.name}" has been generated (${(fileBuffer.length / 1024).toFixed(1)} KB, ${schedule.format}). Find it in netintel's reports directory or via the API.`,
      timestamp: now,
    });
  }
}

export async function runDueSchedules(): Promise<void> {
  const schedules = db.select().from(reportSchedules).where(eq(reportSchedules.enabled, true)).all();
  const now = new Date();

  for (const schedule of schedules) {
    if (isDue(schedule, now)) {
      try {
        await generateAndStore(schedule);
      } catch (err) {
        console.error(`[reports] failed to generate scheduled report "${schedule.name}":`, err);
      }
    }
  }
}
