"use server";

import { num } from "@/lib/utils";
import { inventoryAccountFor } from "@/lib/coa";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { nextCode, jeId } from "@/lib/ids";
import { selectLotsFifo, totalAllocationCost } from "@/lib/order-logic";
import type { Prisma } from "@prisma/client";

// The transactional client Prisma hands to $transaction callbacks.
type TxClient = Prisma.TransactionClient;

/**
 * Cost layers open at a location, oldest receipt first.
 */
async function openLots(tx: TxClient, skuId: string, warehouseId: string) {
  const lots = await tx.lot.findMany({
    where: { skuId, warehouseId, remainingQty: { gt: 0 }, status: "ACTIVE" },
  });
  return lots.map((l) => ({
    id: l.id,
    remainingQty: num(l.remainingQty),
    unitCost: num(l.unitCost),
    receivedAt: l.receivedAt,
    lotNumber: l.lotNumber,
    expiryDate: l.expiryDate,
  }));
}

/**
 * Draw `qty` out of a location's cost layers, FIFO, and report what it cost.
 *
 * Stock quantity and cost layers used to move independently here: adjustments and
 * transfers changed Stock.onHand and never touched a Lot, so the two drifted apart
 * permanently and the drifted quantity had no cost attached to it at all.
 */
async function drawDownLots(
  tx: TxClient,
  skuId: string,
  warehouseId: string,
  qty: number
): Promise<{ cost: number; slices: { unitCost: number; take: number; lotNumber: string; expiryDate: Date | null }[] }> {
  const lots = await openLots(tx, skuId, warehouseId);
  const byId = new Map(lots.map((l) => [l.id, l]));

  const covered = lots.reduce((s, l) => s + l.remainingQty, 0);
  if (covered < qty) {
    // The stock row can only claim quantity its cost layers account for. Reaching here
    // means the two are already out of step — say so plainly rather than letting the
    // allocator's internal message surface, which reads like a stock shortage.
    throw new Error(
      `Cost layers only account for ${covered} of the ${qty} requested. ` +
      `The stock figure and its lots are out of step — receive or correct the lots first.`
    );
  }

  const allocations = selectLotsFifo(lots, qty);

  for (const a of allocations) {
    await tx.lot.update({
      where: { id: a.lotId },
      data: { remainingQty: { decrement: a.take } },
    });
  }

  return {
    cost: totalAllocationCost(allocations),
    slices: allocations.map((a) => ({
      unitCost: a.unitCost,
      take: a.take,
      lotNumber: byId.get(a.lotId)!.lotNumber,
      expiryDate: byId.get(a.lotId)!.expiryDate,
    })),
  };
}

/** Cost of the most recent receipt at a location — the best available default. */
async function lastKnownCost(skuId: string, warehouseId: string): Promise<number> {
  const lot = await prisma.lot.findFirst({
    where: { skuId, warehouseId },
    orderBy: { receivedAt: "desc" },
    select: { unitCost: true },
  });
  return num(lot?.unitCost);
}

async function requireAccess() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN"].includes(session.user.role)) {
    throw new Error("Forbidden");
  }
  return session;
}

// ── Receive stock (inbound) ───────────────────────────────────────────────────
export async function receiveStock(input: {
  stockId: string;
  qty: number;
  costPerUnit?: number;
  ref?: string;
  note?: string;
}) {
  const session = await requireAccess();
  const { stockId, qty, costPerUnit, ref, note } = z.object({
    stockId: z.string(),
    // Fractional for stockpile material measured in cubic metres.
    qty: z.number().positive(),
    costPerUnit: z.number().min(0).optional(),
    ref: z.string().optional(),
    note: z.string().optional(),
  }).parse(input);

  const stock = await prisma.stock.findUniqueOrThrow({ where: { id: stockId } });
  // Falls back to the last known cost rather than 0: an unpriced receipt used to become
  // a free cost layer that FIFO would later consume at nothing.
  const unitCost = costPerUnit ?? (await lastKnownCost(stock.skuId, stock.warehouseId));

  await prisma.$transaction(async (tx) => {
    await tx.stockMove.create({
      data: {
        skuId: stock.skuId,
        warehouseId: stock.warehouseId,
        type: "RECEIPT",
        qty,
        costPerUnit: unitCost,
        ref: ref || null,
        note: note || null,
        by: session.user.name ?? session.user.email,
      },
    });
    await tx.stock.update({
      where: { id: stockId },
      data: { onHand: { increment: qty } },
    });
    // A direct receipt creates its own cost layer, exactly as a PO receipt does.
    // Without this the stock row grew while the lots did not, and the extra quantity
    // was invisible to FIFO.
    await tx.lot.create({
      data: {
        lotNumber: `ADJ-${Date.now().toString(36).toUpperCase()}`,
        skuId: stock.skuId,
        warehouseId: stock.warehouseId,
        receivedQty: qty,
        remainingQty: qty,
        unitCost,
        receivedAt: new Date(),
      },
    });
  });

  revalidatePath("/inventory");
}

// ── Adjust stock (correction / stocktake) ────────────────────────────────────
export async function adjustStock(input: {
  stockId: string;
  delta: number;
  note: string;
}) {
  const session = await requireAccess();
  const { stockId, delta, note } = z.object({
    stockId: z.string(),
    delta: z.number(),
    note: z.string().min(1, "Note is required for adjustments"),
  }).parse(input);

  if (delta === 0) throw new Error("Delta cannot be zero");

  const stock = await prisma.stock.findUniqueOrThrow({
    where: { id: stockId },
    include: { warehouse: { select: { code: true } } },
  });
  if (num(stock.onHand) + delta < 0) throw new Error("Adjustment would result in negative stock");

  const inventoryCode = inventoryAccountFor(stock.warehouse.code);
  const unitCost = await lastKnownCost(stock.skuId, stock.warehouseId);
  const jeRef = await jeId();

  await prisma.$transaction(async (tx) => {
    // A stocktake correction moves cost as well as quantity. Shrinkage found on a count
    // must leave inventory and land in an expense account; a surplus does the reverse.
    let value: number;

    if (delta < 0) {
      const { cost } = await drawDownLots(tx, stock.skuId, stock.warehouseId, -delta);
      value = cost;
    } else {
      value = Math.round(delta * unitCost * 100) / 100;
      await tx.lot.create({
        data: {
          lotNumber: `ADJ-${Date.now().toString(36).toUpperCase()}`,
          skuId: stock.skuId,
          warehouseId: stock.warehouseId,
          receivedQty: delta,
          remainingQty: delta,
          unitCost,
          receivedAt: new Date(),
        },
      });
    }

    await tx.stockMove.create({
      data: {
        skuId: stock.skuId,
        warehouseId: stock.warehouseId,
        type: "ADJUSTMENT",
        qty: delta,
        costPerUnit: delta !== 0 ? Math.abs(value / delta) : 0,
        note,
        by: session.user.name ?? session.user.email,
      },
    });

    await tx.stock.update({
      where: { id: stockId },
      data: { onHand: { increment: delta } },
    });

    if (value > 0) {
      await tx.journalEntry.create({
        data: {
          id: jeRef,
          source: "INV",
          ref: stock.id,
          memo: `Stock adjustment (${delta > 0 ? "+" : ""}${delta}) — ${note}`,
          postedById: session.user.id,
          lines: {
            create: delta < 0
              // Shortage: value out of inventory, into shrinkage.
              ? [
                  { code: "5800",        dr: value, cr: 0     },
                  { code: inventoryCode, dr: 0,     cr: value },
                ]
              // Surplus found on a count: back into inventory, against the same expense.
              : [
                  { code: inventoryCode, dr: value, cr: 0     },
                  { code: "5800",        dr: 0,     cr: value },
                ],
          },
        },
      });
    }
  });

  revalidatePath("/inventory");
  revalidatePath("/ledger");
}

// ── Update reorder settings ───────────────────────────────────────────────────
export async function updateStockSettings(input: {
  stockId: string;
  reorderAt: number | null;
  maxLevel: number | null;
}) {
  await requireAccess();
  const { stockId, reorderAt, maxLevel } = z.object({
    stockId: z.string(),
    reorderAt: z.number().int().min(0).nullable(),
    maxLevel: z.number().int().min(0).nullable(),
  }).parse(input);

  await prisma.stock.update({
    where: { id: stockId },
    data: { reorderAt, maxLevel },
  });

  revalidatePath("/inventory");
}

// ── Initialize a stock row for a new SKU + warehouse ─────────────────────────
export async function initStockRow(skuId: string, warehouseId: string) {
  await requireAccess();

  await prisma.stock.upsert({
    where: { skuId_warehouseId: { skuId, warehouseId } },
    create: { skuId, warehouseId, onHand: 0, reserved: 0 },
    update: {},
  });

  revalidatePath("/inventory");
}

// ── Transfer stock between warehouses ────────────────────────────────────────
export async function transferStock(input: {
  stockId: string;
  toWarehouseId: string;
  qty: number;
  note?: string;
}) {
  const session = await requireAccess();
  const { stockId, toWarehouseId, qty, note } = z.object({
    stockId:       z.string(),
    toWarehouseId: z.string(),
    qty:           z.number().positive(),
    note:          z.string().optional(),
  }).parse(input);

  const from = await prisma.stock.findUniqueOrThrow({
    where: { id: stockId },
    include: { warehouse: { select: { code: true } } },
  });
  if (from.warehouseId === toWarehouseId) throw new Error("Source and destination warehouse must be different");

  const available = num(from.onHand) - num(from.reserved);
  if (available < qty) throw new Error(`Only ${available} units available (on hand minus reserved)`);

  const toWarehouse = await prisma.warehouse.findUniqueOrThrow({
    where: { id: toWarehouseId },
    select: { code: true },
  });
  const fromCode = inventoryAccountFor(from.warehouse.code);
  const toCode = inventoryAccountFor(toWarehouse.code);
  const jeRef = await jeId();

  await prisma.$transaction(async tx => {
    // Deduct from source, drawing the cost layers down FIFO. The goods carry their cost
    // with them: previously only Stock.onHand moved, so the destination received
    // quantity with no cost attached and the source kept layers for goods it no longer
    // held. Inventory value simply vanished at the point of transfer.
    const { cost, slices } = await drawDownLots(tx, from.skuId, from.warehouseId, qty);

    await tx.stock.update({
      where: { id: stockId },
      data: { onHand: { decrement: qty } },
    });
    await tx.stockMove.create({
      data: {
        skuId: from.skuId, warehouseId: from.warehouseId,
        type: "TRANSFER", qty: -qty,
        costPerUnit: qty > 0 ? cost / qty : 0,
        note: note ? `Transfer to warehouse: ${note}` : "Transfer out",
        by: session.user.name ?? session.user.email,
      },
    });

    // Add to destination (upsert — create stock row if it doesn't exist)
    await tx.stock.upsert({
      where: { skuId_warehouseId: { skuId: from.skuId, warehouseId: toWarehouseId } },
      update: { onHand: { increment: qty } },
      create: { skuId: from.skuId, warehouseId: toWarehouseId, onHand: qty, reserved: 0 },
    });

    // One layer per slice consumed, so a transfer spanning two costs arrives as two
    // layers rather than being averaged into one. receivedAt is carried over so the
    // goods keep their place in the destination's FIFO order.
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      await tx.lot.create({
        data: {
          lotNumber: `TRF-${jeRef}-${i + 1}`,
          skuId: from.skuId,
          warehouseId: toWarehouseId,
          receivedQty: slice.take,
          remainingQty: slice.take,
          unitCost: slice.unitCost,
          receivedAt: new Date(),
          expiryDate: slice.expiryDate,
        },
      });
    }

    await tx.stockMove.create({
      data: {
        skuId: from.skuId, warehouseId: toWarehouseId,
        type: "TRANSFER", qty: +qty,
        costPerUnit: qty > 0 ? cost / qty : 0,
        note: note ? `Transfer from warehouse: ${note}` : "Transfer in",
        by: session.user.name ?? session.user.email,
      },
    });

    // The two warehouses post to different inventory accounts, so a transfer is a real
    // ledger movement, not a no-op. Nothing was posted here at all before.
    if (cost > 0) {
      await tx.journalEntry.create({
        data: {
          id: jeRef,
          source: "INV",
          ref: from.skuId,
          memo: `Inter-warehouse transfer ${from.warehouse.code} → ${toWarehouse.code}${note ? ` — ${note}` : ""}`,
          postedById: session.user.id,
          lines: {
            create: [
              { code: toCode,   dr: cost, cr: 0    },
              { code: fromCode, dr: 0,    cr: cost },
            ],
          },
        },
      });
    }
  });

  revalidatePath("/inventory");
  revalidatePath("/ledger");
}

// ── Quarantine a lot (hold from sale, increment reserved) ─────────────────────
export async function quarantineLot(lotId: string, note: string) {
  await requireAccess();
  if (!note.trim()) throw new Error("Quarantine reason is required");

  const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId } });
  if (lot.status !== "ACTIVE") throw new Error("Only ACTIVE lots can be quarantined");
  if (num(lot.remainingQty) <= 0) throw new Error("Lot has no remaining quantity");

  await prisma.$transaction([
    prisma.lot.update({
      where: { id: lotId },
      data: { status: "QUARANTINED", quarantineNote: note.trim() },
    }),
    prisma.stock.update({
      where: { skuId_warehouseId: { skuId: lot.skuId, warehouseId: lot.warehouseId } },
      data: { reserved: { increment: lot.remainingQty } },
    }),
  ]);

  revalidatePath("/inventory");
}

// ── Release a quarantined lot back to ACTIVE ──────────────────────────────────
export async function releaseLot(lotId: string) {
  await requireAccess();

  const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId } });
  if (lot.status !== "QUARANTINED") throw new Error("Only QUARANTINED lots can be released");

  await prisma.$transaction([
    prisma.lot.update({
      where: { id: lotId },
      data: { status: "ACTIVE", quarantineNote: null },
    }),
    prisma.stock.update({
      where: { skuId_warehouseId: { skuId: lot.skuId, warehouseId: lot.warehouseId } },
      data: { reserved: { decrement: lot.remainingQty } },
    }),
  ]);

  revalidatePath("/inventory");
}

// ── Write off a lot (remove from stock, record loss JE) ───────────────────────
export async function writeOffLot(lotId: string, note: string) {
  const session = await requireAccess();
  if (!note.trim()) throw new Error("Write-off reason is required");

  const lot = await prisma.lot.findUniqueOrThrow({
    where: { id: lotId },
    include: {
      sku: { select: { unitPrice: true, name: true } },
      warehouse: { select: { code: true } },
    },
  });
  const inventoryCode = inventoryAccountFor(lot.warehouse.code);

  if (lot.status === "WRITTEN_OFF") throw new Error("Lot is already written off");
  if (num(lot.remainingQty) <= 0) throw new Error("Lot has no remaining quantity to write off");

  // Valued at the lot's own cost, not the selling price. Writing off at retail credited
  // the inventory asset for more than it was ever debited, overstating the loss by the
  // margin. The lot's cost is what the goods were carried at (Phase 1).
  const qty           = num(lot.remainingQty);
  const unitCost      = num(lot.unitCost);
  const lossValue     = Math.round(qty * unitCost * 100) / 100;
  const wasQuarantined = lot.status === "QUARANTINED";
  const jeId          = await nextCode("JE", (since) => prisma.journalEntry.count({ where: { createdAt: { gte: since } } }));

  await prisma.$transaction(async tx => {
    await tx.lot.update({
      where: { id: lotId },
      data: { status: "WRITTEN_OFF", remainingQty: 0, writeOffNote: note.trim(), writeOffRef: jeId },
    });

    await tx.stock.update({
      where: { skuId_warehouseId: { skuId: lot.skuId, warehouseId: lot.warehouseId } },
      data: {
        onHand: { decrement: qty },
        ...(wasQuarantined ? { reserved: { decrement: qty } } : {}),
      },
    });

    await tx.stockMove.create({
      data: {
        skuId: lot.skuId,
        warehouseId: lot.warehouseId,
        type: "ADJUSTMENT",
        qty: -qty,
        note: `Write-off lot ${lot.lotNumber}: ${note.trim()}`,
        by: session.user.name ?? session.user.email,
      },
    });

    if (lossValue > 0) {
      await tx.journalEntry.create({
        data: {
          id: jeId,
          source: "INV",
          ref: lot.lotNumber,
          memo: `Inventory write-off: ${lot.sku.name} — Lot ${lot.lotNumber} (${note.trim()})`,
          postedById: session.user.id,
          lines: {
            create: [
              // 5800 Inventory Shrinkage / B.O. Write-off, and the warehouse's own
              // inventory asset. These previously posted to 5001 and 1300: 5001 is not
              // in the chart of accounts at all, and 1300 is Prepaid Expenses — so the
              // loss never reached an expense account and inventory was never relieved.
              { code: "5800",         dr: lossValue, cr: 0         },
              { code: inventoryCode,  dr: 0,         cr: lossValue },
            ],
          },
        },
      });
    }
  });

  revalidatePath("/inventory");
  revalidatePath("/ledger");
}
