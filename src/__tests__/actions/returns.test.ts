/**
 * Action tests for return request flows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = (role = "AGENT") => ({
  user: { id: "user-1", name: "Test", email: "t@t.com", role },
});

const deliveredOrder = {
  id: "SO-1",
  state: "DELIVERED",
  warehouseId: "WH-1",
  lines: [
    { id: "OL-1", skuId: "SKU-1", qty: 10, name: "Med A" },
    { id: "OL-2", skuId: "SKU-2", qty: 5,  name: "Med B" },
  ],
};

// ── createReturn ──────────────────────────────────────────────────────────────

describe("createReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession() as any);

    (prisma as any).order = {
      findUniqueOrThrow: vi.fn().mockResolvedValue(deliveredOrder),
    };
    (prisma as any).returnRequest = {
      create: vi.fn().mockResolvedValue({ id: "RET-001" }),
      count: vi.fn().mockResolvedValue(0),
    };
  });

  it("throws when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const { createReturn } = await import("@/app/(dashboard)/returns/actions");
    await expect(
      createReturn({ orderId: "SO-1", reason: "Damaged", lines: [{ skuId: "SKU-1", name: "Med A", qtyRequested: 2, disposition: "SCRAP" }] })
    ).rejects.toThrow("Unauthenticated");
  });

  it("throws Forbidden for CUSTOMER role", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("CUSTOMER") as any);
    const { createReturn } = await import("@/app/(dashboard)/returns/actions");
    await expect(
      createReturn({ orderId: "SO-1", reason: "Damaged", lines: [{ skuId: "SKU-1", name: "Med A", qtyRequested: 2, disposition: "SCRAP" }] })
    ).rejects.toThrow("Forbidden");
  });

  it("throws when order is not DELIVERED", async () => {
    (prisma as any).order.findUniqueOrThrow = vi.fn().mockResolvedValue({
      ...deliveredOrder, state: "PENDING",
    });
    const { createReturn } = await import("@/app/(dashboard)/returns/actions");
    await expect(
      createReturn({ orderId: "SO-1", reason: "Damaged", lines: [{ skuId: "SKU-1", name: "Med A", qtyRequested: 2, disposition: "SCRAP" }] })
    ).rejects.toThrow("delivered orders");
  });

  it("throws when return qty exceeds ordered qty", async () => {
    const { createReturn } = await import("@/app/(dashboard)/returns/actions");
    await expect(
      createReturn({
        orderId: "SO-1",
        reason: "Excess",
        lines: [{ skuId: "SKU-1", name: "Med A", qtyRequested: 20, disposition: "RESTOCK" }],
      })
    ).rejects.toThrow("Cannot return more");
  });

  it("creates a return and returns the new ID", async () => {
    const { createReturn } = await import("@/app/(dashboard)/returns/actions");
    const id = await createReturn({
      orderId: "SO-1",
      reason: "Damaged goods",
      lines: [{ skuId: "SKU-1", name: "Med A", qtyRequested: 3, disposition: "SCRAP" }],
    });
    expect(id).toBe("RET-001");
    expect((prisma as any).returnRequest.create).toHaveBeenCalledOnce();
  });
});

// ── approveReturn ─────────────────────────────────────────────────────────────

describe("approveReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession("FINANCE") as any);
    (prisma as any).returnRequest = {
      update: vi.fn().mockResolvedValue({}),
    };
  });

  it("allows FINANCE to approve a return", async () => {
    const { approveReturn } = await import("@/app/(dashboard)/returns/actions");
    await approveReturn("RET-001");
    expect((prisma as any).returnRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "APPROVED" } })
    );
  });

  it("blocks AGENT from approving a return", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("AGENT") as any);
    const { approveReturn } = await import("@/app/(dashboard)/returns/actions");
    await expect(approveReturn("RET-001")).rejects.toThrow("Forbidden");
  });
});

// ── receiveReturn ─────────────────────────────────────────────────────────────

describe("receiveReturn", () => {
  const approvedReturn = {
    id: "RET-001",
    status: "APPROVED",
    order: { warehouseId: "WH-1" },
    lines: [
      { id: "RL-1", skuId: "SKU-1", qtyRequested: 3, qtyReceived: 0, disposition: "RESTOCK" },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession("WAREHOUSE") as any);

    const tx = {
      returnLine: { update: vi.fn().mockResolvedValue({}) },
      stock:      { upsert: vi.fn().mockResolvedValue({}) },
      stockMove:  { create: vi.fn().mockResolvedValue({}) },
      returnRequest: { update: vi.fn().mockResolvedValue({}) },
    };

    (prisma as any).returnRequest = {
      findUniqueOrThrow: vi.fn().mockResolvedValue(approvedReturn),
    };
    // receiveReturn makes two reads before opening its transaction: the original selling
    // prices for the credit note, then the frozen lot allocations for the cost reversal.
    (prisma as any).orderLine = {
      findMany: vi.fn()
        .mockResolvedValueOnce([{ skuId: "SKU-1", unitPrice: 100 }])
        .mockResolvedValueOnce([
          { skuId: "SKU-1", lots: [{ qtyTaken: 5, costTotal: 350 }] }, // 70.00 each
        ]),
    };
    (prisma as any).warehouse = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ code: "MNL" }),
    };
    (prisma as any).journalEntry = { create: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(0) };
    (tx as any).journalEntry = { create: vi.fn().mockResolvedValue({}) };
    (tx as any).lot = { upsert: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}) };
    (prisma as any).$transaction = vi.fn().mockImplementation((fn: any) => fn(tx));
    (prisma as any).__tx = tx; // expose for assertions
  });

  it("throws when return is not APPROVED", async () => {
    (prisma as any).returnRequest.findUniqueOrThrow = vi.fn().mockResolvedValue({
      ...approvedReturn, status: "PENDING",
    });
    const { receiveReturn } = await import("@/app/(dashboard)/returns/actions");
    await expect(receiveReturn("RET-001", [{ id: "RL-1", qtyReceived: 3 }])).rejects.toThrow("approved");
  });

  it("restocks when disposition is RESTOCK", async () => {
    const { receiveReturn } = await import("@/app/(dashboard)/returns/actions");
    await receiveReturn("RET-001", [{ id: "RL-1", qtyReceived: 3 }]);
    expect((prisma as any).$transaction).toHaveBeenCalledOnce();
    expect((prisma as any).__tx.stock.upsert).toHaveBeenCalled();
  });

  it("restores the lot at the cost the goods were sold at", async () => {
    const { receiveReturn } = await import("@/app/(dashboard)/returns/actions");
    await receiveReturn("RET-001", [{ id: "RL-1", qtyReceived: 3 }]);
    // 350.00 over 5 units = 70.00 each. Left unset this defaulted to 0 and returned
    // goods became free inventory.
    expect((prisma as any).__tx.lot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unitCost: 70 }) })
    );
  });

  it("credits the customer and reverses COGS to the real accounts", async () => {
    const { receiveReturn } = await import("@/app/(dashboard)/returns/actions");
    await receiveReturn("RET-001", [{ id: "RL-1", qtyReceived: 3 }]);

    const entries = vi.mocked((prisma as any).__tx.journalEntry.create).mock.calls;
    expect(entries).toHaveLength(2);

    // Credit note: 3 x 100 = 300 subtotal, 36 VAT, 336 off the receivable.
    const creditLines = entries[0][0].data.lines.create;
    expect(creditLines).toEqual([
      { code: "4900", dr: 300, cr: 0 },
      { code: "2100", dr: 36, cr: 0 },
      { code: "1100", dr: 0, cr: 336 },
    ]);

    // Cost reversal: 3 x 70 = 210 back into inventory, out of COGS. Without this the
    // goods sat on the shelf while their cost stayed in cost of sales.
    const costLines = entries[1][0].data.lines.create;
    expect(costLines).toEqual([
      { code: "1200", dr: 210, cr: 0 },
      { code: "5000", dr: 0, cr: 210 },
    ]);
  });

  it("does not reverse cost for scrapped goods", async () => {
    (prisma as any).returnRequest.findUniqueOrThrow = vi.fn().mockResolvedValue({
      ...approvedReturn,
      lines: [{ ...approvedReturn.lines[0], disposition: "SCRAP" }],
    });
    const { receiveReturn } = await import("@/app/(dashboard)/returns/actions");
    await receiveReturn("RET-001", [{ id: "RL-1", qtyReceived: 3 }]);

    // Scrapped goods never re-enter inventory, so the cost correctly stays in COGS —
    // only the credit note is posted.
    expect((prisma as any).__tx.journalEntry.create).toHaveBeenCalledOnce();
    expect((prisma as any).__tx.stock.upsert).not.toHaveBeenCalled();
  });
});

// ── receiveReturnsBulk ──────────────────────────────────────────────────────────

describe("receiveReturnsBulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession("WAREHOUSE") as any);
    // Reliever-grant fallback lookup — no active grant in these tests.
    (prisma as any).relieverAssignment = { findFirst: vi.fn().mockResolvedValue(null) };
  });

  it("blocks roles other than Warehouse/Admin", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("AGENT") as any);
    const { receiveReturnsBulk } = await import("@/app/(dashboard)/returns/actions");
    await expect(receiveReturnsBulk(["RET-1"])).rejects.toThrow("Forbidden");
  });

  it("skips returns that are not APPROVED without touching them", async () => {
    (prisma as any).returnRequest = {
      findUnique: vi.fn().mockResolvedValue({ id: "RET-1", status: "REQUESTED", lines: [] }),
    };
    const { receiveReturnsBulk } = await import("@/app/(dashboard)/returns/actions");
    const res = await receiveReturnsBulk(["RET-1"]);
    expect(res.received).toBe(0);
    expect(res.skipped).toContain("RET-1");
  });
});
