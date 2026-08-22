import { db } from "../db/client.js";
import { dhcpLeaseEvents, dnsEvents, devices } from "../db/schema.js";
import { asc, eq } from "drizzle-orm";

// -----------------------------------------------------------------------
// Metric #91 — Lease Churn
//   New vs. expired vs. renewed leases per day — a proxy for device
//   turnover (guests arriving/leaving, IoT reconnects, reboots).
// -----------------------------------------------------------------------
export function leaseChurn() {
  const rows = db.select().from(dhcpLeaseEvents).orderBy(asc(dhcpLeaseEvents.recordedAt)).all();
  const byDay = new Map<string, { new: number; renewed: number; ipChanged: number; expired: number }>();

  for (const r of rows) {
    const day = r.recordedAt.slice(0, 10);
    const bucket = byDay.get(day) ?? { new: 0, renewed: 0, ipChanged: 0, expired: 0 };
    if (r.eventType === "new") bucket.new++;
    else if (r.eventType === "renewed") bucket.renewed++;
    else if (r.eventType === "ip_changed") bucket.ipChanged++;
    else if (r.eventType === "expired") bucket.expired++;
    byDay.set(day, bucket);
  }

  return [...byDay.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// -----------------------------------------------------------------------
// Metric #92 — Lease Duration Distribution
//   How long devices typically hold a lease before renewal/expiry/departure
//   — computed from the gap between successive lease events for the same
//   MAC (new -> renewed/ip_changed/expired, and onward).
// -----------------------------------------------------------------------
export function leaseDurationDistribution() {
  const rows = db.select().from(dhcpLeaseEvents).orderBy(asc(dhcpLeaseEvents.recordedAt)).all();
  const byMac = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byMac.has(r.mac)) byMac.set(r.mac, []);
    byMac.get(r.mac)!.push(r);
  }

  const durationsHours: number[] = [];
  for (const events of byMac.values()) {
    for (let i = 1; i < events.length; i++) {
      const start = new Date(events[i - 1].recordedAt).getTime();
      const end = new Date(events[i].recordedAt).getTime();
      durationsHours.push((end - start) / 3600_000);
    }
  }

  if (durationsHours.length === 0) {
    return { hasData: false, note: "Not enough lease event history yet to compute a duration distribution.", distribution: null };
  }

  const sorted = [...durationsHours].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    hasData: true,
    note: null,
    sampleSize: sorted.length,
    avgHours: mean,
    medianHours: sorted[Math.floor(sorted.length / 2)],
    minHours: sorted[0],
    maxHours: sorted[sorted.length - 1],
  };
}

// -----------------------------------------------------------------------
// Metric #93 — IP Reuse & Identity Continuity
//   How often a "new"-looking lease is actually a returning MAC (identity
//   continuity) vs. genuinely new hardware never seen before.
// -----------------------------------------------------------------------
export function ipReuseAndIdentityContinuity() {
  const rows = db.select().from(dhcpLeaseEvents).orderBy(asc(dhcpLeaseEvents.recordedAt)).all();
  const seenMacs = new Set<string>();
  let genuinelyNew = 0;
  let returning = 0;

  for (const r of rows) {
    if (r.eventType !== "new") continue;
    if (seenMacs.has(r.mac)) returning++;
    else genuinelyNew++;
    seenMacs.add(r.mac);
  }

  const total = genuinelyNew + returning;
  return {
    genuinelyNewDevices: genuinelyNew,
    returningDevices: returning,
    returningShare: total > 0 ? returning / total : 0,
    distinctMacsEverSeen: seenMacs.size,
  };
}

// -----------------------------------------------------------------------
// Metric #94 — DHCP-to-DNS Activity Gap
//   Time between a device receiving a lease and its first DNS query after
//   that lease — flags devices that hold a lease but rarely/never resolve
//   anything (silent / local-only devices, e.g. a printer never queried).
// -----------------------------------------------------------------------
export function dhcpToDnsActivityGap(limit = 20) {
  const newLeases = db.select().from(dhcpLeaseEvents).all().filter((r) => r.eventType === "new");

  const results = newLeases.map((lease) => {
    const device = db.select().from(devices).where(eq(devices.mac, lease.mac)).get();

    const firstQuery = device
      ? db
          .select({ timestamp: dnsEvents.timestamp })
          .from(dnsEvents)
          .where(eq(dnsEvents.clientId, device.deviceId))
          .orderBy(asc(dnsEvents.timestamp))
          .limit(1)
          .get()
      : null;

    const gapMinutes =
      firstQuery && new Date(firstQuery.timestamp).getTime() >= new Date(lease.leaseObtained).getTime()
        ? (new Date(firstQuery.timestamp).getTime() - new Date(lease.leaseObtained).getTime()) / 60_000
        : null;

    return {
      mac: lease.mac,
      ipAddress: lease.ipAddress,
      leaseObtained: lease.leaseObtained,
      firstDnsQuery: firstQuery?.timestamp ?? null,
      gapMinutes,
    };
  });

  return results.filter((r) => r.gapMinutes !== null).sort((a, b) => (b.gapMinutes ?? 0) - (a.gapMinutes ?? 0)).slice(0, limit);
}
