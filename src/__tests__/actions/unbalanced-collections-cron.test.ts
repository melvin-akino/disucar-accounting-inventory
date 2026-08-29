/**
 * Tests for the /api/cron/unbalanced-collections route: secret-gating and
 * per-employee issuance idempotency.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/collections", () => ({ getUnbalancedCollections: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendUnbalancedCollectionEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from "@/lib/prisma";
import { getUnbalancedCollections } from "@/lib/collections";
import { sendUnbalancedCollectionEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";

function makeRequest(headers: Record<string, string> = {}) {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as any;
}

const flaggedEmployee = {
  employeeId: "emp-1", employeeName: "Juan", employeeEmail: "juan@disucarsales.ph",
  totalUnremitted: 500, count: 2, oldestCollectedAt: new Date("2026-01-01"),
};

describe("GET /api/cron/unbalanced-collections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    (prisma as any).auditLog = { findFirst: vi.fn().mockResolvedValue(null) };
    (prisma as any).user = { findMany: vi.fn().mockResolvedValue([{ email: "finance@disucarsales.ph" }]) };
    vi.mocked(getUnbalancedCollections).mockResolvedValue([flaggedEmployee]);
  });

  it("returns 401 without the correct secret header", async () => {
    const { GET } = await import("@/app/api/cron/unbalanced-collections/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(sendUnbalancedCollectionEmail).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong secret", async () => {
    const { GET } = await import("@/app/api/cron/unbalanced-collections/route");
    const res = await GET(makeRequest({ "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("issues an email and audit log for a flagged employee with the correct secret", async () => {
    const { GET } = await import("@/app/api/cron/unbalanced-collections/route");
    const res = await GET(makeRequest({ "x-cron-secret": "test-secret" }));
    expect(res.status).toBe(200);
    expect(sendUnbalancedCollectionEmail).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "collection.report_issued", entityId: "emp-1" })
    );
    const body = await res.json();
    expect(body).toEqual({ flagged: 1, issued: 1, skipped: 0 });
  });

  it("skips an employee already issued today (idempotent)", async () => {
    (prisma as any).auditLog.findFirst = vi.fn().mockResolvedValue({ id: "existing" });
    const { GET } = await import("@/app/api/cron/unbalanced-collections/route");
    const res = await GET(makeRequest({ "x-cron-secret": "test-secret" }));
    const body = await res.json();
    expect(body).toEqual({ flagged: 1, issued: 0, skipped: 1 });
    // Finance summary email still sends (there's still 1 flagged employee overall)
    expect(sendUnbalancedCollectionEmail).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/unbalanced-collections/route");
    const res = await GET(makeRequest({ "x-cron-secret": "anything" }));
    expect(res.status).toBe(401);
  });
});
