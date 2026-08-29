/**
 * Action tests for B.O. (backorder) logging and PO closing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = (role = "WAREHOUSE") => ({
  user: { id: "user-1", name: "Test", email: "t@t.com", role },
});

const poLine = {
  id: "LINE-1",
  poId: "PO-1",
  skuId: "SKU-1",
  qty: 10,
  accepted: 8,
  damaged: 2,
  backorders: [] as { qty: number }[],
  po: { warehouse: { code: "MNL" } },
};

// ── logBackorder ─────────────────────────────────────────────────────────────

describe("logBackorder", () => {
  let tx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession("WAREHOUSE") as any);
    // Reliever-grant fallback lookup — no active grant in these tests.
    (prisma as any).relieverAssignment = { findFirst: vi.fn().mockResolvedValue(null) };

    (prisma as any).inboundPOLine = {
      findUniqueOrThrow: vi.fn().mockResolvedValue(poLine),
    };
    (prisma as any).journalEntry = { count: vi.fn().mockResolvedValue(0) };

    tx = {
      backorderReturn: { create: vi.fn().mockResolvedValue({}) },
      stock:      { upsert: vi.fn().mockResolvedValue({}) },
      stockMove:  { create: vi.fn().mockResolvedValue({}) },
      lot:        { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
      journalEntry: { create: vi.fn().mockResolvedValue({}) },
    };
    (prisma as any).$transaction = vi.fn().mockImplementation((fn: any) => fn(tx));
  });

  const baseInput = {
    poId: "PO-1", poLineId: "LINE-1", skuId: "SKU-1", warehouseId: "WH-1",
    qty: 1, costPerUnit: 50,
  };

  it("blocks non-WAREHOUSE/ADMIN roles", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("FINANCE") as any);
    const { logBackorder } = await import("@/app/(dashboard)/inbound/actions");
    await expect(logBackorder({ ...baseInput, disposition: "GOOD" } as any)).rejects.toThrow("Forbidden");
  });

  it("requires badReasonType when disposition is BAD", async () => {
    const { logBackorder } = await import("@/app/(dashboard)/inbound/actions");
    await expect(logBackorder({ ...baseInput, disposition: "BAD" } as any)).rejects.toThrow();
  });

  it("rejects logging more than the outstanding damaged qty", async () => {
    const { logBackorder } = await import("@/app/(dashboard)/inbound/actions");
    await expect(
      logBackorder({ ...baseInput, qty: 5, disposition: "GOOD" } as any)
    ).rejects.toThrow("only 2 unit(s)");
  });

  it("GOOD: restocks and does not post a journal entry", async () => {
    const { logBackorder } = await import("@/app/(dashboard)/inbound/actions");
    await logBackorder({ ...baseInput, qty: 2, disposition: "GOOD" } as any);
    expect(tx.stock.upsert).toHaveBeenCalledOnce();
    expect(tx.stockMove.create).toHaveBeenCalledOnce();
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it("BAD: posts a write-off journal entry and does not touch stock", async () => {
    const { logBackorder } = await import("@/app/(dashboard)/inbound/actions");
    await logBackorder({ ...baseInput, qty: 2, disposition: "BAD", badReasonType: "DAMAGED_CONTAINER" } as any);
    expect(tx.journalEntry.create).toHaveBeenCalledOnce();
    const call = tx.journalEntry.create.mock.calls[0][0];
    expect(call.data.lines.create).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "5800", dr: 100 }),
        expect.objectContaining({ code: "1200", cr: 100 }),
      ])
    );
    expect(tx.stock.upsert).not.toHaveBeenCalled();
  });
});

// ── closePO ──────────────────────────────────────────────────────────────────

describe("closePO", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession("FINANCE") as any);
    (prisma as any).inboundPO = {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };
  });

  it("blocks WAREHOUSE role (closing is a Finance/Admin action)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("WAREHOUSE") as any);
    const { closePO } = await import("@/app/(dashboard)/inbound/actions");
    await expect(closePO("PO-1")).rejects.toThrow("Forbidden");
  });

  it("rejects when a line has unresolved B.O. qty", async () => {
    (prisma as any).inboundPO.findUniqueOrThrow.mockResolvedValue({
      id: "PO-1", closedAt: null,
      lines: [{ damaged: 2, backorders: [], sku: { name: "SKU-1" } }],
      bills: [{ id: "BILL-1", status: "PAID" }],
    });
    const { closePO } = await import("@/app/(dashboard)/inbound/actions");
    await expect(closePO("PO-1")).rejects.toThrow("unresolved");
  });

  it("rejects when no bill is linked", async () => {
    (prisma as any).inboundPO.findUniqueOrThrow.mockResolvedValue({
      id: "PO-1", closedAt: null,
      lines: [{ damaged: 2, backorders: [{ qty: 2 }], sku: { name: "SKU-1" } }],
      bills: [],
    });
    const { closePO } = await import("@/app/(dashboard)/inbound/actions");
    await expect(closePO("PO-1")).rejects.toThrow("No bill is linked");
  });

  it("rejects when the linked bill is not fully paid", async () => {
    (prisma as any).inboundPO.findUniqueOrThrow.mockResolvedValue({
      id: "PO-1", closedAt: null,
      lines: [{ damaged: 2, backorders: [{ qty: 2 }], sku: { name: "SKU-1" } }],
      bills: [{ id: "BILL-1", status: "PARTIAL" }],
    });
    const { closePO } = await import("@/app/(dashboard)/inbound/actions");
    await expect(closePO("PO-1")).rejects.toThrow("not fully paid");
  });

  it("closes when all B.O. lines are resolved and the bill is paid", async () => {
    (prisma as any).inboundPO.findUniqueOrThrow.mockResolvedValue({
      id: "PO-1", closedAt: null,
      lines: [{ damaged: 2, backorders: [{ qty: 2 }], sku: { name: "SKU-1" } }],
      bills: [{ id: "BILL-1", status: "PAID" }],
    });
    const { closePO } = await import("@/app/(dashboard)/inbound/actions");
    await closePO("PO-1");
    expect((prisma as any).inboundPO.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "PO-1" }, data: expect.objectContaining({ closedById: "user-1" }) })
    );
  });
});
