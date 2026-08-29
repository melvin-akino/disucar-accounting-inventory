/**
 * Action tests for applyOrderDiscount (order-view discount editor).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn() }));
vi.mock("@/lib/credit", () => ({ getCustomerCredit: vi.fn() }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = (role = "FINANCE") => ({ user: { id: "u1", name: "T", email: "t@t.com", role } });

const baseOrder = {
  id: "SO-1", state: "PENDING", cwt2307: false,
  customer: { blanketDiscountPct: 5 },
  lines: [
    { id: "L1", unitPrice: 100, qty: 10, isFree: false },   // gross 1000
    { id: "L2", unitPrice: 0,   qty: 5,  isFree: true  },    // free
  ],
};

describe("applyOrderDiscount", () => {
  let orderUpdate: ReturnType<typeof vi.fn>;
  let lineUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession("FINANCE") as any);
    orderUpdate = vi.fn().mockResolvedValue({});
    lineUpdate = vi.fn().mockResolvedValue({});
    (prisma as any).order = { findUniqueOrThrow: vi.fn().mockResolvedValue(baseOrder), update: orderUpdate };
    (prisma as any).orderLine = { update: lineUpdate };
    (prisma as any).orderEvent = { create: vi.fn().mockResolvedValue({}) };
    (prisma as any).$transaction = vi.fn().mockImplementation((ops: any[]) => Promise.all(ops));
  });

  it("blocks non-FINANCE/ADMIN roles", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("AGENT") as any);
    const { applyOrderDiscount } = await import("@/app/(dashboard)/orders/actions");
    await expect(applyOrderDiscount("SO-1", { mode: "NONE" })).rejects.toThrow("Forbidden");
  });

  it("rejects a per-product discount above 3%", async () => {
    const { applyOrderDiscount } = await import("@/app/(dashboard)/orders/actions");
    await expect(
      applyOrderDiscount("SO-1", { mode: "PRODUCT", lineDiscounts: [{ orderLineId: "L1", discountPct: 4 }] })
    ).rejects.toThrow();
  });

  it("rejects a per-product discount below 1%", async () => {
    const { applyOrderDiscount } = await import("@/app/(dashboard)/orders/actions");
    await expect(
      applyOrderDiscount("SO-1", { mode: "PRODUCT", lineDiscounts: [{ orderLineId: "L1", discountPct: 0 }] })
    ).rejects.toThrow();
  });

  it("applies the customer blanket to non-free lines and recomputes totals", async () => {
    const { applyOrderDiscount } = await import("@/app/(dashboard)/orders/actions");
    await applyOrderDiscount("SO-1", { mode: "CUSTOMER" });

    // Gross 1000, 5% off -> net 950; VAT 12% of 950 = 114; total 1064; subtotal stays gross 1000.
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ discountMode: "CUSTOMER", subtotal: 1000, vat: 114, total: 1064 }) })
    );
    // L1 discounted to 950; L2 (free) stays 0 with null pct.
    expect(lineUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "L1" }, data: { lineTotal: 950, discountPct: 5 } }));
    expect(lineUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "L2" }, data: { lineTotal: 0, discountPct: null } }));
  });

  it("rejects CUSTOMER mode when the customer has no blanket discount", async () => {
    (prisma as any).order.findUniqueOrThrow = vi.fn().mockResolvedValue({ ...baseOrder, customer: { blanketDiscountPct: null } });
    const { applyOrderDiscount } = await import("@/app/(dashboard)/orders/actions");
    await expect(applyOrderDiscount("SO-1", { mode: "CUSTOMER" })).rejects.toThrow(/no blanket discount/);
  });

  it("refuses to change discount on a delivered order", async () => {
    (prisma as any).order.findUniqueOrThrow = vi.fn().mockResolvedValue({ ...baseOrder, state: "DELIVERED" });
    const { applyOrderDiscount } = await import("@/app/(dashboard)/orders/actions");
    await expect(applyOrderDiscount("SO-1", { mode: "NONE" })).rejects.toThrow(/delivered or cancelled/);
  });
});
