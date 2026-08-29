"use server";

import { num } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { nextCode } from "@/lib/ids";

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

  await prisma.$transaction([
    prisma.stockMove.create({
      data: {
        skuId: stock.skuId,
        warehouseId: stock.warehouseId,
        type: "RECEIPT",
        qty,
        costPerUnit: costPerUnit ?? 0,
        ref: ref || null,
        note: note || null,
        by: session.user.name ?? session.user.email,
      },
    }),
    prisma.stock.update({
      where: { id: stockId },
      data: { onHand: { increment: qty } },
    }),
  ]);

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

  const stock = await prisma.stock.findUniqueOrThrow({ where: { id: stockId } });
  if (num(stock.onHand) + delta < 0) throw new Error("Adjustment would result in negative stock");

  await prisma.$transaction([
    prisma.stockMove.create({
      data: {
        skuId: stock.skuId,
        warehouseId: stock.warehouseId,
        type: "ADJUSTMENT",
        qty: delta,
        costPerUnit: 0,
        note,
        by: session.user.name ?? session.user.email,
      },
    }),
    prisma.stock.update({
      where: { id: stockId },
      data: { onHand: { increment: delta } },
    }),
  ]);

  revalidatePath("/inventory");
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

  const from = await prisma.stock.findUniqueOrThrow({ where: { id: stockId } });
  if (from.warehouseId === toWarehouseId) throw new Error("Source and destination warehouse must be different");

  const available = num(from.onHand) - num(from.reserved);
  if (available < qty) throw new Error(`Only ${available} units available (on hand minus reserved)`);

  await prisma.$transaction(async tx => {
    // Deduct from source
    await tx.stock.update({
      where: { id: stockId },
      data: { onHand: { decrement: qty } },
    });
    await tx.stockMove.create({
      data: {
        skuId: from.skuId, warehouseId: from.warehouseId,
        type: "TRANSFER", qty: -qty,
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
    await tx.stockMove.create({
      data: {
        skuId: from.skuId, warehouseId: toWarehouseId,
        type: "TRANSFER", qty: +qty,
        note: note ? `Transfer from warehouse: ${note}` : "Transfer in",
        by: session.user.name ?? session.user.email,
      },
    });
  });

  revalidatePath("/inventory");
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
    include: { sku: { select: { unitPrice: true, name: true } } },
  });

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
              { code: "5001", dr: lossValue, cr: 0          }, // Loss on inventory write-off
              { code: "1300", dr: 0,          cr: lossValue  }, // Merchandise inventory
            ],
          },
        },
      });
    }
  });

  revalidatePath("/inventory");
  revalidatePath("/ledger");
}
