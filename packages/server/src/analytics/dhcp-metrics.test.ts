import { describe, it, expect } from "vitest";
import { db } from "../db/client.js";
import { dhcpLeaseEvents } from "../db/schema.js";
import { leaseChurn, ipReuseAndIdentityContinuity } from "./dhcp-metrics.js";

function insertLeaseEvent(overrides: Partial<typeof dhcpLeaseEvents.$inferInsert> & { mac: string; eventType: string }) {
  const now = new Date().toISOString();
  db.insert(dhcpLeaseEvents)
    .values({
      ipAddress: "192.168.1.99",
      hostName: null,
      clientIdentifier: null,
      leaseObtained: now,
      leaseExpires: now,
      recordedAt: now,
      ...overrides,
    })
    .run();
}

describe("leaseChurn", () => {
  it("today's bucket increases by exactly the events inserted for today", () => {
    const before = leaseChurn();
    const today = new Date().toISOString().slice(0, 10);
    const beforeToday = before.find((d) => d.date === today) ?? { date: today, new: 0, renewed: 0, ipChanged: 0, expired: 0 };

    insertLeaseEvent({ mac: "AA:AA:AA:00:00:01", eventType: "new" });
    insertLeaseEvent({ mac: "AA:AA:AA:00:00:02", eventType: "expired" });

    const after = leaseChurn();
    const afterToday = after.find((d) => d.date === today);

    expect(afterToday).toBeDefined();
    expect(afterToday!.new - beforeToday.new).toBe(1);
    expect(afterToday!.expired - beforeToday.expired).toBe(1);
  });
});

describe("ipReuseAndIdentityContinuity", () => {
  it("a mac's first 'new' event counts as genuinely new", () => {
    const mac = "BB:BB:BB:00:00:01";
    const before = ipReuseAndIdentityContinuity();
    insertLeaseEvent({ mac, eventType: "new" });
    const after = ipReuseAndIdentityContinuity();

    expect(after.genuinelyNewDevices - before.genuinelyNewDevices).toBe(1);
    expect(after.returningDevices - before.returningDevices).toBe(0);
  });

  it("a second 'new' event for the SAME mac counts as returning, not genuinely new again", () => {
    const mac = "BB:BB:BB:00:00:02";
    insertLeaseEvent({ mac, eventType: "new", recordedAt: new Date(Date.now() - 60_000).toISOString() });
    const before = ipReuseAndIdentityContinuity();

    insertLeaseEvent({ mac, eventType: "new", recordedAt: new Date().toISOString() });
    const after = ipReuseAndIdentityContinuity();

    expect(after.returningDevices - before.returningDevices).toBe(1);
    expect(after.genuinelyNewDevices - before.genuinelyNewDevices).toBe(0);
  });

  it("distinctMacsEverSeen counts a mac only once regardless of how many events it has", () => {
    const mac = "BB:BB:BB:00:00:03";
    const before = ipReuseAndIdentityContinuity();
    insertLeaseEvent({ mac, eventType: "new", recordedAt: new Date(Date.now() - 120_000).toISOString() });
    insertLeaseEvent({ mac, eventType: "renewed", recordedAt: new Date(Date.now() - 60_000).toISOString() });
    insertLeaseEvent({ mac, eventType: "expired", recordedAt: new Date().toISOString() });
    const after = ipReuseAndIdentityContinuity();

    expect(after.distinctMacsEverSeen - before.distinctMacsEverSeen).toBe(1);
  });
});
