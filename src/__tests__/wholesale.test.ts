import { describe, it, expect } from "vitest";
import {
  resolveUnitPrice,
  minQtyFor,
  checkWholesaleMinimums,
  formatViolations,
  approverRolesFor,
  canApprove,
  type PricedItem,
} from "@/lib/wholesale";

const cement: PricedItem = {
  id: "cement",
  name: "Portland Cement 40kg",
  unitPrice: 260,
  wholesalePrice: 235,
  wholesaleMinQty: 50,
};

const rebar: PricedItem = {
  id: "rebar",
  name: "Deformed Bar 10mm",
  unitPrice: 180,
  wholesalePrice: 165,
  wholesaleMinQty: null, // falls back to the org default
};

const retailOnly: PricedItem = {
  id: "paint",
  name: "Enamel Paint 1L",
  unitPrice: 420,
  wholesalePrice: null,
  wholesaleMinQty: null,
};

const items = new Map([cement, rebar, retailOnly].map((i) => [i.id, i]));
const thresholds = { defaultMinQty: 20, minOrderTotal: 10_000 };

describe("resolveUnitPrice", () => {
  it("uses the retail price on the retail channel", () => {
    expect(resolveUnitPrice(cement, "RETAIL")).toBe(260);
  });

  it("uses the wholesale price on the wholesale channel", () => {
    expect(resolveUnitPrice(cement, "WHOLESALE")).toBe(235);
  });

  it("refuses to fall back to retail when no wholesale price is set", () => {
    // Silently selling at the retail price would be worse than failing loudly.
    expect(() => resolveUnitPrice(retailOnly, "WHOLESALE")).toThrow(/no wholesale price/);
  });

  it("still serves a retail-only item on the retail channel", () => {
    expect(resolveUnitPrice(retailOnly, "RETAIL")).toBe(420);
  });
});

describe("minQtyFor", () => {
  it("prefers the SKU's own minimum", () => {
    expect(minQtyFor(cement, thresholds)).toBe(50);
  });

  it("falls back to the org default when the SKU sets none", () => {
    expect(minQtyFor(rebar, thresholds)).toBe(20);
  });
});

describe("checkWholesaleMinimums", () => {
  it("imposes nothing on retail orders", () => {
    const v = checkWholesaleMinimums("RETAIL", [{ skuId: "cement", qty: 1 }], items, thresholds, 260);
    expect(v).toEqual([]);
  });

  it("passes a compliant wholesale order", () => {
    const v = checkWholesaleMinimums(
      "WHOLESALE",
      [{ skuId: "cement", qty: 50 }, { skuId: "rebar", qty: 20 }],
      items,
      thresholds,
      15_050
    );
    expect(v).toEqual([]);
  });

  it("flags a line below the SKU minimum", () => {
    const v = checkWholesaleMinimums("WHOLESALE", [{ skuId: "cement", qty: 49 }], items, thresholds, 11_515);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/at least 50/);
  });

  it("accepts a line exactly at the minimum", () => {
    const v = checkWholesaleMinimums("WHOLESALE", [{ skuId: "cement", qty: 50 }], items, thresholds, 11_750);
    expect(v).toEqual([]);
  });

  it("applies the org default to a SKU with no minimum of its own", () => {
    const v = checkWholesaleMinimums("WHOLESALE", [{ skuId: "rebar", qty: 19 }], items, thresholds, 12_000);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/at least 20/);
  });

  it("rejects an item that has no wholesale price", () => {
    const v = checkWholesaleMinimums("WHOLESALE", [{ skuId: "paint", qty: 100 }], items, thresholds, 42_000);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/not available for wholesale/);
  });

  it("flags an order below the total floor even when every line qualifies", () => {
    const v = checkWholesaleMinimums("WHOLESALE", [{ skuId: "cement", qty: 50 }], items, thresholds, 9_999);
    expect(v).toHaveLength(1);
    expect(v[0].skuId).toBeNull();
    expect(v[0].message).toMatch(/must total at least/);
  });

  it("skips the total floor when it is not configured", () => {
    const v = checkWholesaleMinimums(
      "WHOLESALE",
      [{ skuId: "cement", qty: 50 }],
      items,
      { defaultMinQty: 20, minOrderTotal: 0 },
      1
    );
    expect(v).toEqual([]);
  });

  it("reports every violation at once rather than the first", () => {
    const v = checkWholesaleMinimums(
      "WHOLESALE",
      [{ skuId: "cement", qty: 1 }, { skuId: "rebar", qty: 2 }, { skuId: "paint", qty: 3 }],
      items,
      thresholds,
      500
    );
    // three line problems plus the order total
    expect(v).toHaveLength(4);
  });

  it("flags an unknown SKU instead of silently ignoring it", () => {
    const v = checkWholesaleMinimums("WHOLESALE", [{ skuId: "ghost", qty: 100 }], items, thresholds, 50_000);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/Unknown item/);
  });
});

describe("formatViolations", () => {
  it("joins messages into one line", () => {
    expect(formatViolations([{ skuId: "a", message: "One." }, { skuId: null, message: "Two." }]))
      .toBe("One. Two.");
  });
});

describe("approval gate", () => {
  it("restricts wholesale to admins", () => {
    expect(approverRolesFor("WHOLESALE")).toEqual(["ADMIN"]);
    expect(canApprove("WHOLESALE", "ADMIN")).toBe(true);
    expect(canApprove("WHOLESALE", "FINANCE")).toBe(false);
    expect(canApprove("WHOLESALE", "AGENT")).toBe(false);
  });

  it("leaves retail approvable by finance or admin", () => {
    expect(canApprove("RETAIL", "FINANCE")).toBe(true);
    expect(canApprove("RETAIL", "ADMIN")).toBe(true);
    expect(canApprove("RETAIL", "WAREHOUSE")).toBe(false);
  });
});
