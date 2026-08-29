import { describe, it, expect } from "vitest";
import { canAdvanceState, nextOrderState } from "@/lib/order-logic";
import type { Role } from "@prisma/client";

// Two entry paths converging at the till:
//   RETAIL     PENDING → AWAITING_PAYMENT → PAID → PREPARING → SHIPPED → DELIVERED
//   WHOLESALE  PENDING → APPROVED → AWAITING_PAYMENT → PAID → PREPARING → SHIPPED → DELIVERED

describe("canAdvanceState — retail counter", () => {
  it("lets a cashier price a pending order", () => {
    expect(canAdvanceState("PENDING", "CASHIER", "RETAIL")).toBe(true);
    expect(canAdvanceState("PENDING", "FINANCE", "RETAIL")).toBe(true);
    expect(canAdvanceState("PENDING", "ADMIN", "RETAIL")).toBe(true);
  });

  it("keeps the warehouse and sales agents out of pricing", () => {
    expect(canAdvanceState("PENDING", "WAREHOUSE", "RETAIL")).toBe(false);
    expect(canAdvanceState("PENDING", "AGENT", "RETAIL")).toBe(false);
  });
});

describe("canAdvanceState — wholesale", () => {
  it("restricts approval to an admin", () => {
    expect(canAdvanceState("PENDING", "ADMIN", "WHOLESALE")).toBe(true);
    // Finance can approve retail pricing but not a wholesale order (Phase 2 rule).
    expect(canAdvanceState("PENDING", "FINANCE", "WHOLESALE")).toBe(false);
    expect(canAdvanceState("PENDING", "CASHIER", "WHOLESALE")).toBe(false);
  });

  it("hands an approved order to the till, not the warehouse", () => {
    expect(canAdvanceState("APPROVED", "CASHIER", "WHOLESALE")).toBe(true);
    expect(canAdvanceState("APPROVED", "WAREHOUSE", "WHOLESALE")).toBe(false);
  });
});

describe("canAdvanceState — shared steps", () => {
  it("lets the till settle an order awaiting payment", () => {
    expect(canAdvanceState("AWAITING_PAYMENT", "CASHIER")).toBe(true);
    expect(canAdvanceState("AWAITING_PAYMENT", "ADMIN")).toBe(true);
  });

  it("keeps the warehouse away from an unsettled order", () => {
    // The warehouse cannot advance it, and cannot pick it — payment comes first.
    expect(canAdvanceState("AWAITING_PAYMENT", "WAREHOUSE")).toBe(false);
  });

  it("lets the warehouse prepare only once paid", () => {
    expect(canAdvanceState("PAID", "WAREHOUSE")).toBe(true);
    expect(canAdvanceState("PAID", "ADMIN")).toBe(true);
    expect(canAdvanceState("PAID", "CASHIER")).toBe(false);
  });

  it("lets the warehouse dispatch a prepared order", () => {
    expect(canAdvanceState("PREPARING", "WAREHOUSE")).toBe(true);
    expect(canAdvanceState("PREPARING", "CASHIER")).toBe(false);
  });

  it("lets warehouse or finance confirm delivery", () => {
    expect(canAdvanceState("SHIPPED", "WAREHOUSE")).toBe(true);
    expect(canAdvanceState("SHIPPED", "FINANCE")).toBe(true);
  });

  it("returns false for terminal states", () => {
    const roles: Role[] = ["ADMIN", "FINANCE", "WAREHOUSE", "AGENT", "CASHIER"];
    for (const role of roles) {
      expect(canAdvanceState("DELIVERED", role)).toBe(false);
      expect(canAdvanceState("CANCELLED", role)).toBe(false);
    }
  });
});

describe("nextOrderState", () => {
  it("walks the retail path", () => {
    expect(nextOrderState("PENDING", "RETAIL")).toBe("AWAITING_PAYMENT");
    expect(nextOrderState("AWAITING_PAYMENT", "RETAIL")).toBe("PAID");
    expect(nextOrderState("PAID", "RETAIL")).toBe("PREPARING");
    expect(nextOrderState("PREPARING", "RETAIL")).toBe("SHIPPED");
    expect(nextOrderState("SHIPPED", "RETAIL")).toBe("DELIVERED");
  });

  it("walks the wholesale path, which adds approval at the front", () => {
    expect(nextOrderState("PENDING", "WHOLESALE")).toBe("APPROVED");
    expect(nextOrderState("APPROVED", "WHOLESALE")).toBe("AWAITING_PAYMENT");
    expect(nextOrderState("AWAITING_PAYMENT", "WHOLESALE")).toBe("PAID");
    expect(nextOrderState("PAID", "WHOLESALE")).toBe("PREPARING");
  });

  it("never routes an order to the warehouse before payment", () => {
    for (const channel of ["RETAIL", "WHOLESALE"] as const) {
      expect(nextOrderState("AWAITING_PAYMENT", channel)).not.toBe("PREPARING");
    }
  });

  it("returns null for terminal states", () => {
    expect(nextOrderState("DELIVERED")).toBeNull();
    expect(nextOrderState("CANCELLED")).toBeNull();
  });
});
