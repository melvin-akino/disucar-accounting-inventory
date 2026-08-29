/**
 * Stockpile (bulk) materials and the truck sizes they are sold in.
 *
 * The company receives sand, gravel and crush by the truckload — typically 18 m3 at a
 * total delivered cost — and sells it in smaller vessels ("mini-trucks") of around
 * 2.5 m3. A vessel is a catalog item the salesperson can put on an order like any other
 * product; it holds no stock itself and draws its volume from the pile it references.
 *
 * Pure functions with no Prisma import, so the actions and the tests share them.
 */

export type ItemKindValue = "PACKAGED" | "BULK" | "BULK_VESSEL";

export interface Dimensions {
  lengthM: number;
  widthM: number;
  heightM: number;
}

export interface BulkItem {
  id: string;
  name: string;
  itemKind: ItemKindValue;
  /** BULK_VESSEL only: the BULK item this vessel draws from. */
  bulkSourceId: string | null;
  /** BULK_VESSEL only: cubic metres drawn per vessel sold. */
  bulkVolumeM3: number | null;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
}

/** Volume in cubic metres, rounded to litres — the precision the qty columns hold. */
export function volumeFromDimensions(d: Dimensions): number {
  return Math.round(d.lengthM * d.widthM * d.heightM * 1000) / 1000;
}

/** "2.00 × 1.50 × 0.83 m" — shown next to a vessel wherever it is sold. */
export function formatDimensions(item: {
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
}): string | null {
  const { lengthM, widthM, heightM } = item;
  if (lengthM === null || widthM === null || heightM === null) return null;
  const f = (n: number) => n.toFixed(2);
  return `${f(lengthM)} × ${f(widthM)} × ${f(heightM)} m`;
}

/** "Mini-Truck 2.5 m³ (2.00 × 1.50 × 0.83 m)" for pickers and printed documents. */
export function describeVessel(item: BulkItem): string {
  if (item.itemKind !== "BULK_VESSEL" || item.bulkVolumeM3 === null) return item.name;
  const dims = formatDimensions(item);
  const vol = `${item.bulkVolumeM3} m³`;
  return dims ? `${item.name} — ${vol} (${dims})` : `${item.name} — ${vol}`;
}

export interface StockDraw {
  /** The item whose Stock and Lot rows are actually affected. */
  skuId: string;
  /** Quantity in that item's own unit: pieces for packaged, cubic metres for bulk. */
  qty: number;
}

/**
 * Resolve an order line into the stock movement it causes.
 *
 * For packaged and bulk items the line is its own draw. For a vessel the line is a count
 * of trucks, and the draw is that count times the vessel's volume against the underlying
 * pile — 3 mini-trucks of 2.5 m3 draw 7.5 m3 of sand, and nothing is ever held against
 * the vessel SKU itself.
 */
export function resolveStockDraw(item: BulkItem, lineQty: number): StockDraw {
  if (item.itemKind !== "BULK_VESSEL") {
    return { skuId: item.id, qty: lineQty };
  }
  if (!item.bulkSourceId || item.bulkVolumeM3 === null) {
    throw new Error(
      `${item.name} is a truck size but has no stockpile material or volume configured.`
    );
  }
  return {
    skuId: item.bulkSourceId,
    qty: Math.round(lineQty * item.bulkVolumeM3 * 1000) / 1000,
  };
}

/**
 * Unit cost of a stockpile receipt: a truckload's total delivered cost spread over its
 * volume. 7,000 for 18 m3 is 388.8889/m3, which the Lot's 4-decimal cost column holds
 * without losing centavos across a full pile.
 */
export function bulkUnitCost(totalCost: number, volumeM3: number): number {
  if (volumeM3 <= 0) throw new Error("Truckload volume must be greater than zero.");
  return Math.round((totalCost / volumeM3) * 10000) / 10000;
}

/**
 * How many whole vessels a volume can fill, and what is left over.
 * Used to advise the salesperson: 7 m3 of sand is 2 full 2.5 m3 trucks with 2 m3 spare.
 */
export function vesselsForVolume(volumeM3: number, vesselVolumeM3: number): {
  whole: number;
  remainderM3: number;
} {
  if (vesselVolumeM3 <= 0) throw new Error("Vessel volume must be greater than zero.");
  const whole = Math.floor(volumeM3 / vesselVolumeM3);
  return {
    whole,
    remainderM3: Math.round((volumeM3 - whole * vesselVolumeM3) * 1000) / 1000,
  };
}

/** Validate a vessel definition before it is saved. */
export function validateVessel(item: {
  itemKind: ItemKindValue;
  bulkSourceId: string | null;
  bulkVolumeM3: number | null;
}): { ok: boolean; error?: string } {
  if (item.itemKind !== "BULK_VESSEL") return { ok: true };
  if (!item.bulkSourceId) {
    return { ok: false, error: "A truck size must reference the stockpile material it draws from." };
  }
  if (item.bulkVolumeM3 === null || item.bulkVolumeM3 <= 0) {
    return { ok: false, error: "A truck size must have a volume greater than zero." };
  }
  return { ok: true };
}
