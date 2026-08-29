import { describe, it, expect } from "vitest";
import { selectLotsFifo, totalAllocationCost } from "@/lib/order-logic";

const d = (iso: string) => new Date(iso);

// Cement received twice at different prices — the case this whole phase exists for.
const cementLots = [
  { id: "lot-a", remainingQty: 10, unitCost: 200, receivedAt: d("2026-01-05") },
  { id: "lot-b", remainingQty: 20, unitCost: 205, receivedAt: d("2026-01-12") },
];

describe("selectLotsFifo", () => {
  it("draws from the oldest layer first", () => {
    const alloc = selectLotsFifo(cementLots, 6);
    expect(alloc).toEqual([
      { lotId: "lot-a", take: 6, unitCost: 200, costTotal: 1200 },
    ]);
  });

  it("spans two layers and costs each slice at its own price", () => {
    const alloc = selectLotsFifo(cementLots, 15);
    expect(alloc).toEqual([
      { lotId: "lot-a", take: 10, unitCost: 200, costTotal: 2000 },
      { lotId: "lot-b", take: 5,  unitCost: 205, costTotal: 1025 },
    ]);
    // 3,025 — not 15 x 205 (3,075) and not 15 x an averaged 202.50 (3,037.50).
    expect(totalAllocationCost(alloc)).toBe(3025);
  });

  it("ignores receipt order in the input array", () => {
    const shuffled = [cementLots[1], cementLots[0]];
    expect(selectLotsFifo(shuffled, 12)[0].lotId).toBe("lot-a");
  });

  it("orders by receivedAt, not by insertion or id", () => {
    const backdated = [
      { id: "zzz", remainingQty: 5, unitCost: 100, receivedAt: d("2026-01-01") },
      { id: "aaa", remainingQty: 5, unitCost: 150, receivedAt: d("2026-02-01") },
    ];
    expect(selectLotsFifo(backdated, 5)[0].lotId).toBe("zzz");
  });

  it("breaks receivedAt ties deterministically by id", () => {
    const sameDay = [
      { id: "b", remainingQty: 5, unitCost: 210, receivedAt: d("2026-03-01") },
      { id: "a", remainingQty: 5, unitCost: 190, receivedAt: d("2026-03-01") },
    ];
    expect(selectLotsFifo(sameDay, 3)[0].lotId).toBe("a");
    expect(selectLotsFifo([...sameDay].reverse(), 3)[0].lotId).toBe("a");
  });

  it("skips exhausted layers", () => {
    const withEmpty = [
      { id: "empty", remainingQty: 0, unitCost: 100, receivedAt: d("2026-01-01") },
      ...cementLots,
    ];
    expect(selectLotsFifo(withEmpty, 4).map((a) => a.lotId)).toEqual(["lot-a"]);
  });

  it("consumes an entire layer exactly", () => {
    const alloc = selectLotsFifo(cementLots, 10);
    expect(alloc).toHaveLength(1);
    expect(alloc[0].take).toBe(10);
  });

  it("walks three layers when the order is large enough", () => {
    const three = [
      ...cementLots,
      { id: "lot-c", remainingQty: 8, unitCost: 212.5, receivedAt: d("2026-01-20") },
    ];
    const alloc = selectLotsFifo(three, 34);
    expect(alloc.map((a) => a.lotId)).toEqual(["lot-a", "lot-b", "lot-c"]);
    expect(totalAllocationCost(alloc)).toBe(2000 + 4100 + 850);
  });

  it("throws when open layers cannot cover the quantity", () => {
    expect(() => selectLotsFifo(cementLots, 31)).toThrow(/Insufficient lot stock/);
  });

  it("returns nothing for a zero or negative quantity", () => {
    expect(selectLotsFifo(cementLots, 0)).toEqual([]);
    expect(selectLotsFifo(cementLots, -5)).toEqual([]);
  });

  it("rounds fractional unit costs to centavos per slice", () => {
    // 7,000 for an 18 m3 truckload = 388.8888.../m3 — the Phase 4 bulk case.
    const bulk = [{ id: "pile", remainingQty: 18, unitCost: 7000 / 18, receivedAt: d("2026-01-01") }];
    const alloc = selectLotsFifo(bulk, 2.5);
    expect(alloc[0].costTotal).toBe(972.22);
  });
});

describe("totalAllocationCost", () => {
  it("is zero for no allocations", () => {
    expect(totalAllocationCost([])).toBe(0);
  });

  it("sums without accumulating float dust", () => {
    const alloc = [
      { lotId: "a", take: 3, unitCost: 0.1, costTotal: 0.3 },
      { lotId: "b", take: 3, unitCost: 0.2, costTotal: 0.6 },
    ];
    expect(totalAllocationCost(alloc)).toBe(0.9);
  });
});
