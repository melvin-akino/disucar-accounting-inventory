"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveQuota } from "@/lib/quota";
import { getCustomerCredit } from "@/lib/credit";
import { canApprove } from "@/lib/wholesale";
import { assertWholesaleMinimumsStillMet } from "../orders/actions";
import type { OrderChannel } from "@prisma/client";

function requireApprover(role: string) {
  if (!["FINANCE", "ADMIN"].includes(role)) throw new Error("Forbidden");
}

// Wholesale narrows the approver set to ADMIN only; retail keeps FINANCE or ADMIN.
function requireChannelApprover(channel: OrderChannel, role: string) {
  if (!canApprove(channel, role)) {
    throw new Error("Wholesale orders can only be approved by an Admin.");
  }
}

export async function approveOrder(
  orderId: string,
  quotaOverrideReason?: string,
  creditHoldOverrideReason?: string,
) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");
  requireApprover(session.user.role);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.state !== "PENDING") throw new Error("Order is not pending");

  // ── Wholesale gate: ADMIN only, and minimums must still hold ─────────────────
  // Re-validated here rather than trusted from creation, because order lines can be
  // edited on the order view after submission.
  requireChannelApprover(order.channel, session.user.role);
  await assertWholesaleMinimumsStillMet(orderId);

  // ── Credit hold check (3+ unpaid receipts) ────────────────────────────────────
  const credit = await getCustomerCredit(order.customerId);
  if (credit.onHold && !creditHoldOverrideReason) {
    throw new Error(`CREDIT_HOLD_WARNING:${credit.unpaidCount}`);
  }

  // ── Quota check ─────────────────────────────────────────────────────────────
  const quota = await getActiveQuota(order.customerId);
  const isOverQuota = quota && (quota.consumed + Number(order.total)) > quota.targetAmount;
  if (isOverQuota && !quotaOverrideReason) {
    throw new Error(
      `QUOTA_WARNING:${quota!.label}:${Math.max(0, quota!.remaining).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
    );
  }

  const overrideData = {
    ...(isOverQuota && quotaOverrideReason
      ? {
          quotaOverride:       true,
          quotaOverrideReason: quotaOverrideReason,
          quotaOverrideById:   session.user.id,
          quotaOverrideAt:     new Date(),
        }
      : {}),
    ...(credit.onHold && creditHoldOverrideReason
      ? {
          creditHoldOverride:       true,
          creditHoldOverrideReason: creditHoldOverrideReason,
          creditHoldOverrideById:   session.user.id,
          creditHoldOverrideAt:     new Date(),
        }
      : {}),
  };

  const noteParts = [
    credit.onHold && creditHoldOverrideReason
      ? `Approved with credit hold override (customer had ${credit.unpaidCount} unpaid receipts): ${creditHoldOverrideReason}`
      : null,
    isOverQuota && quotaOverrideReason
      ? `Approved with quota override: ${quotaOverrideReason}`
      : null,
  ].filter(Boolean);

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { state: "APPROVED", ...overrideData },
    }),
    prisma.orderEvent.create({
      data: {
        orderId,
        state: "APPROVED",
        actorId: session.user.id,
        note: noteParts.length > 0 ? noteParts.join(" · ") : "Approved",
      },
    }),
  ]);

  revalidatePath("/approvals");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function rejectOrder(orderId: string, reason: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");
  requireApprover(session.user.role);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.state !== "PENDING") throw new Error("Order is not pending");

  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { state: "CANCELLED" } }),
    prisma.orderEvent.create({
      data: { orderId, state: "CANCELLED", actorId: session.user.id, note: reason || "Rejected" },
    }),
  ]);

  revalidatePath("/approvals");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}
