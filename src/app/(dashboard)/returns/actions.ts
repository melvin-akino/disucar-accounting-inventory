"use server";

import { num } from "@/lib/utils";
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
        // Upsert the Lot record to restore remainingQty
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
              expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
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
              { code: "4001", dr: totalSubtotalRounded, cr: 0         }, // Sales Returns & Allowances
              { code: "2001", dr: totalVat,              cr: 0         }, // Output VAT reversal
              { code: "1101", dr: 0,                     cr: totalCr   }, // Accounts Receivable
            ],
          },
        },
      });
      await tx.returnRequest.update({
        where: { id: returnId },
        data: { creditNoteRef: jeId },
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
