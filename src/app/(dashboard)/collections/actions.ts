"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { nextCode } from "@/lib/ids";

function jeId() {
  return nextCode("JE", (since) => prisma.journalEntry.count({ where: { createdAt: { gte: since } } }));
}

async function requireCollectorAccess() {
  const session = await getServerSession(authOptions);
  if (!session || !["AGENT", "DRIVER", "FINANCE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");
  return session;
}

async function requireFinanceAccess() {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");
  return session;
}

// ── Record a field collection ───────────────────────────────────────────────
const RecordCollectionSchema = z.object({
  employeeId: z.string(),
  invoiceId: z.string(),
  amountCollected: z.number().positive(),
  notes: z.string().optional(),
});

export async function recordCollection(input: z.infer<typeof RecordCollectionSchema>) {
  const session = await requireCollectorAccess();
  const data = RecordCollectionSchema.parse(input);

  // Agents/drivers can only log collections against themselves; Finance/Admin may log on behalf of others.
  if (["AGENT", "DRIVER"].includes(session.user.role) && data.employeeId !== session.user.id) {
    throw new Error("Forbidden");
  }

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: data.invoiceId } });
  const balance = Number(invoice.amount) - Number(invoice.paid);
  if (data.amountCollected > balance + 0.01) {
    throw new Error(`Cannot collect ₱${data.amountCollected.toLocaleString("en-PH", { minimumFractionDigits: 2 })} — invoice balance is only ₱${balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.collection.create({
      data: {
        employeeId: data.employeeId,
        invoiceId: data.invoiceId,
        amountCollected: data.amountCollected,
        notes: data.notes,
      },
    });

    const newPaid = Number(invoice.paid) + data.amountCollected;
    const newBalance = Number(invoice.amount) - newPaid;
    await tx.invoice.update({
      where: { id: data.invoiceId },
      data: { paid: newPaid, status: newBalance <= 0.01 ? "PAID" : "PARTIAL" },
    });

    await tx.journalEntry.create({
      data: {
        id: await jeId(),
        source: "AR",
        ref: data.invoiceId,
        memo: `Field collection — ${session.user.name ?? session.user.email} (Invoice ${data.invoiceId})`,
        postedById: session.user.id,
        lines: {
          create: [
            { code: "1030", dr: data.amountCollected, cr: 0 },
            { code: "1100", dr: 0, cr: data.amountCollected },
          ],
        },
      },
    });
  });

  revalidatePath("/collections");
  revalidatePath("/ledger");
}

// ── Record a remittance (Finance receiving collected cash) ─────────────────────
const RecordRemittanceSchema = z.object({
  collectionIds: z.array(z.string()).min(1),
  amountRemitted: z.number().positive(),
  shortageNote: z.string().optional(),
});

export async function recordRemittance(input: z.infer<typeof RecordRemittanceSchema>) {
  const session = await requireFinanceAccess();
  const data = RecordRemittanceSchema.parse(input);

  const collections = await prisma.collection.findMany({ where: { id: { in: data.collectionIds } } });
  if (collections.length !== data.collectionIds.length) throw new Error("One or more collections not found.");
  if (collections.some((c) => c.status === "REMITTED")) throw new Error("One or more collections are already fully remitted.");

  const totalCollected = collections.reduce((s, c) => s + Number(c.amountCollected) - Number(c.amountRemitted), 0);
  const isShort = data.amountRemitted < totalCollected - 0.01;
  if (isShort && !data.shortageNote) {
    throw new Error(`Amount remitted (₱${data.amountRemitted.toLocaleString("en-PH", { minimumFractionDigits: 2 })}) is short of the expected ₱${totalCollected.toLocaleString("en-PH", { minimumFractionDigits: 2 })} — a shortage note is required.`);
  }

  await prisma.$transaction(async (tx) => {
    for (const c of collections) {
      // Allocate the remittance across the batch proportionally to each collection's outstanding balance.
      const outstanding = Number(c.amountCollected) - Number(c.amountRemitted);
      const share = totalCollected > 0 ? (outstanding / totalCollected) * data.amountRemitted : 0;
      const newRemitted = Number(c.amountRemitted) + share;
      await tx.collection.update({
        where: { id: c.id },
        data: {
          amountRemitted: newRemitted,
          remittedAt: new Date(),
          remittedById: session.user.id,
          status: newRemitted >= Number(c.amountCollected) - 0.01 ? "REMITTED" : "SHORT",
          shortageNote: isShort ? data.shortageNote : c.shortageNote,
        },
      });
    }

    await tx.journalEntry.create({
      data: {
        id: await jeId(),
        source: "BANK",
        ref: data.collectionIds.join(","),
        memo: `Remittance received from field collections${isShort ? " (short)" : ""}`,
        postedById: session.user.id,
        lines: {
          create: [
            { code: "1010", dr: data.amountRemitted, cr: 0 },
            { code: "1030", dr: 0, cr: data.amountRemitted },
          ],
        },
      },
    });
  });

  revalidatePath("/collections");
  revalidatePath("/ledger");
}

// Read-side: an agent's outstanding-invoice worklist. Finance/Admin only (used by the
// Collections "Agent Collectibles" panel and the printable collectible sheet).
export async function fetchAgentCollectibles(agentId: string) {
  await requireFinanceAccess();
  const { getAgentCollectibles } = await import("@/lib/collections");
  const rows = await getAgentCollectibles(agentId);
  return rows.map(r => ({
    invoiceId: r.invoiceId,
    customerName: r.customerName,
    city: r.city,
    due: r.due.toISOString(),
    amount: r.amount,
    balance: r.balance,
    status: r.status,
  }));
}
