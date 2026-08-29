import { describe, it, expect } from "vitest";
import { orderTotal, vatOf, cwtOf, shortPeso, getMorningWindow } from "@/lib/utils";

describe("getMorningWindow", () => {
  it("returns midnight to 11:59:59.999 for a morning timestamp", () => {
    const { start, end } = getMorningWindow(new Date(2026, 6, 20, 9, 30, 0));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(end.getHours()).toBe(11);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });

  it("excludes noon itself", () => {
    const { end } = getMorningWindow(new Date(2026, 6, 20, 12, 0, 0));
    expect(end.getTime()).toBeLessThan(new Date(2026, 6, 20, 12, 0, 0).getTime());
  });

  it("returns the same day's window regardless of the time-of-day passed in", () => {
    const { start, end } = getMorningWindow(new Date(2026, 6, 20, 23, 45, 0));
    expect(start.getDate()).toBe(20);
    expect(end.getDate()).toBe(20);
  });

  it("start is always before end", () => {
    const { start, end } = getMorningWindow(new Date(2026, 6, 20, 0, 0, 1));
    expect(start.getTime()).toBeLessThan(end.getTime());
  });
});

describe("vatOf", () => {
  it("computes 12% VAT", () => {
    expect(vatOf(1000)).toBe(120);
  });

  it("respects custom rate", () => {
    expect(vatOf(1000, 0.05)).toBe(50);
  });
});

describe("cwtOf", () => {
  it("returns 0 when not applied", () => {
    expect(cwtOf(1000, 0.02, false)).toBe(0);
  });

  it("returns 2% when applied", () => {
    expect(cwtOf(1000, 0.02, true)).toBe(20);
  });
});

describe("orderTotal", () => {
  it("computes subtotal + VAT without CWT", () => {
    const { total } = orderTotal(1000, false);
    expect(total).toBe(1120);
  });

  it("computes subtotal + VAT - CWT with cwt2307", () => {
    const { total } = orderTotal(1000, true);
    expect(total).toBe(1100); // 1000 + 120 - 20
  });
});

describe("shortPeso", () => {
  it("formats millions", () => {
    expect(shortPeso(1_500_000)).toBe("₱1.5M");
  });

  it("formats thousands", () => {
    expect(shortPeso(12_500)).toBe("₱13K");
  });

  it("formats small values without suffix", () => {
    expect(shortPeso(500)).toBe("₱500");
  });
});
