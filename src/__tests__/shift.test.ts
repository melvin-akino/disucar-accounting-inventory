import { describe, it, expect } from "vitest";
import { computeZRead, cashVariance, validateClose, describeVariance } from "@/lib/shift";

const session = [
  { amount: 1_500, paymentType: "CASH" },
  { amount: 2_300.5, paymentType: "CASH" },
  { amount: 11_872, paymentType: "BANK_TRANSFER" },
  { amount: 4_000, paymentType: "CHECK" },
];

describe("computeZRead", () => {
  it("separates cash from tenders that never sit in the drawer", () => {
    const z = computeZRead(session);
    // Only cash can be counted; a bank transfer cannot be short in the till.
    expect(z.expectedCash).toBe(3_800.5);
    expect(z.nonCashTotal).toBe(15_872);
    expect(z.totalTaken).toBe(19_672.5);
  });

  it("counts payments, not orders", () => {
    // Two cash payments against one order are still two drawer events.
    expect(computeZRead(session).paymentCount).toBe(4);
  });

  it("breaks down by tender, largest first", () => {
    const z = computeZRead(session);
    expect(z.byTender.map((t) => t.tender)).toEqual(["BANK_TRANSFER", "CHECK", "CASH"]);
    const cash = z.byTender.find((t) => t.tender === "CASH")!;
    expect(cash.count).toBe(2);
    expect(cash.amount).toBe(3_800.5);
    expect(cash.label).toBe("Cash");
  });

  it("reports zeroes for a session that took nothing", () => {
    const z = computeZRead([]);
    expect(z).toMatchObject({ expectedCash: 0, nonCashTotal: 0, totalTaken: 0, paymentCount: 0 });
    expect(z.byTender).toEqual([]);
  });

  it("labels an unrecognised tender rather than dropping it", () => {
    const z = computeZRead([{ amount: 100, paymentType: "GCASH" }]);
    expect(z.byTender[0].label).toBe("GCASH");
    // Not cash, so it must not be expected in the drawer.
    expect(z.expectedCash).toBe(0);
    expect(z.nonCashTotal).toBe(100);
  });

  it("does not accumulate float dust across many payments", () => {
    const pennies = Array.from({ length: 3 }, () => ({ amount: 0.1, paymentType: "CASH" }));
    expect(computeZRead(pennies).expectedCash).toBe(0.3);
  });
});

describe("cashVariance", () => {
  it("is zero when the drawer balances", () => {
    expect(cashVariance(3_800.5, 3_800.5)).toBe(0);
  });

  it("is positive for an overage", () => {
    expect(cashVariance(3_800.5, 3_900.5)).toBe(100);
  });

  it("is negative for a shortage", () => {
    expect(cashVariance(3_800.5, 3_700.5)).toBe(-100);
  });
});

describe("validateClose", () => {
  it("allows a count that differs from expected — that is the point of counting", () => {
    expect(validateClose(0).ok).toBe(true);
    expect(validateClose(9_999).ok).toBe(true);
  });

  it("refuses a negative count", () => {
    const r = validateClose(-5);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cannot be negative/);
  });

  it("refuses a non-numeric count", () => {
    expect(validateClose(Number.NaN).ok).toBe(false);
    expect(validateClose(Number.POSITIVE_INFINITY).ok).toBe(false);
  });
});

describe("describeVariance", () => {
  it("states the sense of the number, never the number alone", () => {
    expect(describeVariance(0)).toBe("Drawer balances");
    expect(describeVariance(0.004)).toBe("Drawer balances");
    expect(describeVariance(120)).toBe("Over by 120.00");
    expect(describeVariance(-75.5)).toBe("Short by 75.50");
  });
});
