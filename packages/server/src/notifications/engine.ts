import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { notifications } from "../db/schema.js";
import { broadcast } from "../api/ws.js";
import type { NotificationCategory, NotificationSeverity } from "@netintel/shared";

export function emitNotification(params: {
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  explanation: string;
  metricId?: string;
  link?: string;
}): void {
  const row = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    read: false,
    ...params,
  };
  db.insert(notifications).values(row).run();
  broadcast({ type: "notification", payload: row });
}
