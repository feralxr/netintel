import { randomUUID } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { devices, deviceIpHistory, dhcpLeaseEvents } from "../db/schema.js";
import type { DhcpLease } from "./technitium-client.js";
import { emitNotification } from "../notifications/engine.js";

// Identity confidence scoring, per Bible section 5.
// Used to re-associate a device across IP/MAC/hostname changes rather than
// trusting IP alone (which changes constantly under DHCP).
const WEIGHTS = {
  mac: 50,
  dhcpClientId: 25,
  hostname: 15,
  ipContinuity: 10,
} as const;

const MERGE_THRESHOLD = 50; // >= this score => same device

export interface IdentitySignal {
  mac?: string | null;
  dhcpClientId?: string | null;
  hostname?: string | null;
  ip: string;
}

function scoreAgainst(existing: typeof devices.$inferSelect, signal: IdentitySignal): number {
  let score = 0;
  if (signal.mac && existing.mac && signal.mac === existing.mac) score += WEIGHTS.mac;
  if (signal.dhcpClientId && existing.dhcpClientId && signal.dhcpClientId === existing.dhcpClientId)
    score += WEIGHTS.dhcpClientId;
  if (signal.hostname && existing.hostname && signal.hostname === existing.hostname) score += WEIGHTS.hostname;
  if (signal.ip && existing.currentIp && signal.ip === existing.currentIp) score += WEIGHTS.ipContinuity;
  return score;
}

/**
 * Fast path for the query-log ingest pipeline: DHCP sync already establishes
 * devices with full MAC/hostname identity. For each incoming query, we just
 * need to find which *currently active* device owns this IP right now —
 * that's an exact lookup, not a fuzzy identity merge. The fuzzy scoring in
 * resolveDeviceId() is reserved for reconciling DHCP lease signals themselves
 * (Bible section 5), not for classifying every single DNS query.
 * Falls back to creating a placeholder device if no DHCP sync has run yet
 * for this IP (e.g. collector started mid-lease).
 */
export function resolveDeviceIdByIp(ip: string): string {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(devices)
    .where(and(eq(devices.isActive, true), eq(devices.currentIp, ip)))
    .get();

  if (existing) {
    db.update(devices).set({ lastSeen: now }).where(eq(devices.deviceId, existing.deviceId)).run();
    return existing.deviceId;
  }

  return resolveDeviceId({ ip });
}

/**
 * Resolves a stable device_id for an incoming signal, creating a new device
 * record if nothing matches above MERGE_THRESHOLD. v1 scope: only devices
 * currently considered active are returned/tracked (see Bible section 5).
 */
export function resolveDeviceId(signal: IdentitySignal): string {
  const now = new Date().toISOString();
  const candidates = db.select().from(devices).where(eq(devices.isActive, true)).all();

  let best: { device: typeof devices.$inferSelect; score: number } | null = null;
  for (const device of candidates) {
    const score = scoreAgainst(device, signal);
    if (score >= MERGE_THRESHOLD && (!best || score > best.score)) {
      best = { device, score };
    }
  }

  if (best) {
    const changedIp = signal.ip && best.device.currentIp !== signal.ip;
    db.update(devices)
      .set({
        lastSeen: now,
        currentIp: signal.ip ?? best.device.currentIp,
        mac: signal.mac ?? best.device.mac,
        hostname: signal.hostname ?? best.device.hostname,
        dhcpClientId: signal.dhcpClientId ?? best.device.dhcpClientId,
      })
      .where(eq(devices.deviceId, best.device.deviceId))
      .run();

    if (changedIp) {
      db.insert(deviceIpHistory)
        .values({ deviceId: best.device.deviceId, ip: signal.ip, start: now, end: null })
        .run();
    }
    return best.device.deviceId;
  }

  const deviceId = randomUUID();
  db.insert(devices)
    .values({
      deviceId,
      mac: signal.mac ?? null,
      hostname: signal.hostname ?? null,
      dhcpClientId: signal.dhcpClientId ?? null,
      currentIp: signal.ip,
      firstSeen: now,
      lastSeen: now,
      isActive: true,
    })
    .run();

  db.insert(deviceIpHistory).values({ deviceId, ip: signal.ip, start: now, end: null }).run();

  emitNotification({
    category: "network",
    severity: "info",
    title: "New device joined the network",
    explanation: `${signal.hostname ?? signal.mac ?? signal.ip} was seen on the LAN for the first time.`,
    link: `/devices/${deviceId}`,
  });

  return deviceId;
}

/** Latest recorded lease event for a MAC, if any (used by the diff below). */
function getLatestLeaseEvent(mac: string) {
  return db
    .select()
    .from(dhcpLeaseEvents)
    .where(eq(dhcpLeaseEvents.mac, mac))
    .orderBy(desc(dhcpLeaseEvents.recordedAt))
    .limit(1)
    .get();
}

/**
 * Diffs the incoming lease against the last recorded event for its MAC and
 * writes a dhcp_lease_events row only when something actually changed —
 * every poll (default 30s, see poller.ts) re-sends the same lease list, so
 * logging unconditionally would flood the table with no-op rows.
 * Feeds metrics #91-94 (lease churn, duration distribution, IP/identity
 * continuity, DHCP-to-DNS activity gap).
 */
function logLeaseEventIfChanged(lease: DhcpLease, now: string): void {
  const last = getLatestLeaseEvent(lease.hardwareAddress);

  let eventType: "new" | "renewed" | "ip_changed" | null = null;
  if (!last || last.eventType === "expired") {
    eventType = "new";
  } else if (last.ipAddress !== lease.ipAddress) {
    eventType = "ip_changed";
  } else if (last.leaseExpires !== lease.leaseExpires) {
    eventType = "renewed";
  }

  if (!eventType) return;

  db.insert(dhcpLeaseEvents)
    .values({
      mac: lease.hardwareAddress,
      clientIdentifier: lease.clientIdentifier,
      ipAddress: lease.ipAddress,
      hostName: lease.hostName,
      leaseObtained: lease.leaseObtained,
      leaseExpires: lease.leaseExpires,
      eventType,
      recordedAt: now,
    })
    .run();
}

/**
 * Marks leases as expired for any MAC we were previously tracking that is
 * absent from this poll's active list. Only fires once per lease (skips
 * MACs whose latest event is already "expired") so an offline device
 * doesn't generate a fresh expired row on every subsequent poll.
 */
function logExpiredLeases(activeMacs: Set<string>, now: string): void {
  const trackedMacs = db.selectDistinct({ mac: dhcpLeaseEvents.mac }).from(dhcpLeaseEvents).all();
  for (const { mac } of trackedMacs) {
    if (activeMacs.has(mac)) continue;
    const last = getLatestLeaseEvent(mac);
    if (last && last.eventType !== "expired") {
      db.insert(dhcpLeaseEvents)
        .values({
          mac,
          clientIdentifier: last.clientIdentifier,
          ipAddress: last.ipAddress,
          hostName: last.hostName,
          leaseObtained: last.leaseObtained,
          leaseExpires: last.leaseExpires,
          eventType: "expired",
          recordedAt: now,
        })
        .run();
    }
  }
}

/** Syncs device identity/liveness straight from DHCP leases (most reliable signal). */
export function syncFromDhcpLeases(leases: DhcpLease[]): void {
  const now = new Date().toISOString();
  const activeIps = new Set(leases.map((l) => l.ipAddress));
  const activeMacs = new Set(leases.map((l) => l.hardwareAddress));

  for (const lease of leases) {
    resolveDeviceId({
      mac: lease.hardwareAddress,
      dhcpClientId: lease.clientIdentifier,
      hostname: lease.hostName,
      ip: lease.ipAddress,
    });
    logLeaseEventIfChanged(lease, now);
  }

  logExpiredLeases(activeMacs, now);

  // Anything not in the current lease list is no longer live — v1 scope only
  // surfaces active devices, so we flip isActive rather than deleting history.
  const all = db.select().from(devices).where(eq(devices.isActive, true)).all();
  for (const device of all) {
    if (device.currentIp && !activeIps.has(device.currentIp)) {
      db.update(devices).set({ isActive: false, lastSeen: now }).where(eq(devices.deviceId, device.deviceId)).run();
    }
  }
}
