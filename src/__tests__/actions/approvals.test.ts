/**
 * Action tests for order approval, including the credit-hold and quota gates.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/quota", () => ({ getActiveQuota: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/credit", () => ({
  getCustomerCredit: vi.fn().mockResolvedValue({
    creditLimit: 0, outstanding: 0, available: 0, utilPct: 0, overLimit: false,
    unpaidCount: 0, onHold: false,
  }),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getActiveQuota } from "@/lib/quota";
import { getCustomerCredit } from "@/lib/credit";

const mockSession = (role = "FINANCE") => ({
  user: { id: "user-1", name: "Test", email: "t@t.com", role },
});

const pendingOrder = {
  id: "SO-1", state: "PENDING", customerId: "c1", subtotal: 1000, vat: 120, cwt: 0, total: 1120, cwt2307: false,
  lines: [{ id: "line-1", unitPrice: 500, qty: 2, lineTotal: 1000 }],
};

describe("approveOrder", () => {
  let tx: { order: { update: ReturnType<typeof vi.fn> }; orderEvent: { create: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession("FINANCE") as any);
    vi.mocked(getActiveQuota).mockResolvedValue(null);
    vi.mocked(getCustomerCredit).mockResolvedValue({
      creditLimit: 0, outstanding: 0, available: 0, utilPct: 0, overLimit: false,
      unpaidCount: 0, onHold: false,
    });

    (prisma as any).order = { findUniqueOrThrow: vi.fn().mockResolvedValue(pendingOrder) };
    tx = { order: { update: vi.fn().mockResolvedValue({}) }, orderEvent: { create: vi.fn().mockResolvedValue({}) } };
    (prisma as any).$transaction = vi.fn().mockImplementation((ops: any[]) => Promise.all(ops));
    // approveOrder builds an array of prisma calls, not a callback — mock $transaction to just resolve them.
    (prisma as any).order.update = tx.order.update;
    (prisma as any).orderEvent = { create: tx.orderEvent.create };
  });

  it("blocks non-FINANCE/ADMIN roles", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("AGENT") as any);
    const { approveOrder } = await import("@/app/(dashboard)/approvals/actions");
    await expect(approveOrder("SO-1")).rejects.toThrow("Forbidden");
  });

  it("approves normally when the customer is not on hold and not over quota", async () => {
    const { approveOrder } = await import("@/app/(dashboard)/approvals/actions");
    await approveOrder("SO-1");
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: "APPROVED" }) })
    );
    expect(tx.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ note: "Approved" }) })
    );
  });

  it("throws CREDIT_HOLD_WARNING when the customer has 3+ unpaid receipts and no override reason", async () => {
    vi.mocked(getCustomerCredit).mockResolvedValue({
      creditLimit: 0, outstanding: 0, available: 0, utilPct: 0, overLimit: false,
      unpaidCount: 3, onHold: true,
    });
    const { approveOrder } = await import("@/app/(dashboard)/approvals/actions");
    await expect(approveOrder("SO-1")).rejects.toThrow("CREDIT_HOLD_WARNING:3");
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it("approves with a credit hold override, recording the reason and audit fields", async () => {
    vi.mocked(getCustomerCredit).mockResolvedValue({
      creditLimit: 0, outstanding: 0, available: 0, utilPct: 0, overLimit: false,
      unpaidCount: 4, onHold: true,
    });
    const { approveOrder } = await import("@/app/(dashboard)/approvals/actions");
    await approveOrder("SO-1", undefined, "Payment received, not yet posted");

    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: "APPROVED",
          creditHoldOverride: true,
          creditHoldOverrideReason: "Payment received, not yet posted",
          creditHoldOverrideById: "user-1",
        }),
      })
    );
    expect(tx.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          note: expect.stringContaining("credit hold override (customer had 4 unpaid receipts): Payment received, not yet posted"),
        }),
      })
    );
  });

  it("is unaffected when the customer has fewer than 3 unpaid receipts", async () => {
    vi.mocked(getCustomerCredit).mockResolvedValue({
      creditLimit: 0, outstanding: 0, available: 0, utilPct: 0, overLimit: false,
      unpaidCount: 2, onHold: false,
    });
    const { approveOrder } = await import("@/app/(dashboard)/approvals/actions");
    await approveOrder("SO-1");
    const call = tx.order.update.mock.calls[0][0];
    expect(call.data.state).toBe("APPROVED");
    expect(call.data.creditHoldOverride).toBeUndefined();
  });

  it("chains into the quota check after a credit hold override is applied", async () => {
    vi.mocked(getCustomerCredit).mockResolvedValue({
      creditLimit: 0, outstanding: 0, available: 0, utilPct: 0, overLimit: false,
      unpaidCount: 3, onHold: true,
    });
    vi.mocked(getActiveQuota).mockResolvedValue({
      quotaId: "Q1", label: "Q1 2026", periodStart: "2026-01-01", periodEnd: "2026-03-31",
      targetAmount: 500, consumed: 500, remaining: 0, pct: 100, isOver: true,
    });
    const { approveOrder } = await import("@/app/(dashboard)/approvals/actions");
    // Credit override supplied, but no quota override yet — should throw QUOTA_WARNING, not approve.
    await expect(approveOrder("SO-1", undefined, "reason")).rejects.toThrow("QUOTA_WARNING:");
    expect(tx.order.update).not.toHaveBeenCalled();
  });
});
