import { describe, it, expect } from "vitest";
import { validateLotPlan, isFifoPlan, costPlan } from "@/lib/order-logic";

const d = (iso: string) => new Date(iso);

const lots = [
  { id: "old", remainingQty: 10, unitCost: 200, receivedAt: d("2026-01-05") },
  { id: "new", remainingQty: 20, unitCost: 205, receivedAt: d("2026-01-12") },
];

describe("validateLotPlan", () => {
  it("treats an empty selection as valid — FIFO applies", () => {
    expect(validateLotPlan([], lots, 15).ok).toBe(true);
  });

  it("accepts a selection that adds up", () => {
    const r = validateLotPlan([{ lotId: "old", qty: 10 }, { lotId: "new", qty: 5 }], lots, 15);
    expect(r.ok).toBe(true);
  });

  it("rejects a selection that does not total the line quantity", () => {
    const r = validateLotPlan([{ lotId: "old", qty: 5 }], lots, 15);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/totals 5 but the line is for 15/);
  });

  it("rejects drawing more than a lot holds", () => {
    const r = validateLotPlan([{ lotId: "old", qty: 15 }], lots, 15);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/only has 10 remaining/);
  });

  it("rejects a lot from another warehouse or SKU", () => {
    const r = validateLotPlan([{ lotId: "elsewhere", qty: 15 }], lots, 15);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not available at this warehouse/);
  });

  it("rejects the same lot listed twice", () => {
    const r = validateLotPlan([{ lotId: "old", qty: 5 }, { lotId: "old", qty: 10 }], lots, 15);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/more than once/);
  });

  it("rejects a zero or negative quantity", () => {
    expect(validateLotPlan([{ lotId: "old", qty: 0 }], lots, 15).ok).toBe(false);
    expect(validateLotPlan([{ lotId: "old", qty: -3 }], lots, 15).ok).toBe(false);
  });
});

describe("isFifoPlan", () => {
  it("recognises the FIFO selection", () => {
    expect(isFifoPlan([{ lotId: "old", qty: 10 }, { lotId: "new", qty: 5 }], lots, 15)).toBe(true);
  });

  it("ignores the order the lots are listed in", () => {
    // Same layers, same quantities, different sequence — not an override.
    expect(isFifoPlan([{ lotId: "new", qty: 5 }, { lotId: "old", qty: 10 }], lots, 15)).toBe(true);
  });

  it("flags skipping the older layer as an override", () => {
    expect(isFifoPlan([{ lotId: "new", qty: 15 }], lots, 15)).toBe(false);
  });

  it("flags a different split across the same layers", () => {
    expect(isFifoPlan([{ lotId: "old", qty: 5 }, { lotId: "new", qty: 10 }], lots, 15)).toBe(false);
  });

  it("ignores zero-quantity entries when comparing", () => {
    expect(isFifoPlan([{ lotId: "old", qty: 6 }, { lotId: "new", qty: 0 }], lots, 6)).toBe(true);
  });

  it("is false when FIFO itself cannot be satisfied", () => {
    expect(isFifoPlan([{ lotId: "old", qty: 10 }], lots, 999)).toBe(false);
  });
});

describe("costPlan", () => {
  it("costs each slice at its own layer's price", () => {
    const costed = costPlan([{ lotId: "old", qty: 10 }, { lotId: "new", qty: 5 }], lots);
    expect(costed).toEqual([
      { lotId: "old", take: 10, unitCost: 200, costTotal: 2000 },
      { lotId: "new", take: 5, unitCost: 205, costTotal: 1025 },
    ]);
  });

  it("costs an override at the layers actually chosen", () => {
    // Skipping the cheaper old layer genuinely costs more — the ledger must show that.
    const costed = costPlan([{ lotId: "new", qty: 15 }], lots);
    expect(costed[0].costTotal).toBe(3075);
  });

  it("throws when a planned lot has vanished", () => {
    expect(() => costPlan([{ lotId: "gone", qty: 1 }], lots)).toThrow(/no longer available/);
  });
});
