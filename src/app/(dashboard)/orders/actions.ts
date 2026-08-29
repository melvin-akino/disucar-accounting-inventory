"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NEXT_STATE } from "@/types";
import type { OrderState } from "@prisma/client";
import { z } from "zod";
import { orderTotal } from "@/lib/utils";
import { getCustomerCredit } from "@/lib/credit";
import { sendOrderEmail } from "@/lib/email";
import { nextCode } from "@/lib/ids";
import { selectLotsFifo, totalAllocationCost, type CostedLotAllocation } from "@/lib/order-logic";
import { inventoryAccountFor, COGS_ACCOUNT } from "@/lib/coa";

export { getCustomerCredit };

// ── Stock helpers ─────────────────────────────────────────────────────────────

async function reserveStock(orderId: string, warehouseId: string) {
  const lines = await prisma.orderLine.findMany({ where: { orderId } });

  // Check availability first (onHand - reserved >= qty needed)
  for (const line of lines) {
    const stock = await prisma.stock.findUnique({
      where: { skuId_warehouseId: { skuId: line.skuId, warehouseId } },
    });
    const available = (stock?.onHand ?? 0) - (stock?.reserved ?? 0);
    if (available < line.qty) {
      throw new Error(
        `Insufficient stock for "${line.name}": ${available} available, ${line.qty} needed. Adjust stock before approving.`
      );
    }
  }

  // All good — reserve
  await Promise.all(
    lines.map(line =>
      prisma.stock.upsert({
        where: { skuId_warehouseId: { skuId: line.skuId, warehouseId } },
        update: { reserved: { increment: line.qty } },
        create: { skuId: line.skuId, warehouseId, onHand: 0, reserved: line.qty },
      })
    )
  );
}

async function releaseReservation(orderId: string, warehouseId: string) {
  const lines = await prisma.orderLine.findMany({ where: { orderId } });
  await Promise.all(
    lines.map(line =>
      prisma.stock.updateMany({
        where: { skuId: line.skuId, warehouseId },
        data: { reserved: { decrement: line.qty } },
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
    prisma.orderLine.findMany({ where: { orderId } }),
    prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { code: true } }),
  ]);
  const invAccount = inventoryAccountFor(warehouse.code);

  // Allocate before opening the transaction so an insufficient-stock error surfaces
  // without having written anything.
  const plan: { line: (typeof lines)[number]; allocations: CostedLotAllocation[] }[] = [];
  for (const line of lines) {
    const lots = await prisma.lot.findMany({
      where: { skuId: line.skuId, warehouseId, remainingQty: { gt: 0 }, status: "ACTIVE" },
    });
    const allocations = selectLotsFifo(
      lots.map((l) => ({
        id: l.id,
        remainingQty: l.remainingQty,
        unitCost: Number(l.unitCost),
        receivedAt: l.receivedAt,
      })),
      line.qty
    );
    plan.push({ line, allocations });
  }

  const cogsAmount = totalAllocationCost(plan.flatMap((p) => p.allocations));
  const journalId = cogsAmount > 0
    ? await nextCode("JE", (since) => prisma.journalEntry.count({ where: { createdAt: { gte: since } } }))
    : null;

  await prisma.$transaction(async (tx) => {
    for (const { line, allocations } of plan) {
      await tx.stock.updateMany({
        where: { skuId: line.skuId, warehouseId },
        data: {
          onHand: { decrement: line.qty },
          reserved: { decrement: line.qty },
        },
      });

      const lineCost = totalAllocationCost(allocations);
      await tx.stockMove.create({
        data: {
          skuId: line.skuId,
          warehouseId,
          type: "PICK",
          qty: -line.qty,
          costPerUnit: line.qty > 0 ? lineCost / line.qty : 0,
          ref: orderId,
          note: `Picked for order ${orderId}`,
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
    try {
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
    const gross = Number(line.unitPrice) * line.qty;
    const lineTotal = Math.round(gross * (1 - pct / 100) * 100) / 100;
    return prisma.orderLine.update({
      where: { id: line.id },
      data: { lineTotal, discountPct: pct > 0 ? pct : null },
    });
  });

  // Gross subtotal (unchanged) and discounted net.
  const grossSubtotal = order.lines.reduce((s, l) => s + Number(l.unitPrice) * l.qty, 0);
  const net = order.lines.reduce((s, l) => {
    const pct = pctFor(l.id, l.isFree);
    return s + Math.round(Number(l.unitPrice) * l.qty * (1 - pct / 100) * 100) / 100;
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
  lines: z.array(
    z.object({
      skuId: z.string().min(1),
      qty: z.number().int().positive(),
      // 0 is allowed for free items; negative is never valid.
      unitPrice: z.number().nonnegative(),
      isFree: z.boolean().default(false),
      discountPct: z.number().min(0).max(100).optional(),
    })
  ).min(1),
});

export async function createOrder(input: z.infer<typeof NewOrderSchema>) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");

  const data = NewOrderSchema.parse(input);
  // discountMode is an Admin-only choice — silently drop it for anyone else rather than
  // trusting the client (the auto-fill math already happened client-side, but the mode
  // flag itself must not be recorded as if an Admin selected it).
  const discountMode = session.user.role === "ADMIN" ? data.discountMode : undefined;
  const subtotal = data.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const { vat, cwt, total } = orderTotal(subtotal, data.cwt2307);

  // Credit hold (3+ unpaid receipts) is informational only at creation time — it does not
  // block submission. It hard-blocks at approval instead (see approvals/actions.ts), where a
  // Finance/Admin override with a recorded reason is required. Amount-based credit limits no
  // longer gate order creation per Dominic's requirement ("not based on Amount, But by number
  // of Unpaid Receipts").

  const orderId = await nextCode("SO", (since) => prisma.order.count({ where: { createdAt: { gte: since } } }));

  const skuIds = data.lines.map((l) => l.skuId);
  const items = await prisma.catalogItem.findMany({ where: { id: { in: skuIds } } });
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));

  const order = await prisma.order.create({
    data: {
      id: orderId,
      customerId: data.customerId,
      agentId: session.user.id,
      warehouseId: data.warehouseId,
      subtotal,
      vat,
      cwt,
      total,
      cwt2307: data.cwt2307,
      notes: data.notes,
      msrCode: data.msrCode?.trim() || null,
      discountMode: discountMode ?? null,
      lines: {
        create: data.lines.map((l) => ({
          skuId: l.skuId,
          name: itemMap[l.skuId]?.name ?? l.skuId,
          unit: itemMap[l.skuId]?.unit ?? "pc",
          qty: l.qty,
          unitPrice: l.unitPrice,
          lineTotal: l.qty * l.unitPrice,
          isFree: l.isFree,
          discountPct: l.discountPct ?? null,
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

  revalidatePath("/orders");
  return order.id;
}
