/**
 * Delivering an order: consuming its stock, drawing down cost layers, and recognising
 * the cost.
 *
 * This lives here rather than inside one feature's actions because there are three ways
 * to mark an order delivered — the order detail page, the warehouse board, and the
 * shipments screen. Two of them used to set the state directly and nothing else, so an
 * order delivered from the board never decremented stock, never drew down a lot, never
 * released its reservation and never posted COGS. Profit was overstated and the order
 * was invisible to the margin report. One implementation, called from all three.
 */

import { prisma } from "@/lib/prisma";
import { num } from "@/lib/utils";
import { nextCode } from "@/lib/ids";
import { resolveStockDraw } from "@/lib/bulk";
import { inventoryAccountFor, COGS_ACCOUNT } from "@/lib/coa";
import {
  selectLotsFifo,
  totalAllocationCost,
  validateLotPlan,
  costPlan,
  type CostedLotAllocation,
} from "@/lib/order-logic";

/**
 * Translate order lines into the stock they actually move.
 *
 * A packaged or bulk line moves its own SKU. A truck-size line moves the stockpile it
 * draws from: 3 mini-trucks of 2.5 m3 become 7.5 m3 against the sand, and nothing is
 * ever reserved or picked against the vessel SKU itself.
 *
 * Draws are merged per material, so two different truck sizes cut from the same pile
 * cannot each be reserved against the full quantity on hand.
 */
export async function resolveDraws(
  lines: { skuId: string; qty: unknown; name: string }[]
): Promise<{ skuId: string; qty: number; name: string }[]> {
  const items = await prisma.catalogItem.findMany({
    where: { id: { in: lines.map((l) => l.skuId) } },
    select: {
      id: true, name: true, itemKind: true, bulkSourceId: true,
      bulkVolumeM3: true, lengthM: true, widthM: true, heightM: true,
    },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const merged = new Map<string, { skuId: string; qty: number; name: string }>();
  for (const line of lines) {
    const item = itemMap.get(line.skuId);
    if (!item) throw new Error(`Unknown item on order line: ${line.name}`);

    const draw = resolveStockDraw(
      {
        id: item.id,
        name: item.name,
        itemKind: item.itemKind,
        bulkSourceId: item.bulkSourceId,
        bulkVolumeM3: item.bulkVolumeM3 === null ? null : num(item.bulkVolumeM3),
        lengthM: item.lengthM === null ? null : num(item.lengthM),
        widthM: item.widthM === null ? null : num(item.widthM),
        heightM: item.heightM === null ? null : num(item.heightM),
      },
      num(line.qty as number)
    );

    const existing = merged.get(draw.skuId);
    if (existing) {
      existing.qty = Math.round((existing.qty + draw.qty) * 1000) / 1000;
    } else {
      merged.set(draw.skuId, { skuId: draw.skuId, qty: draw.qty, name: line.name });
    }
  }
  return Array.from(merged.values());
}

/**
 * Consume stock for a delivered order: decrement the stock row, draw down cost layers
 * FIFO, and post the resulting COGS.
 *
 * Runs as one transaction. The stock decrement, the lot draw-down and the ledger posting
 * must not be able to succeed independently — a mid-way failure would otherwise leave
 * inventory credited with no matching COGS debit.
 *
 * Idempotent by refusing to run twice: an order that already carries allocations has
 * been consumed, and consuming it again would double-count both stock and cost.
 */
export async function consumeStockForDelivery(
  orderId: string,
  warehouseId: string,
  actorName: string,
  actorId: string
): Promise<void> {
  const [lines, warehouse] = await Promise.all([
    prisma.orderLine.findMany({ where: { orderId }, include: { plannedLots: true, lots: true } }),
    prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { code: true } }),
  ]);

  // Already consumed — three code paths reach delivery, and a retry after a partial
  // failure must not draw the stock down a second time.
  if (lines.some((l) => l.lots.length > 0)) return;

  const invAccount = inventoryAccountFor(warehouse.code);

  // Allocate before opening the transaction so an insufficient-stock error surfaces
  // without having written anything.
  const plan: {
    line: (typeof lines)[number];
    draw: { skuId: string; qty: number };
    allocations: CostedLotAllocation[];
  }[] = [];

  for (const line of lines) {
    // A truck-size line consumes cubic metres of its stockpile, not units of itself.
    const [draw] = await resolveDraws([line]);

    const lots = await prisma.lot.findMany({
      where: { skuId: draw.skuId, warehouseId, remainingQty: { gt: 0 }, status: "ACTIVE" },
    });
    const costed = lots.map((l) => ({
      id: l.id,
      remainingQty: num(l.remainingQty),
      unitCost: num(l.unitCost),
      receivedAt: l.receivedAt,
    }));

    // Honour the selection made at order entry when it is still satisfiable. Stock
    // moves between order entry and delivery — another order may have drained a layer,
    // or a lot may have been quarantined — so an unsatisfiable plan degrades to FIFO
    // rather than blocking the delivery.
    const planned = line.plannedLots.map((p) => ({ lotId: p.lotId, qty: num(p.qtyPlanned) }));
    const plannedUsable =
      planned.length > 0 && validateLotPlan(planned, costed, draw.qty).ok;

    const allocations = plannedUsable
      ? costPlan(planned, costed)
      : selectLotsFifo(costed, draw.qty);

    plan.push({ line, draw, allocations });
  }

  const cogsAmount = totalAllocationCost(plan.flatMap((p) => p.allocations));
  const journalId = cogsAmount > 0
    ? await nextCode("JE", (since) => prisma.journalEntry.count({ where: { createdAt: { gte: since } } }))
    : null;

  await prisma.$transaction(async (tx) => {
    for (const { line, draw, allocations } of plan) {
      await tx.stock.updateMany({
        where: { skuId: draw.skuId, warehouseId },
        data: {
          onHand: { decrement: draw.qty },
          reserved: { decrement: draw.qty },
        },
      });

      const lineCost = totalAllocationCost(allocations);
      await tx.stockMove.create({
        data: {
          skuId: draw.skuId,
          warehouseId,
          type: "PICK",
          qty: -draw.qty,
          costPerUnit: draw.qty > 0 ? lineCost / draw.qty : 0,
          ref: orderId,
          // Names the vessel sold as well as the material moved, so the stock ledger
          // still explains itself when the SKU on the move is not the SKU on the order.
          note: draw.skuId === line.skuId
            ? `Picked for order ${orderId}`
            : `Picked for order ${orderId} — ${line.name}`,
          by: actorName,
        },
      });

      for (const a of allocations) {
        await tx.lot.update({
          where: { id: a.lotId },
          data: { remainingQty: { decrement: a.take } },
        });
        // Traceability plus the frozen cost this order actually bore. A line spanning
        // two deliveries produces one row per layer, each at its own cost.
        await tx.orderLineLot.create({
          data: {
            orderLineId: line.id,
            lotId: a.lotId,
            qtyTaken: a.take,
            unitCost: a.unitCost,
            costTotal: a.costTotal,
          },
        });
      }
    }

    // COGS recognition. Account 5000 existed in the chart of accounts but nothing had
    // ever debited it, so reporting showed gross sales rather than margin.
    if (journalId && cogsAmount > 0) {
      await tx.journalEntry.create({
        data: {
          id: journalId,
          source: "INV",
          ref: orderId,
          memo: `COGS — order ${orderId}`,
          postedById: actorId,
          lines: {
            create: [
              { code: COGS_ACCOUNT, dr: cogsAmount, cr: 0 },
              { code: invAccount,   dr: 0,          cr: cogsAmount },
            ],
          },
        },
      });
    }
  });
}

/**
 * Mark a SHIPPED order delivered: set the state, record the event and the proof of
 * delivery, then consume the stock.
 *
 * The single entry point for delivery. The warehouse board and the shipments screen
 * previously each did the state change alone.
 */
export async function deliverOrder(
  orderId: string,
  actor: { id: string; name: string },
  podSignedBy?: string
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.state !== "SHIPPED") throw new Error("Order must be SHIPPED first");

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { state: "DELIVERED" } });
    await tx.orderEvent.create({
      data: {
        orderId,
        state: "DELIVERED",
        actorId: actor.id,
        note: podSignedBy ? `Delivered — signed by ${podSignedBy}` : "Delivered",
      },
    });
    if (podSignedBy) {
      await tx.shipment.updateMany({ where: { orderId }, data: { podSignedBy } });
    }
  });

  await consumeStockForDelivery(orderId, order.warehouseId, actor.name, actor.id);
}
