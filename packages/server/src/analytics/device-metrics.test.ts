import { describe, it, expect } from "vitest";
import { db } from "../db/client.js";
import { devices, dnsEvents } from "../db/schema.js";
import { macVendorHint, idleDevices, deviceQueryRatePercentileRank } from "./device-metrics.js";

function insertDevice(overrides: Partial<typeof devices.$inferInsert> & { deviceId: string }) {
  const now = new Date().toISOString();
  db.insert(devices)
    .values({
      mac: null,
      hostname: null,
      dhcpClientId: null,
      currentIp: null,
      firstSeen: now,
      lastSeen: now,
      isActive: true,
      flagged: false,
      flagReason: null,
      ...overrides,
    })
    .run();
}

function insertQueryEvent(clientId: string) {
  db.insert(dnsEvents)
    .values({
      timestamp: new Date().toISOString(),
      clientId,
      clientIp: "192.168.1.30",
      protocol: "UDP",
      domain: "rate-rank-test.example",
      registeredDomain: "rate-rank-test.example",
      queryType: "A",
      responseCode: "NOERROR",
      cached: false,
      blocked: false,
      recursive: true,
      responseTimeMs: 10,
    } as any)
    .run();
}

describe("macVendorHint", () => {
  it("returns a hint for a known OUI prefix", () => {
    const result = macVendorHint("3C:5A:B4:11:22:33");
    expect(result.vendorHint).toBe("Google (Nest/Chromecast)");
  });

  it("returns null for an unrecognized prefix, not an error", () => {
    const result = macVendorHint("00:00:00:11:22:33");
    expect(result.vendorHint).toBeNull();
    expect(result.note).toBeTruthy();
  });

  it("returns null with an explanatory note for a null MAC", () => {
    const result = macVendorHint(null);
    expect(result.vendorHint).toBeNull();
    expect(result.note).toContain("No MAC recorded");
  });

  it("is case-insensitive on the MAC prefix", () => {
    const upper = macVendorHint("3C:5A:B4:11:22:33");
    const lower = macVendorHint("3c:5a:b4:11:22:33");
    expect(upper.vendorHint).toBe(lower.vendorHint);
  });
});

describe("idleDevices", () => {
  it("flags a device whose lastSeen is older than the idle threshold", () => {
    const deviceId = "idle-test-device-old";
    insertDevice({ deviceId, hostname: "old-device", lastSeen: new Date(Date.now() - 10 * 3600_000).toISOString() });

    const result = idleDevices(6);
    expect(result.some((d) => d.deviceId === deviceId)).toBe(true);
  });

  it("does not flag a device seen recently", () => {
    const deviceId = "idle-test-device-fresh";
    insertDevice({ deviceId, hostname: "fresh-device", lastSeen: new Date().toISOString() });

    const result = idleDevices(6);
    expect(result.some((d) => d.deviceId === deviceId)).toBe(false);
  });

  it("does not flag an inactive device even if long stale", () => {
    const deviceId = "idle-test-device-inactive";
    insertDevice({ deviceId, hostname: "gone-device", lastSeen: new Date(Date.now() - 100 * 3600_000).toISOString(), isActive: false });

    const result = idleDevices(6);
    expect(result.some((d) => d.deviceId === deviceId)).toBe(false);
  });
});

describe("deviceQueryRatePercentileRank", () => {
  it("ranks a high-volume device above a low-volume one", () => {
    const loud = "rate-rank-test-loud";
    const quiet = "rate-rank-test-quiet";
    insertDevice({ deviceId: loud, hostname: "loud-device" });
    insertDevice({ deviceId: quiet, hostname: "quiet-device" });

    for (let i = 0; i < 50; i++) insertQueryEvent(loud);
    insertQueryEvent(quiet);

    const result = deviceQueryRatePercentileRank();
    const loudEntry = result.find((d) => d.deviceId === loud);
    const quietEntry = result.find((d) => d.deviceId === quiet);

    expect(loudEntry).toBeDefined();
    expect(quietEntry).toBeDefined();
    expect(loudEntry!.queries).toBeGreaterThan(quietEntry!.queries);
    expect(loudEntry!.percentileRank).toBeGreaterThan(quietEntry!.percentileRank);
  });
});
