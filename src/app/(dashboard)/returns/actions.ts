"use server";

import { num } from "@/lib/utils";
import { inventoryAccountFor, COGS_ACCOUNT } from "@/lib/coa";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { Disposition } from "@prisma/client";
import { hasActiveReliefGrant } from "@/lib/reliever";
import { nextCode } from "@/lib/ids";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");
  return session;
}

// WAREHOUSE/ADMIN, or an active WAREHOUSE reliever (item 11).
async function isWarehouseAllowed(session: { user: { id: string; role: string } }) {
  if (["WAREHOUSE", "ADMIN"].includes(session.user.role)) return true;
  return hasActiveReliefGrant(session.user.id, "WAREHOUSE");
}

const CreateReturnSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(1),
  notes: z.string().optional(),
  lines: z.array(z.object({
    skuId: z.string().min(1),
    name: z.string(),
    qtyRequested: z.number().int().positive(),
    disposition: z.enum(["RESTOCK", "SCRAP"]),
  })).min(1),
});

export async function createReturn(input: z.infer<typeof CreateReturnSchema>) {
  const session = await requireSession();
  if (!["AGENT", "FINANCE", "ADMIN", "WAREHOUSE"].includes(session.user.role)) throw new Error("Forbidden");

  const data = CreateReturnSchema.parse(input);

  // Validate order exists and is DELIVERED
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: data.orderId },
    include: { lines: true },
  });
  if (order.state !== "DELIVERED") throw new Error("Returns can only be requested for delivered orders");

  // Validate quantities don't exceed original order lines
  for (const line of data.lines) {
    const orderLine = order.lines.find(l => l.skuId === line.skuId);
    if (!orderLine) throw new Error(`SKU not found in original order`);
    if (line.qtyRequested > num(orderLine.qty)) {
      throw new Error(`Cannot return more than ordered qty for "${line.name}"`);
    }
  }

  const returnId = await nextCode("RET", (since) => prisma.returnRequest.count({ where: { createdAt: { gte: since } } }));

  const ret = await prisma.returnRequest.create({
    data: {
      id: returnId,
      orderId: data.orderId,
      reason: data.reason,
      notes: data.notes,
      lines: {
        create: data.lines.map(l => ({
          skuId: l.skuId,
          name: l.name,
          qtyRequested: l.qtyRequested,
          disposition: l.disposition as Disposition,
        })),
      },
    },
  });

  revalidatePath("/returns");
  revalidatePath(`/orders/${data.orderId}`);
  return ret.id;
}

export async function rejectReturn(returnId: string, reason: string) {
  const session = await requireSession();
  if (!["FINANCE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");
  if (!reason?.trim()) throw new Error("Rejection reason is required");

  const ret = await prisma.returnRequest.findUniqueOrThrow({ where: { id: returnId } });
  if (!["REQUESTED", "APPROVED"].includes(ret.status))
    throw new Error("Can only reject REQUESTED or APPROVED returns");

  await prisma.returnRequest.update({
    where: { id: returnId },
    data: { status: "REJECTED", rejectedReason: reason.trim() },
  });

  revalidatePath("/returns");
}

export async function approveReturn(returnId: string) {
  const session = await requireSession();
  if (!["FINANCE", "ADMIN", "WAREHOUSE"].includes(session.user.role)) throw new Error("Forbidden");

  await prisma.returnRequest.update({
    where: { id: returnId },
    data: { status: "APPROVED" },
  });

  revalidatePath("/returns");
}

export async function receiveReturn(returnId: string, lines: { id: string; qtyReceived: number; lotNumber?: string; expiryDate?: string }[]) {
  const session = await requireSession();
  if (!(await isWarehouseAllowed(session))) throw new Error("Forbidden");

  const ret = await prisma.returnRequest.findUniqueOrThrow({
    where: { id: returnId },
    include: { lines: true, order: { select: { warehouseId: true, customerId: true } } },
  });

  if (ret.status !== "APPROVED") throw new Error("Return must be approved before receiving");

  const warehouseId = ret.order.warehouseId;

  // Fetch original order line prices for credit note calculation
  const orderLines = await prisma.orderLine.findMany({
    where: { orderId: ret.orderId },
    select: { skuId: true, unitPrice: true },
  });
  const priceMap = new Map(orderLines.map(l => [l.skuId, Number(l.unitPrice)]));

  // What the returned goods actually COST us, from the frozen allocations written at
  // delivery. A line may have spanned several cost layers, so this is the average the
  // line genuinely bore — not the current price of the SKU, and not a guess.
  const costedLines = await prisma.orderLine.findMany({
    where: { orderId: ret.orderId },
    select: { skuId: true, lots: { select: { qtyTaken: true, costTotal: true } } },
  });
  const unitCostMap = new Map(
    costedLines.map(l => {
      const qty = l.lots.reduce((s, x) => s + num(x.qtyTaken), 0);
      const cost = l.lots.reduce((s, x) => s + num(x.costTotal), 0);
      return [l.skuId, qty > 0 ? cost / qty : 0];
    })
  );

  const warehouse = await prisma.warehouse.findUniqueOrThrow({
    where: { id: warehouseId },
    select: { code: true },
  });
  const inventoryCode = inventoryAccountFor(warehouse.code);

  // Value of goods going back on the shelf. Only RESTOCK re-enters inventory; scrapped
  // goods stay in cost of sales, which is where the loss belongs.
  let restockedCost = 0;
  for (const input of lines) {
    const retLine = ret.lines.find(l => l.id === input.id);
    if (!retLine || input.qtyReceived <= 0 || retLine.disposition !== "RESTOCK") continue;
    restockedCost += input.qtyReceived * (unitCostMap.get(retLine.skuId) ?? 0);
  }
  const restockedCostRounded = Math.round(restockedCost * 100) / 100;

  // Compute credit amounts based on actually received quantities
  let totalSubtotal = 0;
  for (const input of lines) {
    const retLine = ret.lines.find(l => l.id === input.id);
    if (!retLine || input.qtyReceived <= 0) continue;
    totalSubtotal += input.qtyReceived * (priceMap.get(retLine.skuId) ?? 0);
  }
  const totalSubtotalRounded = Math.round(totalSubtotal * 100) / 100;
  const totalVat             = Math.round(totalSubtotal * 0.12 * 100) / 100;
  const totalCr              = Math.round((totalSubtotalRounded + totalVat) * 100) / 100;
  const jeId = await nextCode("JE", (since) => prisma.journalEntry.count({ where: { createdAt: { gte: since } } }));
  // Reserved with an offset: both entries are written in one transaction, and nextCode
  // derives its sequence from a row count, so an unoffset second call returns the same id.
  const cogsReversalJeId = await nextCode("JE", async (since) =>
    (await prisma.journalEntry.count({ where: { createdAt: { gte: since } } })) +
    (totalSubtotalRounded > 0 ? 1 : 0)
  );

  await prisma.$transaction(async tx => {
    for (const input of lines) {
      const line = ret.lines.find(l => l.id === input.id);
      if (!line || input.qtyReceived <= 0) continue;

      await tx.returnLine.update({
        where: { id: input.id },
        data: {
          qtyReceived: input.qtyReceived,
          returnLotNumber: input.lotNumber?.trim() || null,
          returnExpiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        },
      });

      // RESTOCK: return goods to available inventory
      if (line.disposition === "RESTOCK") {
        await tx.stock.upsert({
          where: { skuId_warehouseId: { skuId: line.skuId, warehouseId } },
          update: { onHand: { increment: input.qtyReceived } },
          create: { skuId: line.skuId, warehouseId, onHand: input.qtyReceived, reserved: 0 },
        });
        // Restore the lot, carrying the cost the goods were sold at. Without unitCost
        // the layer defaulted to 0 and returned stock became free inventory — FIFO would
        // later consume it at no cost and report an impossible margin.
        const returnedUnitCost = unitCostMap.get(line.skuId) ?? 0;
        if (input.lotNumber?.trim()) {
          await tx.lot.upsert({
            where: { lotNumber_skuId_warehouseId: { lotNumber: input.lotNumber.trim(), skuId: line.skuId, warehouseId } },
            update: { remainingQty: { increment: input.qtyReceived } },
            create: {
              lotNumber: input.lotNumber.trim(),
              skuId: line.skuId,
              warehouseId,
              receivedQty: input.qtyReceived,
              remainingQty: input.qtyReceived,
              unitCost: returnedUnitCost,
              receivedAt: new Date(),
              expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
            },
          });
        } else {
          // No lot number given by the warehouse — still create a layer, or the stock
          // row and the cost layers drift apart and FIFO cannot see the returned goods.
          await tx.lot.create({
            data: {
              lotNumber: `RET-${returnId}-${line.id.slice(-4)}`,
              skuId: line.skuId,
              warehouseId,
              receivedQty: input.qtyReceived,
              remainingQty: input.qtyReceived,
              unitCost: returnedUnitCost,
              receivedAt: new Date(),
            },
          });
        }
      }
      // SCRAP: goods are defective/destroyed — no inventory movement, loss absorbed

      await tx.stockMove.create({
        data: {
          skuId: line.skuId,
          warehouseId,
          type: "RETURN",
          qty: input.qtyReceived,
          ref: returnId,
          note: `Return ${returnId} — ${line.disposition}`,
          by: session.user.id,
        },
      });
    }

    await tx.returnRequest.update({
      where: { id: returnId },
      data: { status: "RECEIVED" },
    });

    // Credit note journal entry (same for both RESTOCK and SCRAP — customer always gets credit)
    if (totalSubtotalRounded > 0) {
      await tx.journalEntry.create({
        data: {
          id: jeId,
          source: "AR",
          ref: returnId,
          memo: `Credit note — Return ${returnId} (Order ${ret.orderId})`,
          postedById: session.user.id,
          lines: {
            create: [
              // 4900 / 2100 / 1100 are the real chart-of-accounts codes. This previously
              // posted to 4001 / 2001 / 1101, none of which exist in the COA — so a
              // credit note never actually reduced the customer's receivable.
              { code: "4900", dr: totalSubtotalRounded, cr: 0         }, // Sales Returns & Allowances
              { code: "2100", dr: totalVat,              cr: 0         }, // Output VAT reversal
              { code: "1100", dr: 0,                     cr: totalCr   }, // Accounts Receivable — Trade
            ],
          },
        },
      });
      await tx.returnRequest.update({
        where: { id: returnId },
        data: { creditNoteRef: jeId },
      });
    }

    // Cost side of a restock. The credit note reverses the SALE; without this the goods
    // sat back on the shelf while their cost stayed in cost of sales, overstating COGS
    // and understating inventory by the cost of everything ever returned.
    // Scrapped goods get no entry — they never re-enter inventory, so the cost correctly
    // stays where it is.
    if (restockedCostRounded > 0) {
      await tx.journalEntry.create({
        data: {
          id: cogsReversalJeId,
          source: "INV",
          ref: returnId,
          memo: `Restocked returns — Return ${returnId} (Order ${ret.orderId})`,
          postedById: session.user.id,
          lines: {
            create: [
              { code: inventoryCode, dr: restockedCostRounded, cr: 0                    },
              { code: COGS_ACCOUNT,  dr: 0,                    cr: restockedCostRounded },
            ],
          },
        },
      });
    }
  });

  revalidatePath("/returns");
  revalidatePath("/inventory");
  revalidatePath("/ledger");
}

export async function closeReturn(returnId: string) {
  const session = await requireSession();
  if (!["FINANCE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");

  await prisma.returnRequest.update({
    where: { id: returnId },
    data: { status: "CLOSED" },
  });

  revalidatePath("/returns");
}

// Bulk-receive several APPROVED returns at once (item 15): a truck comes back to the
// warehouse with multiple returns, tagged in one pass. Each return is received at its full
// requested quantity per line — the per-line partial-quantity/lot entry still requires the
// single-return flow. Reuses receiveReturn's exact logic (stock/lot/credit-note) per return.
export async function receiveReturnsBulk(returnIds: string[]): Promise<{ received: number; skipped: string[] }> {
  const session = await requireSession();
  if (!(await isWarehouseAllowed(session))) throw new Error("Forbidden");

  let received = 0;
  const skipped: string[] = [];
  for (const id of returnIds) {
    const ret = await prisma.returnRequest.findUnique({ where: { id }, include: { lines: true } });
    if (!ret || ret.status !== "APPROVED") { skipped.push(id); continue; }
    const lines = ret.lines.map(l => ({ id: l.id, qtyReceived: num(l.qtyRequested) }));
    await receiveReturn(id, lines);
    received++;
  }

  revalidatePath("/returns");
  revalidatePath("/inventory");
  revalidatePath("/ledger");
  return { received, skipped };
}
