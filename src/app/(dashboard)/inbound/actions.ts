"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { BoDisposition, BoReasonType } from "@prisma/client";
import { hasActiveReliefGrant } from "@/lib/reliever";
import { nextCode } from "@/lib/ids";
import { inventoryAccountFor } from "@/lib/coa";
import { num } from "@/lib/utils";

async function requireAccess() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Forbidden");
  if (["WAREHOUSE", "ADMIN"].includes(session.user.role)) return session;
  // A WAREHOUSE reliever may receive POs / log B.O.s during their covered window (item 11).
  if (await hasActiveReliefGrant(session.user.id, "WAREHOUSE")) return session;
  throw new Error("Forbidden");
}

async function requireFinanceAccess() {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");
  return session;
}

function genPoId() {
  return nextCode("PO", (since) => prisma.inboundPO.count({ where: { createdAt: { gte: since } } }));
}

// ── Create PO ─────────────────────────────────────────────────────────────────
const CreatePoSchema = z.object({
  supplierId: z.string(),
  warehouseId: z.string(),
  expectedAt: z.string(),
  lines: z.array(z.object({ skuId: z.string(), qty: z.number().positive(), unitCost: z.number().min(0) })).min(1),
});

export async function createPO(input: z.infer<typeof CreatePoSchema>) {
  await requireAccess();
  const data = CreatePoSchema.parse(input);

  const total = data.lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const poId = await genPoId();

  await prisma.inboundPO.create({
    data: {
      id: poId,
      supplierId: data.supplierId,
      warehouseId: data.warehouseId,
      expectedAt: new Date(data.expectedAt),
      total,
      lines: {
        create: data.lines.map(l => ({ skuId: l.skuId, qty: l.qty, unitCost: l.unitCost })),
      },
    },
  });

  revalidatePath("/inbound");
}

// ── Update PO status ──────────────────────────────────────────────────────────
export async function updatePOStatus(id: string, status: "RECEIVING" | "DELAYED") {
  await requireAccess();
  await prisma.inboundPO.update({ where: { id }, data: { status } });
  revalidatePath("/inbound");
}

// ── Receive PO (mark received, update stock, create lots) ─────────────────────
const ReceivePoSchema = z.object({
  poId: z.string(),
  lines: z.array(z.object({
    lineId: z.string(),
    skuId: z.string(),
    accepted: z.number().min(0),
    damaged: z.number().min(0),
    lotNumber: z.string().optional(),
    expiryDate: z.string().optional(),
    // Landed cost for THIS receipt. Omitted means "same as agreed on the PO line".
    unitCost: z.number().min(0).optional(),
  })),
});

export async function receivePO(input: z.infer<typeof ReceivePoSchema>) {
  const session = await requireAccess();
  const { poId, lines } = ReceivePoSchema.parse(input);

  const po = await prisma.inboundPO.findUniqueOrThrow({
    where: { id: poId },
    include: { lines: { select: { id: true, unitCost: true } } },
  });
  const poLineCost = new Map(po.lines.map((l) => [l.id, Number(l.unitCost)]));

  await prisma.$transaction(async (tx) => {
    for (const l of lines) {
      await tx.inboundPOLine.update({
        where: { id: l.lineId },
        data: { accepted: l.accepted, damaged: l.damaged },
      });

      if (l.accepted > 0) {
        const unitCost = l.unitCost ?? poLineCost.get(l.lineId) ?? 0;

        await tx.stock.upsert({
          where: { skuId_warehouseId: { skuId: l.skuId, warehouseId: po.warehouseId } },
          create: { skuId: l.skuId, warehouseId: po.warehouseId, onHand: l.accepted },
          update: { onHand: { increment: l.accepted } },
        });

        await tx.stockMove.create({
          data: {
            skuId: l.skuId,
            warehouseId: po.warehouseId,
            type: "RECEIPT",
            qty: l.accepted,
            costPerUnit: unitCost,
            ref: poId,
            note: l.damaged > 0 ? `${l.damaged} damaged` : undefined,
            by: session.user.name ?? session.user.email,
          },
        });

        // One cost layer per receipt. Receiving used to merge into any lot sharing the
        // same number, which averaged away the price movement between deliveries — the
        // 200.00 and 205.00 cement became one indistinguishable pile and FIFO had
        // nothing to consume in order. An explicit lot number from the warehouse is
        // still honoured, but is suffixed when it collides with an existing layer so
        // each physical delivery keeps its own cost.
        const baseLotNum = l.lotNumber?.trim() || `LOT-${poId}`;
        const expiry = l.expiryDate ? new Date(l.expiryDate) : undefined;

        let lotNum = baseLotNum;
        for (let seq = 2; ; seq++) {
          const clash = await tx.lot.findFirst({
            where: { lotNumber: lotNum, skuId: l.skuId, warehouseId: po.warehouseId },
            select: { id: true },
          });
          if (!clash) break;
          lotNum = `${baseLotNum}-${seq}`;
        }

        await tx.lot.create({
          data: {
            lotNumber: lotNum,
            skuId: l.skuId,
            warehouseId: po.warehouseId,
            receivedQty: l.accepted,
            remainingQty: l.accepted,
            unitCost,
            receivedAt: new Date(),
            expiryDate: expiry,
            poId,
          },
        });
      }
    }

    await tx.inboundPO.update({ where: { id: poId }, data: { status: "RECEIVED" } });
  });

  revalidatePath("/inbound");
  revalidatePath("/inventory");
}

// ── Generate Reorder POs from low-stock items ──────────────────────────────────
export async function generateReorderPOs(warehouseId: string | "ALL") {
  const session = await requireAccess();

  const lowStocks = await prisma.stock.findMany({
    where: {
      ...(warehouseId !== "ALL" ? { warehouseId } : {}),
      reorderAt: { not: null },
    },
    include: {
      sku: { select: { id: true, name: true, supplierId: true } },
    },
  });

  const needReorder = lowStocks.filter(
    s => s.reorderAt != null && num(s.onHand) - num(s.reserved) <= s.reorderAt
  );

  if (needReorder.length === 0) return { created: 0 };

  // Group by supplierId
  const bySupplier = new Map<string, typeof needReorder>();
  for (const s of needReorder) {
    const key = s.sku.supplierId ?? "__none__";
    if (!bySupplier.has(key)) bySupplier.set(key, []);
    bySupplier.get(key)!.push(s);
  }

  let created = 0;
  for (const [supplierId, items] of Array.from(bySupplier)) {
    if (supplierId === "__none__") continue; // skip items with no supplier

    // genPoId() is async — concatenating it without awaiting produced the literal id
    // "[object Promise]-R0", and the second reorder run then collided on the primary key.
    const poId = `${await genPoId()}-R${created}`;
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + 7); // default 7-day lead time

    const whId = items[0].warehouseId;

    // Seed each line's cost from the most recent receipt of that SKU at this warehouse.
    // Left at 0 the PO carried no cost, and receiving it created a free cost layer that
    // FIFO would later consume at nothing — the reorder path silently poisoned costing.
    const lineData = await Promise.all(
      items.map(async (s) => {
        const lastLot = await prisma.lot.findFirst({
          where: { skuId: s.skuId, warehouseId: whId },
          orderBy: { receivedAt: "desc" },
          select: { unitCost: true },
        });
        return {
          skuId: s.skuId,
          qty: Math.max((s.maxLevel ?? s.reorderAt! * 2) - num(s.onHand), 1),
          unitCost: num(lastLot?.unitCost),
        };
      })
    );

    await prisma.inboundPO.create({
      data: {
        id: poId,
        supplierId,
        warehouseId: whId,
        expectedAt: expectedDate,
        status: "EXPECTED",
        total: lineData.reduce((sum, l) => sum + l.qty * l.unitCost, 0),
        lines: { create: lineData },
      },
    });
    created++;
  }

  revalidatePath("/inbound");
  revalidatePath("/inventory");
  return { created };
}

// ── Log a B.O. (backorder) against a PO line ───────────────────────────────────
const LogBackorderSchema = z.object({
  poId: z.string(),
  poLineId: z.string(),
  skuId: z.string(),
  warehouseId: z.string(),
  qty: z.number().positive(),
  costPerUnit: z.number().min(0),
  disposition: z.enum(["GOOD", "BAD"]),
  badReasonType: z.enum(["RAT_BITE", "DAMAGED_CONTAINER", "EXPIRED", "WRONG_ITEM", "SHORT_SHIP", "OTHER"]).optional(),
  badReasonNote: z.string().optional(),
}).refine(
  (d) => d.disposition !== "BAD" || !!d.badReasonType,
  { message: "badReasonType is required when disposition is BAD", path: ["badReasonType"] }
);

export async function logBackorder(input: z.infer<typeof LogBackorderSchema>) {
  const session = await requireAccess();
  const data = LogBackorderSchema.parse(input);

  const line = await prisma.inboundPOLine.findUniqueOrThrow({
    where: { id: data.poLineId },
    include: { backorders: true, po: { include: { warehouse: true } } },
  });

  const alreadyLogged = line.backorders.reduce((s, b) => s + num(b.qty), 0);
  const outstanding = num(line.damaged) - alreadyLogged;
  if (data.qty > outstanding) {
    throw new Error(`Cannot log ${data.qty} units — only ${outstanding} unit(s) of damaged qty remain unresolved on this line.`);
  }

  const disposition = data.disposition as BoDisposition;
  const badReasonType = data.badReasonType as BoReasonType | undefined;

  await prisma.$transaction(async (tx) => {
    await tx.backorderReturn.create({
      data: {
        poId: data.poId,
        poLineId: data.poLineId,
        skuId: data.skuId,
        warehouseId: data.warehouseId,
        qty: data.qty,
        costPerUnit: data.costPerUnit,
        disposition,
        badReasonType: disposition === "BAD" ? badReasonType : null,
        badReasonNote: data.badReasonNote,
        loggedById: session.user.id,
        loggedByName: session.user.name ?? session.user.email,
      },
    });

    if (disposition === "GOOD") {
      await tx.stock.upsert({
        where: { skuId_warehouseId: { skuId: data.skuId, warehouseId: data.warehouseId } },
        update: { onHand: { increment: data.qty } },
        create: { skuId: data.skuId, warehouseId: data.warehouseId, onHand: data.qty },
      });

      await tx.stockMove.create({
        data: {
          skuId: data.skuId,
          warehouseId: data.warehouseId,
          type: "RETURN",
          qty: data.qty,
          costPerUnit: data.costPerUnit,
          ref: `BO-${data.poId}`,
          note: `Good B.O. restock — PO ${data.poId}`,
          by: session.user.name ?? session.user.email,
        },
      });

      // Restocked B.O. goods form their own cost layer at the cost they were logged at,
      // for the same reason receiving no longer merges: a returned unit carries the cost
      // of its original delivery, not an average.
      const baseLotNum = `BO-${data.poId}`;
      let lotNum = baseLotNum;
      for (let seq = 2; ; seq++) {
        const clash = await tx.lot.findFirst({
          where: { lotNumber: lotNum, skuId: data.skuId, warehouseId: data.warehouseId },
          select: { id: true },
        });
        if (!clash) break;
        lotNum = `${baseLotNum}-${seq}`;
      }

      await tx.lot.create({
        data: {
          lotNumber: lotNum,
          skuId: data.skuId,
          warehouseId: data.warehouseId,
          receivedQty: data.qty,
          remainingQty: data.qty,
          unitCost: data.costPerUnit,
          receivedAt: new Date(),
          poId: data.poId,
        },
      });
    } else {
      // BAD: write off the cost — never enters sellable inventory
      const invAccount = inventoryAccountFor(line.po.warehouse.code);

      const amount = Math.round(data.qty * data.costPerUnit * 100) / 100;
      if (amount > 0) {
        const jeId = await nextCode("JE", (since) => prisma.journalEntry.count({ where: { createdAt: { gte: since } } }));
        await tx.journalEntry.create({
          data: {
            id: jeId,
            source: "INV",
            ref: data.poId,
            memo: `Bad B.O. write-off — PO ${data.poId} (${badReasonType})`,
            postedById: session.user.id,
            lines: {
              create: [
                { code: "5800", dr: amount, cr: 0 },
                { code: invAccount, dr: 0, cr: amount },
              ],
            },
          },
        });
      }
    }
  });

  revalidatePath("/inbound");
  revalidatePath("/inventory");
  revalidatePath("/ledger");
}

// ── Close a PO once payment and B.O. cost tally ────────────────────────────────
export async function closePO(poId: string) {
  const session = await requireFinanceAccess();

  const po = await prisma.inboundPO.findUniqueOrThrow({
    where: { id: poId },
    include: { lines: { include: { backorders: true, sku: true } }, bills: true },
  });

  if (po.closedAt) throw new Error(`PO ${poId} is already closed.`);

  for (const line of po.lines) {
    const logged = line.backorders.reduce((s, b) => s + num(b.qty), 0);
    if (logged !== num(line.damaged)) {
      throw new Error(
        `${num(line.damaged) - logged} unit(s) of ${line.sku.name} still unresolved — log a B.O. disposition for all damaged units before closing.`
      );
    }
  }

  if (po.bills.length === 0) {
    throw new Error(`No bill is linked to PO ${poId} yet — link the supplier's bill before closing.`);
  }
  const unpaid = po.bills.find(b => b.status !== "PAID");
  if (unpaid) {
    throw new Error(`Bill ${unpaid.id} is not fully paid (status: ${unpaid.status}) — payment must tally before closing.`);
  }

  await prisma.inboundPO.update({
    where: { id: poId },
    data: { closedAt: new Date(), closedById: session.user.id },
  });

  revalidatePath("/inbound");
  revalidatePath("/ledger");
}
