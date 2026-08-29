"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NEXT_STATE } from "@/types";
import type { OrderState } from "@prisma/client";
import { z } from "zod";
import { orderTotal, num } from "@/lib/utils";
import { getCustomerCredit } from "@/lib/credit";
import { sendOrderEmail } from "@/lib/email";
import { nextCode } from "@/lib/ids";
import {
  selectLotsFifo,
  totalAllocationCost,
  validateLotPlan,
  isFifoPlan,
  costPlan,
  type CostedLotAllocation,
} from "@/lib/order-logic";
import { writeAudit } from "@/lib/audit";
import { resolveStockDraw } from "@/lib/bulk";
import { inventoryAccountFor, COGS_ACCOUNT } from "@/lib/coa";
import { resolveUnitPrice, checkWholesaleMinimums, formatViolations, canApprove } from "@/lib/wholesale";

export { getCustomerCredit };

// ── Stock helpers ─────────────────────────────────────────────────────────────

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
async function resolveDraws(
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

async function reserveStock(orderId: string, warehouseId: string) {
  const lines = await prisma.orderLine.findMany({ where: { orderId } });
  const draws = await resolveDraws(lines);

  // Check availability first (onHand - reserved >= qty needed)
  for (const draw of draws) {
    const stock = await prisma.stock.findUnique({
      where: { skuId_warehouseId: { skuId: draw.skuId, warehouseId } },
    });
    const available = num(stock?.onHand) - num(stock?.reserved);
    if (available < draw.qty) {
      throw new Error(
        `Insufficient stock for "${draw.name}": ${available} available, ${draw.qty} needed. Adjust stock before approving.`
      );
    }
  }

  // All good — reserve
  await Promise.all(
    draws.map(draw =>
      prisma.stock.upsert({
        where: { skuId_warehouseId: { skuId: draw.skuId, warehouseId } },
        update: { reserved: { increment: draw.qty } },
        create: { skuId: draw.skuId, warehouseId, onHand: 0, reserved: draw.qty },
      })
    )
  );
}

async function releaseReservation(orderId: string, warehouseId: string) {
  const lines = await prisma.orderLine.findMany({ where: { orderId } });
  const draws = await resolveDraws(lines);
  await Promise.all(
    draws.map(draw =>
      prisma.stock.updateMany({
        where: { skuId: draw.skuId, warehouseId },
        data: { reserved: { decrement: draw.qty } },
      })
    )
  );
}

/**
 * Consume stock for a delivered order: decrement the stock row, draw down cost layers
 * FIFO, and post the resulting COGS.
 *
 * Runs as one transaction. Previously the stock decrement, the lot draw-down and (now)
 * the ledger posting were separate writes, so a mid-way failure could leave stock
 * decremented with lots untouched — and would now leave inventory credited with no
 * matching COGS debit.
 */
async function consumeStock(
  orderId: string,
  warehouseId: string,
  actorName: string,
  actorId: string
) {
  const [lines, warehouse] = await Promise.all([
    prisma.orderLine.findMany({ where: { orderId }, include: { plannedLots: true } }),
    prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { code: true } }),
  ]);
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

// ── Lot availability for order entry ──────────────────────────────────────────

export interface AvailableLot {
  id: string;
  lotNumber: string;
  remainingQty: number;
  unitCost: number;
  receivedAt: string;
  expiryDate: string | null;
  /** Quantity FIFO would draw from this lot for the requested qty; 0 if untouched. */
  fifoQty: number;
}

/**
 * Open cost layers for a SKU at a warehouse, oldest first, annotated with what FIFO
 * would take. The form renders these as the lot dropdown and pre-selects fifoQty.
 */
export async function getAvailableLots(
  skuId: string,
  warehouseId: string,
  neededQty: number
): Promise<AvailableLot[]> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");

  // A truck size has no lots of its own — show the stockpile it cuts from, and ask FIFO
  // about the cubic metres those trucks represent rather than the truck count.
  const [draw] = await resolveDraws([{ skuId, qty: neededQty, name: "" }]);

  const lots = await prisma.lot.findMany({
    where: { skuId: draw.skuId, warehouseId, remainingQty: { gt: 0 }, status: "ACTIVE" },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
  });

  const costed = lots.map((l) => ({
    id: l.id,
    remainingQty: num(l.remainingQty),
    unitCost: num(l.unitCost),
    receivedAt: l.receivedAt,
  }));

  // A short line is not an error here — the picker still lists what exists so the
  // salesperson can see how much is actually on hand.
  let fifo: Map<string, number>;
  try {
    fifo = new Map(selectLotsFifo(costed, draw.qty).map((a) => [a.lotId, a.take]));
  } catch {
    fifo = new Map();
  }

  return lots.map((l) => ({
    id: l.id,
    lotNumber: l.lotNumber,
    remainingQty: num(l.remainingQty),
    unitCost: num(l.unitCost),
    receivedAt: l.receivedAt.toISOString(),
    expiryDate: l.expiryDate ? l.expiryDate.toISOString() : null,
    fifoQty: fifo.get(l.id) ?? 0,
  }));
}

/**
 * Re-check wholesale minimums against the order's current lines.
 *
 * Creation-time validation is not sufficient on its own: lines can be edited on the
 * order view after submission, so an order that passed at creation can be under the
 * minimum by the time someone approves it. No-ops for retail orders.
 */
export async function assertWholesaleMinimumsStillMet(orderId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: { select: { skuId: true, qty: true } } },
  });
  if (order.channel !== "WHOLESALE") return;

  const [items, settings] = await Promise.all([
    prisma.catalogItem.findMany({
      where: { id: { in: order.lines.map((l) => l.skuId) } },
      select: { id: true, name: true, unitPrice: true, wholesalePrice: true, wholesaleMinQty: true },
    }),
    prisma.orgSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  const itemMap = new Map(
    items.map((i) => [
      i.id,
      {
        id: i.id,
        name: i.name,
        unitPrice: Number(i.unitPrice),
        wholesalePrice: i.wholesalePrice === null ? null : Number(i.wholesalePrice),
        wholesaleMinQty: i.wholesaleMinQty === null ? null : num(i.wholesaleMinQty),
      },
    ])
  );

  const violations = checkWholesaleMinimums(
    "WHOLESALE",
    order.lines.map((l) => ({ skuId: l.skuId, qty: num(l.qty) })),
    itemMap,
    {
      defaultMinQty: settings ? num(settings.wholesaleDefaultMinQty) : 1,
      minOrderTotal: settings ? Number(settings.wholesaleMinOrderTotal) : 0,
    },
    Number(order.total)
  );

  if (violations.length > 0) throw new Error(formatViolations(violations));
}

// ── Advance order state FSM ───────────────────────────────────────────────────
// Returns a result object rather than throwing for expected business-validation failures
// (e.g. insufficient stock): Next.js redacts thrown Server Action error messages in
// production builds, so user-facing validation messages must travel as return data instead.
export async function advanceOrderState(
  orderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const transition = NEXT_STATE[order.state as OrderState];
  if (!transition?.next) throw new Error("No next state");

  const userRole = session.user.role;
  if (!transition.roles.includes(userRole)) throw new Error("Forbidden");

  // Stock side-effects before the state update
  if (transition.next === "APPROVED") {
    // This is a second approval path alongside approveOrder() on the approvals screen.
    // Wholesale is ADMIN-only, so the narrower gate has to be applied here too or the
    // restriction would be trivially bypassed by advancing the order from its detail view.
    if (!canApprove(order.channel, userRole)) {
      return { ok: false, error: "Wholesale orders can only be approved by an Admin." };
    }
    try {
      await assertWholesaleMinimumsStillMet(orderId);
      await reserveStock(orderId, order.warehouseId);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { state: transition.next } }),
    prisma.orderEvent.create({
      data: {
        orderId,
        state: transition.next,
        actorId: session.user.id,
        note: transition.label,
      },
    }),
  ]);

  // Consume stock when delivered (decrement onHand + release reservation)
  if (transition.next === "DELIVERED") {
    await consumeStock(
      orderId,
      order.warehouseId,
      session.user.name ?? session.user.email ?? session.user.id,
      session.user.id
    );
  }

  // Email notification (non-blocking)
  const fullOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: { include: { users: { where: { active: true }, select: { email: true } } } } },
  });
  if (fullOrder) {
    sendOrderEmail(fullOrder.id, transition.next as OrderState, fullOrder.customer).catch(() => {});
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/inventory");

  return { ok: true };
}

// ── Cancel order ──────────────────────────────────────────────────────────────
export async function cancelOrder(orderId: string, reason: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.state === "DELIVERED" || order.state === "CANCELLED") {
    throw new Error("Cannot cancel order in this state");
  }

  // Release reservation if stock was already reserved
  if (["APPROVED", "PREPARING", "SHIPPED"].includes(order.state)) {
    await releaseReservation(orderId, order.warehouseId);
  }

  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { state: "CANCELLED" } }),
    prisma.orderEvent.create({
      data: {
        orderId,
        state: "CANCELLED",
        actorId: session.user.id,
        note: reason || "Cancelled",
      },
    }),
  ]);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/inventory");
}

// Warehouse-only: a truck comes back with a delivery that didn't complete (store closed,
// customer refused, etc.) — cancel the order and release its reserved stock. Scoped
// strictly to SHIPPED orders (unlike the general cancelOrder above, which has no
// server-side role gate at all — this one is deliberately locked down since it's meant
// to be called from the delivery-run reconciliation flow, not general order management).
export async function returnShipmentToWarehouse(orderId: string, note: string) {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.state !== "SHIPPED") throw new Error("Order is not in SHIPPED state");

  // consumeStock only runs on the DELIVERED transition, so a SHIPPED order's stock is
  // still sitting in `reserved`, never decremented from `onHand` — releasing the
  // reservation alone is correct, no additional onHand adjustment needed.
  await releaseReservation(orderId, order.warehouseId);

  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { state: "CANCELLED" } }),
    prisma.orderEvent.create({
      data: {
        orderId,
        state: "CANCELLED",
        actorId: session.user.id,
        note: note?.trim() || "Returned to warehouse — delivery did not complete",
      },
    }),
  ]);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/inventory");
  revalidatePath("/shipments");
}

// ── Apply / change discount on a created order (Finance/Admin, order view) ─────
// Either the customer's blanket % on every non-free line (CUSTOMER), a discretionary
// 1-3% per line (PRODUCT), or clear it (NONE). Recomputes each line's lineTotal and the
// order's vat/cwt/total from the discounted net; order.subtotal stays gross so the view can
// show a Discount row = subtotal − net.
const ApplyDiscountSchema = z.object({
  mode: z.enum(["NONE", "CUSTOMER", "PRODUCT"]),
  // Per-line pct for PRODUCT mode; each entry validated 1-3% server-side.
  lineDiscounts: z.array(z.object({
    orderLineId: z.string().min(1),
    discountPct: z.number().min(1).max(3),
  })).optional(),
});

export async function applyOrderDiscount(orderId: string, input: z.infer<typeof ApplyDiscountSchema>) {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");

  const data = ApplyDiscountSchema.parse(input);

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: true, customer: { select: { blanketDiscountPct: true } } },
  });
  if (["DELIVERED", "CANCELLED"].includes(order.state)) {
    throw new Error("Discounts can't be changed once the order is delivered or cancelled.");
  }

  const blanketPct = order.customer.blanketDiscountPct ? Number(order.customer.blanketDiscountPct) : 0;
  if (data.mode === "CUSTOMER" && blanketPct <= 0) {
    throw new Error("This customer has no blanket discount set.");
  }

  // Resolve the effective pct per line.
  const pctFor = (lineId: string, isFree: boolean): number => {
    if (isFree) return 0; // free items are never discounted
    if (data.mode === "NONE") return 0;
    if (data.mode === "CUSTOMER") return blanketPct;
    return data.lineDiscounts?.find(d => d.orderLineId === lineId)?.discountPct ?? 0;
  };

  const lineUpdates = order.lines.map(line => {
    const pct = pctFor(line.id, line.isFree);
    const gross = num(line.unitPrice) * num(line.qty);
    const lineTotal = Math.round(gross * (1 - pct / 100) * 100) / 100;
    return prisma.orderLine.update({
      where: { id: line.id },
      data: { lineTotal, discountPct: pct > 0 ? pct : null },
    });
  });

  // Gross subtotal (unchanged) and discounted net.
  const grossSubtotal = order.lines.reduce((s, l) => s + num(l.unitPrice) * num(l.qty), 0);
  const net = order.lines.reduce((s, l) => {
    const pct = pctFor(l.id, l.isFree);
    return s + Math.round(num(l.unitPrice) * num(l.qty) * (1 - pct / 100) * 100) / 100;
  }, 0);
  const { vat, cwt, total } = orderTotal(net, order.cwt2307);

  const discountAmt = Math.round((grossSubtotal - net) * 100) / 100;
  const note = data.mode === "NONE"
    ? "Discount removed"
    : data.mode === "CUSTOMER"
      ? `Customer blanket discount applied (${blanketPct}%, −${discountAmt.toLocaleString("en-PH", { minimumFractionDigits: 2 })})`
      : `Per-product discount applied (−${discountAmt.toLocaleString("en-PH", { minimumFractionDigits: 2 })})`;

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        discountMode: data.mode === "NONE" ? null : data.mode,
        subtotal: grossSubtotal,
        vat, cwt, total,
      },
    }),
    ...lineUpdates,
    prisma.orderEvent.create({
      data: { orderId, state: order.state, actorId: session.user.id, note },
    }),
  ]);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

// ── New order ─────────────────────────────────────────────────────────────────
const NewOrderSchema = z.object({
  customerId: z.string().min(1),
  warehouseId: z.string().min(1),
  cwt2307: z.boolean().default(false),
  notes: z.string().optional(),
  msrCode: z.string().optional(),
  discountMode: z.enum(["CUSTOMER", "PRODUCT"]).optional(),
  channel: z.enum(["RETAIL", "WHOLESALE"]).default("RETAIL"),
  lines: z.array(
    z.object({
      skuId: z.string().min(1),
      // Fractional for bulk material sold by volume; whole numbers for everything else.
      qty: z.number().positive(),
      // 0 is allowed for free items; negative is never valid.
      unitPrice: z.number().nonnegative(),
      isFree: z.boolean().default(false),
      discountPct: z.number().min(0).max(100).optional(),
      // Explicit lot selection. Omitted or empty means "use FIFO", which is what the
      // form submits unless the salesperson edited the pre-filled selection.
      lotPlan: z.array(z.object({ lotId: z.string().min(1), qty: z.number().positive() })).optional(),
      lotOverrideReason: z.string().optional(),
    })
  ).min(1),
});

// z.input, not z.infer: defaulted fields (channel, cwt2307, isFree) are optional for
// callers and filled in by parse(), which z.infer's output type would wrongly demand.
export async function createOrder(input: z.input<typeof NewOrderSchema>) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");

  const data = NewOrderSchema.parse(input);
  // discountMode is an Admin-only choice — silently drop it for anyone else rather than
  // trusting the client (the auto-fill math already happened client-side, but the mode
  // flag itself must not be recorded as if an Admin selected it).
  const discountMode = session.user.role === "ADMIN" ? data.discountMode : undefined;

  // Wholesale prices from the catalog, never from the client. The submitted unitPrice is
  // only honoured for retail (where discounts and free goods are applied on the form).
  const channel = data.channel;
  const pricedItems = await prisma.catalogItem.findMany({
    where: { id: { in: data.lines.map((l) => l.skuId) } },
    select: { id: true, name: true, unitPrice: true, wholesalePrice: true, wholesaleMinQty: true },
  });
  const pricedMap = new Map(
    pricedItems.map((i) => [
      i.id,
      {
        id: i.id,
        name: i.name,
        unitPrice: Number(i.unitPrice),
        wholesalePrice: i.wholesalePrice === null ? null : Number(i.wholesalePrice),
        wholesaleMinQty: i.wholesaleMinQty === null ? null : num(i.wholesaleMinQty),
      },
    ])
  );

  const linesWithPrice = data.lines.map((l) => {
    const item = pricedMap.get(l.skuId);
    if (channel === "WHOLESALE") {
      if (!item) throw new Error(`Unknown item ${l.skuId}.`);
      // Free goods stay free on either channel.
      return { ...l, unitPrice: l.isFree ? 0 : resolveUnitPrice(item, "WHOLESALE") };
    }
    return l;
  });

  const subtotal = linesWithPrice.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const { vat, cwt, total } = orderTotal(subtotal, data.cwt2307);

  // Minimums are enforced here and again at approval — lines can be edited in between.
  if (channel === "WHOLESALE") {
    const settings = await prisma.orgSettings.findUnique({ where: { id: "singleton" } });
    const violations = checkWholesaleMinimums(
      "WHOLESALE",
      linesWithPrice,
      pricedMap,
      {
        defaultMinQty: settings ? num(settings.wholesaleDefaultMinQty) : 1,
        minOrderTotal: settings ? Number(settings.wholesaleMinOrderTotal) : 0,
      },
      total
    );
    if (violations.length > 0) throw new Error(formatViolations(violations));
  }

  // Credit hold (3+ unpaid receipts) is informational only at creation time — it does not
  // block submission. It hard-blocks at approval instead (see approvals/actions.ts), where a
  // Finance/Admin override with a recorded reason is required. Amount-based credit limits no
  // longer gate order creation per Dominic's requirement ("not based on Amount, But by number
  // of Unpaid Receipts").

  const orderId = await nextCode("SO", (since) => prisma.order.count({ where: { createdAt: { gte: since } } }));

  const skuIds = data.lines.map((l) => l.skuId);
  const items = await prisma.catalogItem.findMany({ where: { id: { in: skuIds } } });
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));

  // ── Lot selection ───────────────────────────────────────────────────────────
  // Validated server-side: the picker's selection is a proposal, and a server action is
  // a public endpoint. A selection that differs from FIFO is recorded as an override
  // with its reason so the deviation is answerable later.
  const lotDecisions = await Promise.all(
    linesWithPrice.map(async (l) => {
      const plan = l.lotPlan ?? [];
      if (plan.length === 0) return { plan: [], isOverride: false, reason: null as string | null };

      const lots = await prisma.lot.findMany({
        where: { skuId: l.skuId, warehouseId: data.warehouseId, remainingQty: { gt: 0 }, status: "ACTIVE" },
      });
      const costed = lots.map((lot) => ({
        id: lot.id,
        remainingQty: num(lot.remainingQty),
        unitCost: num(lot.unitCost),
        receivedAt: lot.receivedAt,
      }));

      const check = validateLotPlan(plan, costed, l.qty);
      if (!check.ok) {
        throw new Error(`${itemMap[l.skuId]?.name ?? l.skuId}: ${check.error}`);
      }

      const isOverride = !isFifoPlan(plan, costed, l.qty);
      if (isOverride && !l.lotOverrideReason?.trim()) {
        throw new Error(
          `${itemMap[l.skuId]?.name ?? l.skuId}: selecting lots other than the FIFO default requires a reason.`
        );
      }

      return { plan, isOverride, reason: isOverride ? l.lotOverrideReason!.trim() : null };
    })
  );

  const order = await prisma.order.create({
    data: {
      id: orderId,
      customerId: data.customerId,
      agentId: session.user.id,
      warehouseId: data.warehouseId,
      channel,
      subtotal,
      vat,
      cwt,
      total,
      cwt2307: data.cwt2307,
      notes: data.notes,
      msrCode: data.msrCode?.trim() || null,
      discountMode: discountMode ?? null,
      lines: {
        create: linesWithPrice.map((l, i) => ({
          skuId: l.skuId,
          name: itemMap[l.skuId]?.name ?? l.skuId,
          unit: itemMap[l.skuId]?.unit ?? "pc",
          qty: l.qty,
          unitPrice: l.unitPrice,
          lineTotal: l.qty * l.unitPrice,
          isFree: l.isFree,
          discountPct: l.discountPct ?? null,
          manualLotOverride: lotDecisions[i].isOverride,
          manualLotOverrideReason: lotDecisions[i].reason,
          plannedLots: {
            create: lotDecisions[i].plan.map((p) => ({ lotId: p.lotId, qtyPlanned: p.qty })),
          },
        })),
      },
      events: {
        create: {
          state: "PENDING",
          actorId: session.user.id,
          note: "Order created",
        },
      },
    },
  });

  // Deviating from FIFO is legitimate but must be answerable — record it outside the
  // order's own tables so it survives edits to the order.
  const overrides = linesWithPrice
    .map((l, i) => ({ line: l, decision: lotDecisions[i] }))
    .filter((x) => x.decision.isOverride);

  if (overrides.length > 0) {
    await writeAudit({
      action: "ORDER_LOT_OVERRIDE",
      entityType: "Order",
      entityId: order.id,
      actorId: session.user.id,
      actorName: session.user.name ?? session.user.email ?? undefined,
      meta: {
        lines: overrides.map((x) => ({
          sku: itemMap[x.line.skuId]?.sku ?? x.line.skuId,
          qty: x.line.qty,
          reason: x.decision.reason,
          lots: x.decision.plan,
        })),
      },
    });
  }

  revalidatePath("/orders");
  return order.id;
}
