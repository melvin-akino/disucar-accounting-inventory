import { describe, it, expect } from "vitest";
import { canAdvanceState, nextOrderState } from "@/lib/order-logic";
import type { OrderState, Role } from "@prisma/client";

describe("canAdvanceState", () => {
  it("allows FINANCE to approve PENDING order", () => {
    expect(canAdvanceState("PENDING", "FINANCE")).toBe(true);
  });

  it("allows ADMIN to approve PENDING order", () => {
    expect(canAdvanceState("PENDING", "ADMIN")).toBe(true);
  });

  it("blocks WAREHOUSE from approving PENDING order", () => {
    expect(canAdvanceState("PENDING", "WAREHOUSE")).toBe(false);
  });

  it("blocks AGENT from approving PENDING order", () => {
    expect(canAdvanceState("PENDING", "AGENT")).toBe(false);
  });

  it("allows WAREHOUSE to advance APPROVED → PREPARING", () => {
    expect(canAdvanceState("APPROVED", "WAREHOUSE")).toBe(true);
  });

  it("blocks FINANCE from advancing APPROVED → PREPARING", () => {
    expect(canAdvanceState("APPROVED", "FINANCE")).toBe(false);
  });

  it("allows WAREHOUSE to mark PREPARING → SHIPPED", () => {
    expect(canAdvanceState("PREPARING", "WAREHOUSE")).toBe(true);
  });

  it("allows WAREHOUSE and FINANCE to confirm SHIPPED → DELIVERED", () => {
    expect(canAdvanceState("SHIPPED", "WAREHOUSE")).toBe(true);
    expect(canAdvanceState("SHIPPED", "FINANCE")).toBe(true);
  });

  it("returns false for terminal states DELIVERED and CANCELLED", () => {
    const roles: Role[] = ["ADMIN", "FINANCE", "WAREHOUSE", "AGENT"];
    for (const role of roles) {
      expect(canAdvanceState("DELIVERED", role)).toBe(false);
      expect(canAdvanceState("CANCELLED", role)).toBe(false);
    }
  });
});

describe("nextOrderState", () => {
  it("returns correct next states for the happy path", () => {
    expect(nextOrderState("PENDING")).toBe("APPROVED");
    expect(nextOrderState("APPROVED")).toBe("PREPARING");
    expect(nextOrderState("PREPARING")).toBe("SHIPPED");
    expect(nextOrderState("SHIPPED")).toBe("DELIVERED");
  });

  it("returns null for terminal states", () => {
    expect(nextOrderState("DELIVERED")).toBeNull();
    expect(nextOrderState("CANCELLED")).toBeNull();
  });
});
