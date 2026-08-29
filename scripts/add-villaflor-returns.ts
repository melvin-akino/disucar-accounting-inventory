/**
 * One-off: Villaflor General Merchandise (C-2005) — 2 customer PO'd orders,
 * each with a full return lifecycle demonstrating the good/bad disposition.
 *
 *   PO001 (existing order SO-2026-0413) — GOOD return, disposition RESTOCK:
 *     5 of the 20 delivered cases come back sellable; credited and restocked.
 *   PO002 (new order SO-2026-0419)      — BAD return, disposition SCRAP:
 *     4 of 10 delivered cases come back defective; credited, loss absorbed,
 *     no inventory movement.
 *
 * Mirrors the real receiveReturn() action's writes exactly (Stock/Lot/StockMove/
 * credit-note JE), rather than shortcutting with raw status flips, so the books
 * and the Returns UI both reflect a genuine, fully worked lifecycle.
 *
 * Idempotent: every id is explicit and existence-checked.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const villaflor = await prisma.customer.findUniqueOrThrow({ where: { code: "C-2005" } });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@disucarsales.ph" } });
  const creamO = await prisma.catalogItem.findUniqueOrThrow({ where: { sku: "MND-CREAMO-316" } });

  // ── PO001: tag the existing delivered order ──────────────────────────────
  const po001Order = await prisma.order.findUniqueOrThrow({ where: { id: "SO-2026-0413" } });
  if (po001Order.poRef !== "PO001") {
    await prisma.order.update({ where: { id: "SO-2026-0413" }, data: { poRef: "PO001" } });
    console.log("SO-2026-0413 tagged poRef=PO001");
  }

  // ── PO002: a second Villaflor order, delivered, to return against ────────
  const po002Id = "SO-2026-0419";
  let po002Order = await prisma.order.findUnique({ where: { id: po002Id } });
  if (!po002Order) {
    const qty = 10, unitPrice = 696.00;
    const subtotal = qty * unitPrice; // 6960.00
    const vat = subtotal * 0.12;      // 835.20
    const total = subtotal + vat;     // 7795.20

    po002Order = await prisma.order.create({
      data: {
        id: po002Id,
        customerId: villaflor.id,
        agentId: admin.id,
        warehouseId: po001Order.warehouseId,
        poRef: "PO002",
        state: "DELIVERED",
        subtotal, vat, cwt: 0, total,
        lines: {
          create: [{
            skuId: creamO.id, name: creamO.name, unit: creamO.unit,
            qty, unitPrice, lineTotal: subtotal,
          }],
        },
        events: { create: { state: "DELIVERED", actorId: admin.id, note: "Seeded" } },
      },
    });
    console.log(`Created ${po002Id} (poRef=PO002), total=${total}`);

    // Invoice + AR/COGS journal entry, matching how the other delivered orders
    // in the seed were invoiced (generateInvoiceFromOrder's 12/112 VAT back-out,
    // 70% COGS-to-revenue ratio).
    const revPortion = subtotal;               // 6960.00 (no CWT on this order)
    const vatPortion = vat;                     // 835.20
    const cogs = Math.round(revPortion * 0.70 * 100) / 100; // 4872.00
    // Matches INVENTORY_ACCOUNT_BY_WAREHOUSE_CODE in src/app/(dashboard)/inbound/actions.ts
    const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { id: po001Order.warehouseId } });
    const invAcct = { MNL: "1200", CEB: "1210", DVO: "1220", URD: "1230" }[warehouse.code];
    if (!invAcct) throw new Error(`No inventory GL account for warehouse ${warehouse.code}`);

    await prisma.invoice.upsert({
      where: { id: "INV-2026-0419" },
      update: {},
      create: {
        id: "INV-2026-0419", customerId: villaflor.id, soId: po002Id,
        issued: new Date(), due: new Date(Date.now() + 30 * 86400_000),
        amount: total, paid: 0, status: "OPEN",
      },
    });
    await prisma.journalEntry.upsert({
      where: { id: "JE-2026-05-0419" },
      update: {},
      create: {
        id: "JE-2026-05-0419", date: new Date(), source: "AR",
        ref: po002Id, memo: "Sale to Villaflor General Merchandise — delivered",
        postedById: admin.id,
        lines: {
          create: [
            { code: "1100", dr: total,      cr: 0 },
            { code: "4000", dr: 0,           cr: revPortion },
            { code: "2100", dr: 0,           cr: vatPortion },
            { code: "5000", dr: cogs,        cr: 0 },
            { code: invAcct, dr: 0,          cr: cogs },
          ],
        },
      },
    });
    console.log("Invoiced + AR/COGS JE posted for", po002Id);
  }

  // ── Return #1 (PO001) — GOOD / RESTOCK ────────────────────────────────────
  const po001Line = await prisma.orderLine.findFirstOrThrow({ where: { orderId: "SO-2026-0413" } });
  await runReturnLifecycle({
    id: "RET-PO001",
    orderId: "SO-2026-0413",
    reason: "B.O. — good return (PO001)",
    notes: "Customer return, goods undamaged — restocked",
    skuId: po001Line.skuId,
    name: po001Line.name,
    qtyRequested: 5,
    disposition: "RESTOCK",
    warehouseId: po001Order.warehouseId,
    actorId: admin.id,
  });

  // ── Return #2 (PO002) — BAD / SCRAP ───────────────────────────────────────
  await runReturnLifecycle({
    id: "RET-PO002",
    orderId: po002Id,
    reason: "B.O. — bad return (PO002)",
    notes: "Customer return, goods damaged/defective — scrapped, no restock",
    skuId: creamO.id,
    name: creamO.name,
    qtyRequested: 4,
    disposition: "SCRAP",
    warehouseId: po002Order.warehouseId,
    actorId: admin.id,
  });

  console.log("Done.");
}

async function runReturnLifecycle(opts: {
  id: string; orderId: string; reason: string; notes: string;
  skuId: string; name: string; qtyRequested: number;
  disposition: "RESTOCK" | "SCRAP"; warehouseId: string; actorId: string;
}) {
  const existing = await prisma.returnRequest.findUnique({ where: { id: opts.id } });
  if (existing) {
    console.log(`${opts.id} already exists (status=${existing.status}) — skipping`);
    return;
  }

  // createReturn()
  const ret = await prisma.returnRequest.create({
    data: {
      id: opts.id,
      orderId: opts.orderId,
      reason: opts.reason,
      notes: opts.notes,
      status: "REQUESTED",
      lines: {
        create: [{
          skuId: opts.skuId, name: opts.name,
          qtyRequested: opts.qtyRequested, disposition: opts.disposition,
        }],
      },
    },
    include: { lines: true },
  });

  // approveReturn()
  await prisma.returnRequest.update({ where: { id: ret.id }, data: { status: "APPROVED" } });

  // receiveReturn() — mirrors src/app/(dashboard)/returns/actions.ts exactly
  const orderLine = await prisma.orderLine.findFirstOrThrow({
    where: { orderId: opts.orderId, skuId: opts.skuId },
    select: { unitPrice: true },
  });
  const unitPrice = Number(orderLine.unitPrice);
  const line = ret.lines[0];
  const qtyReceived = opts.qtyRequested; // full receipt, no shortage in this scenario

  const subtotal = Math.round(qtyReceived * unitPrice * 100) / 100;
  const vat = Math.round(subtotal * 0.12 * 100) / 100;
  const totalCr = Math.round((subtotal + vat) * 100) / 100;
  const jeId = `JE-RTN-${opts.id}`;

  await prisma.$transaction(async (tx) => {
    await tx.returnLine.update({ where: { id: line.id }, data: { qtyReceived } });

    if (opts.disposition === "RESTOCK") {
      await tx.stock.upsert({
        where: { skuId_warehouseId: { skuId: opts.skuId, warehouseId: opts.warehouseId } },
        update: { onHand: { increment: qtyReceived } },
        create: { skuId: opts.skuId, warehouseId: opts.warehouseId, onHand: qtyReceived, reserved: 0 },
      });
    }
    // SCRAP: no inventory movement — loss absorbed, matching receiveReturn()'s own comment.

    await tx.stockMove.create({
      data: {
        skuId: opts.skuId, warehouseId: opts.warehouseId, type: "RETURN",
        qty: qtyReceived, ref: ret.id,
        note: `Return ${ret.id} — ${opts.disposition}`,
        by: opts.actorId,
      },
    });

    await tx.returnRequest.update({ where: { id: ret.id }, data: { status: "RECEIVED" } });

    if (subtotal > 0) {
      await tx.journalEntry.create({
        data: {
          id: jeId, source: "AR", ref: ret.id,
          memo: `Credit note — Return ${ret.id} (Order ${opts.orderId})`,
          postedById: opts.actorId,
          lines: {
            create: [
              { code: "4001", dr: subtotal, cr: 0 },
              { code: "2001", dr: vat,      cr: 0 },
              { code: "1101", dr: 0,        cr: totalCr },
            ],
          },
        },
      });
      await tx.returnRequest.update({ where: { id: ret.id }, data: { creditNoteRef: jeId } });
    }
  });

  // closeReturn()
  await prisma.returnRequest.update({ where: { id: ret.id }, data: { status: "CLOSED" } });

  console.log(`${opts.id} (${opts.disposition}) — REQUESTED -> APPROVED -> RECEIVED -> CLOSED, credit ${totalCr}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
