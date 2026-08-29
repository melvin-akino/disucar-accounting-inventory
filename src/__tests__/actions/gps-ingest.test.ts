/**
 * Tests for the /api/gps/ingest webhook and the underlying ingestGpsPings logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { prisma } from "@/lib/prisma";
import { ingestGpsPings } from "@/lib/gps";

function makeRequest(headers: Record<string, string> = {}, body?: unknown) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  } as any;
}

const vehicle = { id: "veh-1", externalDeviceId: "TRK-001" };

describe("ingestGpsPings", () => {
  let txCalls: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma as any).vehicle = {
      findUnique: vi.fn().mockResolvedValue(vehicle),
      update: vi.fn().mockResolvedValue({}),
    };
    (prisma as any).vehiclePosition = { create: vi.fn().mockResolvedValue({}) };
    txCalls = [];
    (prisma as any).$transaction = vi.fn().mockImplementation((ops: any[]) => { txCalls.push(ops); return Promise.all(ops); });
  });

  it("accepts a known device and records a position", async () => {
    const result = await ingestGpsPings([{ deviceId: "TRK-001", lat: 14.5995, lng: 120.9842 }]);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toHaveLength(0);
    expect((prisma as any).vehiclePosition.create).toHaveBeenCalledOnce();
    expect((prisma as any).vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "veh-1" }, data: expect.objectContaining({ lastLat: 14.5995, lastLng: 120.9842 }) })
    );
  });

  it("rejects an unknown device without throwing", async () => {
    (prisma as any).vehicle.findUnique = vi.fn().mockResolvedValue(null);
    const result = await ingestGpsPings([{ deviceId: "UNKNOWN", lat: 14.6, lng: 121.0 }]);
    expect(result.accepted).toBe(0);
    expect(result.rejected).toEqual([{ deviceId: "UNKNOWN", reason: expect.stringContaining("Unknown device") }]);
  });

  it("processes a batch of pings, mixing known and unknown devices", async () => {
    (prisma as any).vehicle.findUnique = vi.fn()
      .mockResolvedValueOnce(vehicle)
      .mockResolvedValueOnce(null);
    const result = await ingestGpsPings([
      { deviceId: "TRK-001", lat: 14.6, lng: 121.0 },
      { deviceId: "TRK-999", lat: 14.7, lng: 121.1 },
    ]);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toHaveLength(1);
  });
});

describe("POST /api/gps/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GPS_WEBHOOK_SECRET = "test-secret";
    (prisma as any).vehicle = { findUnique: vi.fn().mockResolvedValue(vehicle), update: vi.fn().mockResolvedValue({}) };
    (prisma as any).vehiclePosition = { create: vi.fn().mockResolvedValue({}) };
    (prisma as any).$transaction = vi.fn().mockImplementation((ops: any[]) => Promise.all(ops));
  });

  it("returns 401 without the correct secret header", async () => {
    const { POST } = await import("@/app/api/gps/ingest/route");
    const res = await POST(makeRequest({}, { deviceId: "TRK-001", lat: 1, lng: 1 }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when GPS_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.GPS_WEBHOOK_SECRET;
    const { POST } = await import("@/app/api/gps/ingest/route");
    const res = await POST(makeRequest({ "x-gps-secret": "anything" }, { deviceId: "TRK-001", lat: 1, lng: 1 }));
    expect(res.status).toBe(401);
  });

  it("rejects an out-of-range lat/lng with 400", async () => {
    const { POST } = await import("@/app/api/gps/ingest/route");
    const res = await POST(makeRequest({ "x-gps-secret": "test-secret" }, { deviceId: "TRK-001", lat: 999, lng: 1 }));
    expect(res.status).toBe(400);
  });

  it("accepts a single ping object", async () => {
    const { POST } = await import("@/app/api/gps/ingest/route");
    const res = await POST(makeRequest({ "x-gps-secret": "test-secret" }, { deviceId: "TRK-001", lat: 14.6, lng: 121.0 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(1);
  });

  it("accepts a batch array of pings", async () => {
    const { POST } = await import("@/app/api/gps/ingest/route");
    const res = await POST(makeRequest({ "x-gps-secret": "test-secret" }, [
      { deviceId: "TRK-001", lat: 14.6, lng: 121.0 },
      { deviceId: "TRK-001", lat: 14.61, lng: 121.01 },
    ]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(2);
  });
});
