"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { JeSource, PaymentType } from "@prisma/client";
import { nextCode } from "@/lib/ids";

function jeId() {
  return nextCode("JE", (since) => prisma.journalEntry.count({ where: { createdAt: { gte: since } } }));
}

function parseDays(terms: string): number {
  const m = terms.match(/\d+/);
  return m ? parseInt(m[0]) : 30;
}

// ── Create manual journal entry ──────────────────────────────────────────────

export async function createJournalEntry(data: {
  date: string;
  source: JeSource;
  ref?: string;
  memo: string;
  lines: { code: string; dr: number; cr: number }[];
}): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const totalDr = data.lines.reduce((s, l) => s + l.dr, 0);
  const totalCr = data.lines.reduce((s, l) => s + l.cr, 0);
  if (Math.abs(totalDr - totalCr) > 0.01) {
    return { error: `Journal entry is not balanced (DR ${totalDr.toFixed(2)} ≠ CR ${totalCr.toFixed(2)})` };
  }
  if (data.lines.length < 2) {
    return { error: "At least two lines are required." };
  }

  try {
    await prisma.journalEntry.create({
      data: {
        id: await jeId(),
        date: new Date(data.date),
        source: data.source,
        ref: data.ref || null,
        memo: data.memo,
        postedById: session.user.id,
        lines: {
          create: data.lines.map((l) => ({ code: l.code, dr: l.dr, cr: l.cr })),
        },
      },
    });
    revalidatePath("/ledger");
    return {};
  } catch (e) {
    console.error(e);
    return { error: "Failed to save journal entry." };
  }
}

// ── Record invoice payment (AR) ──────────────────────────────────────────────

export async function recordInvoicePayment(
  invoiceId: string,
  amount: number,
  details?: { paymentType: PaymentType; bankName?: string; transferDate?: string; referenceNo?: string },
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  try {
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const newPaid = Number(inv.paid) + amount;
    const balance = Number(inv.amount) - newPaid;
    const status = balance <= 0.01 ? "PAID" : "PARTIAL";

    const journalId = await jeId();
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { paid: newPaid, status },
      }),
      prisma.journalEntry.create({
        data: {
          id: journalId,
          date: new Date(),
          source: "BANK",
          ref: invoiceId,
          memo: `Payment received — ${inv.id}`,
          postedById: session.user.id,
          lines: {
            create: [
              { code: "1010", dr: amount, cr: 0 },
              { code: "1100", dr: 0, cr: amount },
            ],
          },
        },
      }),
      prisma.payment.create({
        data: {
          invoiceId,
          amount,
          paymentType: details?.paymentType ?? "CASH",
          bankName: details?.bankName || null,
          transferDate: details?.transferDate ? new Date(details.transferDate) : null,
          referenceNo: details?.referenceNo || null,
          recordedById: session.user.id,
        },
      }),
    ]);

    revalidatePath("/ledger");
    return {};
  } catch (e) {
    console.error(e);
    return { error: "Failed to record payment." };
  }
}

// ── Bulk mark invoices paid (Admin only) ─────────────────────────────────────
// Used when Admin reconciles a printed collectible sheet: flag several invoices paid
// in full at once. Reuses the same paid/status/JE/Payment logic as recordInvoicePayment,
// applied to each invoice's remaining balance.

export async function markInvoicesPaid(
  invoiceIds: string[],
  details?: { paymentType: PaymentType; bankName?: string; transferDate?: string; referenceNo?: string },
): Promise<{ error?: string; count?: number }> {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/orders");

  if (invoiceIds.length === 0) return { count: 0 };

  try {
    let count = 0;
    for (const invoiceId of invoiceIds) {
      const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      if (!inv || inv.status === "PAID") continue;
      const balance = Number(inv.amount) - Number(inv.paid);
      if (balance <= 0.01) continue;

      const journalId = await jeId();
      await prisma.$transaction([
        prisma.invoice.update({ where: { id: invoiceId }, data: { paid: inv.amount, status: "PAID" } }),
        prisma.journalEntry.create({
          data: {
            id: journalId,
            date: new Date(),
            source: "BANK",
            ref: invoiceId,
            memo: `Payment received — ${inv.id}`,
            postedById: session.user.id,
            lines: {
              create: [
                { code: "1010", dr: balance, cr: 0 },
                { code: "1100", dr: 0, cr: balance },
              ],
            },
          },
        }),
        prisma.payment.create({
          data: {
            invoiceId,
            amount: balance,
            paymentType: details?.paymentType ?? "CASH",
            bankName: details?.bankName || null,
            transferDate: details?.transferDate ? new Date(details.transferDate) : null,
            referenceNo: details?.referenceNo || null,
            recordedById: session.user.id,
          },
        }),
      ]);
      count++;
    }

    revalidatePath("/ledger");
    revalidatePath("/collections");
    return { count };
  } catch (e) {
    console.error(e);
    return { error: "Failed to mark invoices paid." };
  }
}

// ── Record bill payment (AP) ─────────────────────────────────────────────────

export async function recordBillPayment(
  billId: string,
  amount: number,
  details?: { paymentType: PaymentType; bankName?: string; transferDate?: string; referenceNo?: string },
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  try {
    const bill = await prisma.bill.findUniqueOrThrow({ where: { id: billId } });
    const newPaid = Number(bill.paid) + amount;
    const balance = Number(bill.amount) - newPaid;
    const status = balance <= 0.01 ? "PAID" : "PARTIAL";

    const journalId = await jeId();
    await prisma.$transaction([
      prisma.bill.update({
        where: { id: billId },
        data: { paid: newPaid, status },
      }),
      prisma.journalEntry.create({
        data: {
          id: journalId,
          date: new Date(),
          source: "BANK",
          ref: billId,
          memo: `Bill payment — ${bill.id}`,
          postedById: session.user.id,
          lines: {
            create: [
              { code: "2000", dr: amount, cr: 0 },
              { code: "1010", dr: 0, cr: amount },
            ],
          },
        },
      }),
      prisma.payment.create({
        data: {
          billId,
          amount,
          paymentType: details?.paymentType ?? "CASH",
          bankName: details?.bankName || null,
          transferDate: details?.transferDate ? new Date(details.transferDate) : null,
          referenceNo: details?.referenceNo || null,
          recordedById: session.user.id,
        },
      }),
    ]);

    revalidatePath("/ledger");
    return {};
  } catch (e) {
    console.error(e);
    return { error: "Failed to record bill payment." };
  }
}

// ── Link a bill to the Purchase Order it pays for (used for B.O. reconciliation) ──

export async function linkBillToPO(
  billId: string,
  poId: string | null,
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  try {
    await prisma.bill.update({ where: { id: billId }, data: { poId } });
    revalidatePath("/ledger");
    revalidatePath("/inbound");
    return {};
  } catch (e) {
    console.error(e);
    return { error: "Failed to link bill to PO." };
  }
}

// ── Mark BIR filing as filed ─────────────────────────────────────────────────

export async function markBirFiled(
  filingId: string,
  refNo: string,
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  try {
    await prisma.birFiling.update({
      where: { id: filingId },
      data: { status: "FILED", desc: refNo || undefined },
    });
    revalidatePath("/ledger");
    return {};
  } catch (e) {
    console.error(e);
    return { error: "Failed to update filing." };
  }
}

// ── Generate invoice from Sales Order ────────────────────────────────────────

export async function generateInvoiceFromOrder(
  soId: string,
): Promise<{ error?: string; invoiceId?: string }> {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  try {
    const existing = await prisma.invoice.findFirst({ where: { soId } });
    if (existing) return { error: "An invoice already exists for this order.", invoiceId: existing.id };

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: soId },
      include: { customer: true },
    });

    const issued = new Date();
    const due = new Date(issued);
    due.setDate(due.getDate() + parseDays(order.customer.terms));

    const invId = await nextCode("INV", (since) => prisma.invoice.count({ where: { createdAt: { gte: since } } }));
    const journalId = await jeId();
    const total = Number(order.total);
    const vatPortion = total * (12 / 112);
    const revPortion = total - vatPortion;

    await prisma.$transaction([
      prisma.invoice.create({
        data: {
          id: invId,
          customerId: order.customerId,
          soId,
          issued,
          due,
          amount: total,
          paid: 0,
          status: "OPEN",
        },
      }),
      prisma.journalEntry.create({
        data: {
          id: journalId,
          date: issued,
          source: "AR",
          ref: soId,
          memo: `Invoice ${invId} — ${order.customer.name}`,
          postedById: session.user.id,
          lines: {
            create: [
              { code: "1100", dr: total,       cr: 0          },
              { code: "4000", dr: 0,            cr: revPortion },
              { code: "2100", dr: 0,            cr: vatPortion },
            ],
          },
        },
      }),
    ]);

    revalidatePath("/ledger");
    revalidatePath(`/orders/${soId}`);
    return { invoiceId: invId };
  } catch (e) {
    console.error(e);
    return { error: "Failed to generate invoice." };
  }
}

// ── Create BIR Filing ─────────────────────────────────────────────────────────

const BIR_FORMS = ["2550M", "2550Q", "1601C", "1601EQ", "1702RT"] as const;
type BirFormType = typeof BIR_FORMS[number];

function birDueDate(form: BirFormType, periodTo: Date): Date {
  const y = periodTo.getFullYear();
  const m = periodTo.getMonth(); // 0-indexed
  switch (form) {
    case "2550M":   return new Date(y, m + 1, 20); // 20th of following month
    case "2550Q":   return new Date(y, m + 1, 25); // 25th of month after quarter end
    case "1601C":   return new Date(y, m + 1, 10); // 10th of following month
    case "1601EQ":  return new Date(y, m + 1, 30); // last of month after quarter end
    case "1702RT":  return new Date(y + 1, 3, 15); // Apr 15 of following year
  }
}

function birDesc(form: BirFormType, period: string): string {
  const labels: Record<BirFormType, string> = {
    "2550M":  "Monthly VAT Declaration",
    "2550Q":  "Quarterly VAT Return",
    "1601C":  "Monthly Withholding (Compensation)",
    "1601EQ": "Quarterly Withholding (Expanded)",
    "1702RT": "Annual Corporate Income Tax Return",
  };
  return `${labels[form]} — ${period}`;
}

export async function createBirFiling(input: {
  form: string;
  periodFrom: string;
  periodTo: string;
  amount: number;
}): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const form = input.form as BirFormType;
  if (!BIR_FORMS.includes(form)) return { error: "Invalid form type" };

  const from = new Date(input.periodFrom + "T00:00:00");
  const to   = new Date(input.periodTo   + "T23:59:59");

  // Auto-compute tax amount from journal entries if not overridden
  let amount = input.amount;
  if (amount <= 0) {
    const entries = await prisma.journalEntry.findMany({
      where: { date: { gte: from, lte: to } },
      include: { lines: true },
    });
    const allLines = entries.flatMap(e => e.lines);

    if (form === "2550M" || form === "2550Q") {
      const outputVat = allLines.filter(l => l.code === "2100").reduce((s, l) => s + Number(l.cr) - Number(l.dr), 0);
      const inputVat  = allLines.filter(l => l.code === "2110").reduce((s, l) => s + Number(l.dr) - Number(l.cr), 0);
      amount = Math.max(0, outputVat - inputVat);
    } else if (form === "1601C") {
      amount = allLines.filter(l => l.code === "2160").reduce((s, l) => s + Number(l.cr) - Number(l.dr), 0);
    } else if (form === "1601EQ") {
      amount = allLines.filter(l => l.code === "2150").reduce((s, l) => s + Number(l.cr) - Number(l.dr), 0);
    } else if (form === "1702RT") {
      const revenue  = allLines.filter(l => l.code.startsWith("4")).reduce((s, l) => s + Number(l.cr) - Number(l.dr), 0);
      const expenses = allLines.filter(l => l.code.startsWith("5")).reduce((s, l) => s + Number(l.dr) - Number(l.cr), 0);
      amount = Math.max(0, (revenue - expenses) * 0.25);
    }
  }

  const period = `${input.periodFrom} to ${input.periodTo}`;
  const id = `BIR-${input.periodFrom.slice(0,7)}-${form}`;

  // If a filing for this id already exists, suffix it
  const existing = await prisma.birFiling.findFirst({ where: { id: { startsWith: id } } });
  const finalId = existing ? `${id}-${Date.now()}` : id;

  try {
    await prisma.birFiling.create({
      data: {
        id:     finalId,
        form,
        period,
        desc:   birDesc(form, period),
        due:    birDueDate(form, to),
        amount,
        status: "PENDING",
      },
    });
    revalidatePath("/ledger");
    return {};
  } catch (e) {
    console.error(e);
    return { error: "Failed to create BIR filing." };
  }
}
