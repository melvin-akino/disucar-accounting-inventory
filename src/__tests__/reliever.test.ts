/**
 * Tests for the reliever-grant helper (item 11).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { prisma } from "@/lib/prisma";
import { hasActiveReliefGrant } from "@/lib/reliever";

describe("hasActiveReliefGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when an active matching grant exists", async () => {
    (prisma as any).relieverAssignment = { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) };
    expect(await hasActiveReliefGrant("user-1", "WAREHOUSE")).toBe(true);
  });

  it("returns false when no grant matches (wrong role, or outside date range)", async () => {
    (prisma as any).relieverAssignment = { findFirst: vi.fn().mockResolvedValue(null) };
    expect(await hasActiveReliefGrant("user-1", "WAREHOUSE")).toBe(false);
  });

  it("queries with the reliever id, covered role, and a now-within-range window", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    (prisma as any).relieverAssignment = { findFirst };
    await hasActiveReliefGrant("user-9", "WAREHOUSE");
    const arg = findFirst.mock.calls[0][0];
    expect(arg.where.relieverUserId).toBe("user-9");
    expect(arg.where.coveredRole).toBe("WAREHOUSE");
    expect(arg.where.startDate.lte).toBeInstanceOf(Date);
    expect(arg.where.endDate.gte).toBeInstanceOf(Date);
  });
});
