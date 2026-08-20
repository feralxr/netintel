import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { devices } from "../db/schema.js";
import { emitNotification } from "../notifications/engine.js";

export type ActionType = "none" | "flag_device" | "block_domain";

export interface ActionDefinition {
  type: ActionType;
  params?: {
    deviceId?: string; // for flag_device: which device to flag
    domain?: string; // for block_domain: which domain to block
  };
}

/**
 * Flags a device in the local database — fully local, fully real, no
 * external dependency. Surfaced in the dashboard/CLI as a review candidate.
 */
function executeFlagDevice(deviceId: string, reason: string): { success: boolean; message: string } {
  const device = db.select().from(devices).where(eq(devices.deviceId, deviceId)).get();
  if (!device) return { success: false, message: `device ${deviceId} not found` };

  db.update(devices).set({ flagged: true, flagReason: reason }).where(eq(devices.deviceId, deviceId)).run();
  return { success: true, message: `flagged device ${device.hostname ?? deviceId}: ${reason}` };
}

/**
 * Adds a domain to Technitium's local block list.
 *
 * HONESTY NOTE (same pattern as the collector's earlier corrections): this
 * endpoint path is Technitium's commonly-documented v13+ convention for the
 * built-in block list, but has NOT been confirmed against a live instance
 * the way /api/logs/query was. Confirm the exact path/params against your
 * own instance's API docs (Technitium web UI -> Help -> API docs) before
 * relying on this in production. If it's wrong, this action fails loudly
 * (the notification below reports success/failure honestly) rather than
 * silently pretending to have blocked something it didn't.
 */
async function executeBlockDomain(domain: string): Promise<{ success: boolean; message: string }> {
  const baseUrl = process.env.NETINTEL_TECHNITIUM_URL;
  const token = process.env.NETINTEL_TECHNITIUM_TOKEN;
  if (!baseUrl || !token) return { success: false, message: "Technitium not configured" };

  try {
    const url = new URL("/api/blocking/blocked/add", baseUrl);
    url.searchParams.set("token", token);
    url.searchParams.set("domain", domain);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url.toString(), { signal: controller.signal }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      return { success: false, message: `Technitium returned ${res.status} — verify the block-list endpoint against your instance's API docs` };
    }
    return { success: true, message: `added ${domain} to Technitium's block list` };
  } catch (err) {
    return { success: false, message: `request failed: ${(err as Error).message} — verify the block-list endpoint against your instance's API docs` };
  }
}

/** Executes a policy's configured action after it triggers. Always notifies the outcome, success or failure — never fails silently. */
export async function executeAction(action: ActionDefinition, policyName: string): Promise<void> {
  if (action.type === "none") return;

  let result: { success: boolean; message: string };

  if (action.type === "flag_device") {
    if (!action.params?.deviceId) {
      result = { success: false, message: "flag_device action has no deviceId configured" };
    } else {
      result = executeFlagDevice(action.params.deviceId, `auto-flagged by alert policy "${policyName}"`);
    }
  } else if (action.type === "block_domain") {
    if (!action.params?.domain) {
      result = { success: false, message: "block_domain action has no domain configured" };
    } else {
      result = await executeBlockDomain(action.params.domain);
    }
  } else {
    result = { success: false, message: "unknown action type" };
  }

  emitNotification({
    category: "system",
    severity: result.success ? "info" : "warning",
    title: `Auto-response ${result.success ? "executed" : "failed"}: ${policyName}`,
    explanation: result.message,
  });
}
