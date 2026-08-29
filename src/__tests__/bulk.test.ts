import { describe, it, expect } from "vitest";
import {
  volumeFromDimensions,
  formatDimensions,
  describeVessel,
  resolveStockDraw,
  bulkUnitCost,
  vesselsForVolume,
  validateVessel,
  type BulkItem,
} from "@/lib/bulk";
import { selectLotsFifo, totalAllocationCost } from "@/lib/order-logic";

const sand: BulkItem = {
  id: "sand", name: "Washed Sand", itemKind: "BULK",
  bulkSourceId: null, bulkVolumeM3: null, lengthM: null, widthM: null, heightM: null,
};

const miniTruck: BulkItem = {
  id: "mt25", name: "Mini-Truck — Sand", itemKind: "BULK_VESSEL",
  bulkSourceId: "sand", bulkVolumeM3: 2.5, lengthM: 2, widthM: 1.5, heightM: 0.833,
};

const cement: BulkItem = {
  id: "cem", name: "Portland Cement 40kg", itemKind: "PACKAGED",
  bulkSourceId: null, bulkVolumeM3: null, lengthM: null, widthM: null, heightM: null,
};

describe("volumeFromDimensions", () => {
  it("multiplies L x W x H", () => {
    expect(volumeFromDimensions({ lengthM: 2, widthM: 1.5, heightM: 2 })).toBe(6);
  });

  it("rounds to litres", () => {
    expect(volumeFromDimensions({ lengthM: 2, widthM: 1.5, heightM: 0.8333 })).toBe(2.5);
  });
});

describe("formatDimensions / describeVessel", () => {
  it("formats the L x W x H the salesperson sees", () => {
    expect(formatDimensions(miniTruck)).toBe("2.00 × 1.50 × 0.83 m");
  });

  it("is null when dimensions are not set", () => {
    expect(formatDimensions(sand)).toBeNull();
  });

  it("describes a vessel with its volume and dimensions", () => {
    expect(describeVessel(miniTruck)).toBe("Mini-Truck — Sand — 2.5 m³ (2.00 × 1.50 × 0.83 m)");
  });

  it("leaves a non-vessel item's name alone", () => {
    expect(describeVessel(cement)).toBe("Portland Cement 40kg");
  });
});

describe("resolveStockDraw", () => {
  it("draws a packaged item against itself", () => {
    expect(resolveStockDraw(cement, 50)).toEqual({ skuId: "cem", qty: 50 });
  });

  it("draws bulk material against itself, in cubic metres", () => {
    expect(resolveStockDraw(sand, 7.5)).toEqual({ skuId: "sand", qty: 7.5 });
  });

  it("converts trucks into cubic metres of the pile they cut from", () => {
    // 3 mini-trucks is one order line of qty 3, drawing 7.5 m3 of sand.
    expect(resolveStockDraw(miniTruck, 3)).toEqual({ skuId: "sand", qty: 7.5 });
  });

  it("never holds stock against the vessel itself", () => {
    expect(resolveStockDraw(miniTruck, 1).skuId).toBe("sand");
  });

  it("refuses a vessel with no material configured", () => {
    const broken = { ...miniTruck, bulkSourceId: null };
    expect(() => resolveStockDraw(broken, 1)).toThrow(/no stockpile material/);
  });

  it("refuses a vessel with no volume", () => {
    const broken = { ...miniTruck, bulkVolumeM3: null };
    expect(() => resolveStockDraw(broken, 1)).toThrow(/no stockpile material or volume/);
  });
});

describe("bulkUnitCost", () => {
  it("spreads a truckload's cost over its volume", () => {
    // 7,000 delivered for 18 m3.
    expect(bulkUnitCost(7000, 18)).toBe(388.8889);
  });

  it("handles a clean division", () => {
    expect(bulkUnitCost(9000, 18)).toBe(500);
  });

  it("rejects a zero-volume load", () => {
    expect(() => bulkUnitCost(7000, 0)).toThrow(/greater than zero/);
  });
});

describe("vesselsForVolume", () => {
  it("reports whole trucks and the remainder", () => {
    // 7 m3 of sand is two full 2.5 m3 trucks with 2 m3 left over.
    expect(vesselsForVolume(7, 2.5)).toEqual({ whole: 2, remainderM3: 2 });
  });

  it("reports an exact fit with no remainder", () => {
    expect(vesselsForVolume(7.5, 2.5)).toEqual({ whole: 3, remainderM3: 0 });
  });

  it("reports zero whole trucks below one vessel", () => {
    expect(vesselsForVolume(2, 2.5)).toEqual({ whole: 0, remainderM3: 2 });
  });
});

describe("validateVessel", () => {
  it("accepts a fully configured vessel", () => {
    expect(validateVessel(miniTruck).ok).toBe(true);
  });

  it("does not constrain non-vessel items", () => {
    expect(validateVessel(cement).ok).toBe(true);
  });

  it("requires a source material", () => {
    const r = validateVessel({ ...miniTruck, bulkSourceId: null });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/stockpile material/);
  });

  it("requires a positive volume", () => {
    expect(validateVessel({ ...miniTruck, bulkVolumeM3: 0 }).ok).toBe(false);
  });
});

describe("stockpile FIFO end to end", () => {
  it("costs 3 mini-trucks across two truckloads received at different prices", () => {
    // Two deliveries of 18 m3: the first at 7,000, the second at 7,400.
    const lots = [
      { id: "load1", remainingQty: 6, unitCost: bulkUnitCost(7000, 18), receivedAt: new Date("2026-02-01") },
      { id: "load2", remainingQty: 18, unitCost: bulkUnitCost(7400, 18), receivedAt: new Date("2026-02-09") },
    ];

    // 3 trucks x 2.5 m3 = 7.5 m3, spanning both piles.
    const draw = resolveStockDraw(miniTruck, 3);
    expect(draw.qty).toBe(7.5);

    const alloc = selectLotsFifo(lots, draw.qty);
    expect(alloc).toHaveLength(2);
    expect(alloc[0]).toMatchObject({ lotId: "load1", take: 6 });
    expect(alloc[1]).toMatchObject({ lotId: "load2", take: 1.5 });

    // 6 x 388.8889 + 1.5 x 411.1111 = 2333.33 + 616.67
    expect(totalAllocationCost(alloc)).toBe(2950);
  });
});
