import { describe, it, expect } from "vitest";
import { settlementView, validatePayment, blockingReason } from "@/lib/order-flow";

const unpaid = { total: 10_000, paid: 0, codRelease: false };
const partial = { total: 10_000, paid: 4_000, codRelease: false };
const settled = { total: 10_000, paid: 10_000, codRelease: false };

describe("settlementView", () => {
  it("reports the outstanding balance", () => {
    expect(settlementView(partial).balance).toBe(6_000);
  });

  it("treats a fully paid order as settled and releasable", () => {
    const v = settlementView(settled);
    expect(v.isSettled).toBe(true);
    expect(v.canRelease).toBe(true);
    expect(v.onAccount).toBe(false);
  });

  it("does not release a partially paid order", () => {
    expect(settlementView(partial).canRelease).toBe(false);
  });

  it("releases an unpaid order that an admin put on account", () => {
    const v = settlementView({ ...unpaid, codRelease: true });
    expect(v.isSettled).toBe(false);
    expect(v.canRelease).toBe(true);
    // Flagged so the order reads as released on account, not as paid.
    expect(v.onAccount).toBe(true);
  });

  it("absorbs sub-centavo dust from percentage discounts", () => {
    // A blanket discount can leave a fraction of a centavo outstanding; that must not
    // hold a truck at the gate.
    expect(settlementView({ total: 10_000, paid: 9_999.995, codRelease: false }).isSettled).toBe(true);
  });
});

describe("validatePayment", () => {
  it("accepts a payment up to the balance", () => {
    expect(validatePayment(6_000, partial).ok).toBe(true);
    expect(validatePayment(1_000, partial).ok).toBe(true);
  });

  it("rejects an overpayment", () => {
    // At a counter this is nearly always a mistyped amount; change from the drawer is
    // not a payment.
    const r = validatePayment(6_500, partial);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/exceeds the outstanding balance/);
  });

  it("rejects zero and negative amounts", () => {
    expect(validatePayment(0, unpaid).ok).toBe(false);
    expect(validatePayment(-100, unpaid).ok).toBe(false);
  });

  it("rejects a payment against an already settled order", () => {
    const r = validatePayment(100, settled);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already settled/);
  });

  it("rejects a non-finite amount", () => {
    expect(validatePayment(Number.NaN, unpaid).ok).toBe(false);
    expect(validatePayment(Number.POSITIVE_INFINITY, unpaid).ok).toBe(false);
  });
});

describe("blockingReason", () => {
  it("blocks an unsettled order from the warehouse", () => {
    const reason = blockingReason(partial);
    expect(reason).toMatch(/not settled/);
    expect(reason).toMatch(/6000.00/);
  });

  it("clears a settled order", () => {
    expect(blockingReason(settled)).toBeNull();
  });

  it("clears an order released on account", () => {
    expect(blockingReason({ ...unpaid, codRelease: true })).toBeNull();
  });
});
