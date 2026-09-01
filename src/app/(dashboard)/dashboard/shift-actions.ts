"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { num } from "@/lib/utils";
import { writeAudit } from "@/lib/audit";
import { computeZRead, cashVariance, validateClose, type ZRead } from "@/lib/shift";

/**
 * The cashier's currently open till session, opening one if none exists.
 *
 * Called from takeOrderPayment, so a session begins on the first payment rather than
 * requiring the cashier to remember a "start shift" step — a forgotten open would
 * otherwise block the counter, and blocking a sale to satisfy bookkeeping is the wrong
 * trade at a till.
 */
export async function ensureOpenShift(cashierId: string): Promise<string> {
  const open = await prisma.cashierShift.findFirst({
    where: { cashierId, closedAt: null },
    select: { id: true },
  });
  if (open) return open.id;

  try {
    const created = await prisma.cashierShift.create({
      data: { cashierId },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    // Two payments taken at the same instant — a double-click on "Take payment" — both
    // found no open session and both tried to open one. A partial unique index on
    // (cashierId) WHERE closedAt IS NULL makes the database settle it; the loser reads
    // the winner's session rather than splitting one drawer across two Z-reads.
    if ((e as { code?: string }).code !== "P2002") throw e;
    const existing = await prisma.cashierShift.findFirstOrThrow({
      where: { cashierId, closedAt: null },
      select: { id: true },
    });
    return existing.id;
  }
}

export interface ShiftSummary {
  id: string;
  openedAt: string;
  cashierName: string;
  zRead: ZRead;
}

/** The signed-in cashier's open session and its running totals, or null if none. */
export async function getCurrentShift(): Promise<ShiftSummary | null> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");

  const shift = await prisma.cashierShift.findFirst({
    where: { cashierId: session.user.id, closedAt: null },
    include: {
      cashier: { select: { name: true } },
      payments: { select: { amount: true, paymentType: true } },
    },
  });
  if (!shift) return null;

  return {
    id: shift.id,
    openedAt: shift.openedAt.toISOString(),
    cashierName: shift.cashier.name,
    zRead: computeZRead(
      shift.payments.map((p) => ({ amount: num(p.amount), paymentType: p.paymentType }))
    ),
  };
}

export interface ClosedShift {
  id: string;
  expectedCash: number;
  countedCash: number;
  variance: number;
  totalTaken: number;
  paymentCount: number;
}

/**
 * Cash up: freeze the session against the counted drawer.
 *
 * Expected, counted and variance are all stored rather than derived on read. A later
 * correction to a payment must not silently rewrite a reading someone has already
 * signed off, which is the whole point of taking one.
 */
export async function closeShift(
  countedCash: number,
  note?: string
): Promise<{ ok: true; shift: ClosedShift } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");
  if (!["CASHIER", "FINANCE", "ADMIN"].includes(session.user.role)) {
    return { ok: false, error: "Only a cashier, finance or admin may close a till." };
  }

  const check = validateClose(countedCash);
  if (!check.ok) return { ok: false, error: check.error! };

  const shift = await prisma.cashierShift.findFirst({
    where: { cashierId: session.user.id, closedAt: null },
    include: { payments: { select: { amount: true, paymentType: true } } },
  });
  if (!shift) return { ok: false, error: "You have no open till session to close." };

  const zRead = computeZRead(
    shift.payments.map((p) => ({ amount: num(p.amount), paymentType: p.paymentType }))
  );
  const variance = cashVariance(zRead.expectedCash, countedCash);

  await prisma.cashierShift.update({
    where: { id: shift.id },
    data: {
      closedAt: new Date(),
      closedById: session.user.id,
      expectedCash: zRead.expectedCash,
      countedCash,
      variance,
      note: note?.trim() || null,
    },
  });

  // A variance is money unaccounted for, so it is recorded outside the shift row too —
  // the audit log survives edits to the session and is where a pattern would show up.
  if (Math.abs(variance) >= 0.01) {
    await writeAudit({
      action: "CASHIER_SHIFT_VARIANCE",
      entityType: "CashierShift",
      entityId: shift.id,
      actorId: session.user.id,
      actorName: session.user.name ?? session.user.email ?? undefined,
      meta: {
        expectedCash: zRead.expectedCash,
        countedCash,
        variance,
        payments: zRead.paymentCount,
        note: note?.trim() || null,
      },
    });
  }

  revalidatePath("/dashboard");
  return {
    ok: true,
    shift: {
      id: shift.id,
      expectedCash: zRead.expectedCash,
      countedCash,
      variance,
      totalTaken: zRead.totalTaken,
      paymentCount: zRead.paymentCount,
    },
  };
}
