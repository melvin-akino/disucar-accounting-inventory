import { describe, it, expect } from "vitest";
import {
  computeOrderTotals,
  checkCredit,
  checkStock,
  selectLotsFefo,
  buildStatementRows,
  validateReturnQtys,
} from "@/lib/order-logic";

// ── computeOrderTotals ────────────────────────────────────────────────────────

describe("computeOrderTotals", () => {
  it("adds 12% VAT and no CWT when cwt2307 is false", () => {
    const result = computeOrderTotals(1000, false);
    expect(result.subtotal).toBe(1000);
    expect(result.vat).toBe(120);
    expect(result.cwt).toBe(0);
    expect(result.total).toBe(1120);
  });

  it("deducts 2% CWT when cwt2307 is true", () => {
    const result = computeOrderTotals(1000, true);
    expect(result.vat).toBe(120);
    expect(result.cwt).toBe(20);
    expect(result.total).toBe(1100); // 1000 + 120 - 20
  });

  it("rounds VAT and CWT to 2 decimal places", () => {
    const result = computeOrderTotals(333.33, false);
    expect(result.vat).toBe(40); // 333.33 * 0.12 = 39.9996 → rounds to 40
  });

  it("handles zero subtotal", () => {
    const result = computeOrderTotals(0, true);
    expect(result.total).toBe(0);
  });
});

// ── checkCredit ───────────────────────────────────────────────────────────────

describe("checkCredit", () => {
  it("allows order when credit limit is 0 (unlimited)", () => {
    const result = checkCredit(0, 50000, 99999);
    expect(result.allowed).toBe(true);
    expect(result.overLimitBy).toBe(0);
  });

  it("allows order when outstanding + new total ≤ credit limit", () => {
    const result = checkCredit(100000, 40000, 50000);
    expect(result.allowed).toBe(true);
    expect(result.available).toBe(60000);
  });

  it("blocks order when it would exceed credit limit", () => {
    const result = checkCredit(100000, 80000, 30000);
    expect(result.allowed).toBe(false);
    expect(result.overLimitBy).toBe(10000);
  });

  it("allows order exactly at credit limit", () => {
    const result = checkCredit(100000, 50000, 50000);
    expect(result.allowed).toBe(true);
    expect(result.overLimitBy).toBe(0);
  });
});

// ── checkStock ────────────────────────────────────────────────────────────────

describe("checkStock", () => {
  it("marks sufficient when available ≥ requested", () => {
    const result = checkStock(100, 20, 50);
    expect(result.available).toBe(80);
    expect(result.sufficient).toBe(true);
    expect(result.deficit).toBe(0);
  });

  it("marks insufficient and computes deficit", () => {
    const result = checkStock(30, 10, 30);
    expect(result.available).toBe(20);
    expect(result.sufficient).toBe(false);
    expect(result.deficit).toBe(10);
  });

  it("marks sufficient when exactly at quantity needed", () => {
    const result = checkStock(50, 0, 50);
    expect(result.sufficient).toBe(true);
    expect(result.deficit).toBe(0);
  });
});

// ── selectLotsFefo ────────────────────────────────────────────────────────────

describe("selectLotsFefo", () => {
  const makeLot = (id: string, remainingQty: number, expiryDate: Date | null) => ({
    id,
    remainingQty,
    expiryDate,
  });

  it("returns empty array for zero needed", () => {
    const lots = [makeLot("L1", 100, new Date("2025-01-01"))];
    expect(selectLotsFefo(lots, 0)).toEqual([]);
  });

  it("picks from earliest expiry first", () => {
    const lots = [
      makeLot("L_far",  50, new Date("2026-12-01")),
      makeLot("L_near", 50, new Date("2025-06-01")),
    ];
    const allocations = selectLotsFefo(lots, 30);
    expect(allocations[0].lotId).toBe("L_near");
    expect(allocations[0].take).toBe(30);
  });

  it("puts null-expiry lots last", () => {
    const lots = [
      makeLot("L_null", 50, null),
      makeLot("L_exp",  50, new Date("2025-06-01")),
    ];
    const allocations = selectLotsFefo(lots, 50);
    expect(allocations[0].lotId).toBe("L_exp");
  });

  it("spans multiple lots to fill the request", () => {
    const lots = [
      makeLot("L1", 20, new Date("2025-01-01")),
      makeLot("L2", 30, new Date("2025-06-01")),
    ];
    const allocations = selectLotsFefo(lots, 45);
    expect(allocations).toHaveLength(2);
    expect(allocations[0]).toEqual({ lotId: "L1", take: 20 });
    expect(allocations[1]).toEqual({ lotId: "L2", take: 25 });
  });

  it("throws when stock is insufficient", () => {
    const lots = [makeLot("L1", 10, null)];
    expect(() => selectLotsFefo(lots, 20)).toThrow("Insufficient lot stock");
  });

  it("skips lots with zero remaining quantity", () => {
    const lots = [
      makeLot("L_empty", 0, new Date("2025-01-01")),
      makeLot("L_ok",    50, new Date("2025-06-01")),
    ];
    const allocations = selectLotsFefo(lots, 10);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].lotId).toBe("L_ok");
  });
});

// ── buildStatementRows ────────────────────────────────────────────────────────

describe("buildStatementRows", () => {
  const baseInvoice = {
    id: "INV-001",
    soId: "SO-2025-0001",
    issued: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-15"),
    amount: 1000,
    paid: 0,
  };

  it("creates a single debit row for an unpaid invoice", () => {
    const rows = buildStatementRows([baseInvoice]);
    expect(rows).toHaveLength(1);
    expect(rows[0].debit).toBe(1000);
    expect(rows[0].credit).toBe(0);
    expect(rows[0].balance).toBe(1000);
  });

  it("creates both debit and credit rows when payment > 0", () => {
    const inv = { ...baseInvoice, paid: 500 };
    const rows = buildStatementRows([inv]);
    expect(rows).toHaveLength(2);
    const debitRow = rows.find(r => r.debit > 0)!;
    const creditRow = rows.find(r => r.credit > 0)!;
    expect(debitRow.debit).toBe(1000);
    expect(creditRow.credit).toBe(500);
  });

  it("computes running balance correctly across multiple invoices", () => {
    const invoices = [
      { ...baseInvoice, id: "INV-001", amount: 1000, paid: 400, issued: new Date("2025-01-01"), updatedAt: new Date("2025-01-10") },
      { ...baseInvoice, id: "INV-002", amount: 500,  paid: 0,   issued: new Date("2025-02-01"), updatedAt: new Date("2025-02-01") },
    ];
    const rows = buildStatementRows(invoices);
    // Sorted by date: INV-001 debit → PMT-INV-001 credit → INV-002 debit
    const balances = rows.map(r => r.balance);
    expect(balances[balances.length - 1]).toBe(1000 - 400 + 500); // 1100
  });

  it("sorts rows by date ascending", () => {
    const invoices = [
      { ...baseInvoice, id: "INV-B", issued: new Date("2025-03-01"), updatedAt: new Date("2025-03-01") },
      { ...baseInvoice, id: "INV-A", issued: new Date("2025-01-01"), updatedAt: new Date("2025-01-01") },
    ];
    const rows = buildStatementRows(invoices);
    expect(rows[0].ref).toBe("INV-A");
  });
});

// ── validateReturnQtys ────────────────────────────────────────────────────────

describe("validateReturnQtys", () => {
  it("passes valid return quantities", () => {
    const result = validateReturnQtys([
      { skuId: "SKU-1", qtyRequested: 5, originalQty: 10 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when quantity is zero or negative", () => {
    const result = validateReturnQtys([
      { skuId: "SKU-1", qtyRequested: 0, originalQty: 10 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/greater than 0/);
  });

  it("fails when return qty exceeds original qty", () => {
    const result = validateReturnQtys([
      { skuId: "SKU-1", qtyRequested: 15, originalQty: 10 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Cannot return/);
  });

  it("collects errors from multiple lines", () => {
    const result = validateReturnQtys([
      { skuId: "SKU-1", qtyRequested: 0,  originalQty: 10 },
      { skuId: "SKU-2", qtyRequested: 20, originalQty: 5  },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it("allows returning exact original quantity", () => {
    const result = validateReturnQtys([
      { skuId: "SKU-1", qtyRequested: 10, originalQty: 10 },
    ]);
    expect(result.valid).toBe(true);
  });
});
