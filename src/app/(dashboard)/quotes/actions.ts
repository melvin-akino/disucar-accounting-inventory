"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { orderTotal, num } from "@/lib/utils";
import { sendQuoteEmail } from "@/lib/email";
import type { QuoteStatus } from "@prisma/client";
import { nextCode } from "@/lib/ids";
import { createOrder } from "../orders/actions";

const LineSchema = z.object({
  skuId: z.string().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

const QuoteSchema = z.object({
  customerId: z.string().min(1),
  warehouseId: z.string().min(1),
  validUntil: z.string().min(1),
  cwt2307: z.boolean().default(false),
  notes: z.string().optional(),
  lines: z.array(LineSchema).min(1),
});

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");
  return session;
}

function allowedRoles(...roles: string[]) {
  return async () => {
    const session = await requireSession();
    if (!roles.includes(session.user.role)) throw new Error("Forbidden");
    return session;
  };
}

async function nextQuoteId() {
  return nextCode("QT", (since) => prisma.quotation.count({ where: { createdAt: { gte: since } } }));
}

export async function createQuote(input: z.infer<typeof QuoteSchema>) {
  const session = await requireSession();
  if (!["AGENT", "FINANCE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");

  const data = QuoteSchema.parse(input);
  const subtotal = data.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const { vat, cwt, total } = orderTotal(subtotal, data.cwt2307);

  const skuIds = data.lines.map(l => l.skuId);
  const items = await prisma.catalogItem.findMany({ where: { id: { in: skuIds } } });
  const itemMap = Object.fromEntries(items.map(i => [i.id, i]));

  const id = await nextQuoteId();

  await prisma.quotation.create({
    data: {
      id,
      customerId: data.customerId,
      agentId: session.user.id,
      warehouseId: data.warehouseId,
      validUntil: new Date(data.validUntil),
      cwt2307: data.cwt2307,
      notes: data.notes,
      subtotal,
      vat,
      cwt,
      total,
      lines: {
        create: data.lines.map(l => ({
          skuId: l.skuId,
          name: itemMap[l.skuId]?.name ?? l.skuId,
          unit: itemMap[l.skuId]?.unit ?? "pc",
          qty: l.qty,
          unitPrice: l.unitPrice,
          lineTotal: l.qty * l.unitPrice,
        })),
      },
    },
  });

  revalidatePath("/quotes");
  return id;
}

export async function updateQuote(id: string, input: z.infer<typeof QuoteSchema>) {
  const session = await requireSession();
  if (!["AGENT", "FINANCE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");

  const quote = await prisma.quotation.findUniqueOrThrow({ where: { id } });
  if (quote.status !== "DRAFT") throw new Error("Only DRAFT quotations can be edited");

  const data = QuoteSchema.parse(input);
  const subtotal = data.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const { vat, cwt, total } = orderTotal(subtotal, data.cwt2307);

  const skuIds = data.lines.map(l => l.skuId);
  const items = await prisma.catalogItem.findMany({ where: { id: { in: skuIds } } });
  const itemMap = Object.fromEntries(items.map(i => [i.id, i]));

  await prisma.$transaction([
    prisma.quotationLine.deleteMany({ where: { quotationId: id } }),
    prisma.quotation.update({
      where: { id },
      data: {
        customerId: data.customerId,
        warehouseId: data.warehouseId,
        validUntil: new Date(data.validUntil),
        cwt2307: data.cwt2307,
        notes: data.notes,
        subtotal,
        vat,
        cwt,
        total,
        lines: {
          create: data.lines.map(l => ({
            skuId: l.skuId,
            name: itemMap[l.skuId]?.name ?? l.skuId,
            unit: itemMap[l.skuId]?.unit ?? "pc",
            qty: l.qty,
            unitPrice: l.unitPrice,
            lineTotal: l.qty * l.unitPrice,
          })),
        },
      },
    }),
  ]);

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
}

export async function sendQuote(id: string) {
  const session = await requireSession();
  if (!["AGENT", "FINANCE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");

  const quote = await prisma.quotation.findUniqueOrThrow({
    where: { id },
    include: { customer: { include: { users: { where: { active: true }, select: { email: true } } } } },
  });

  if (quote.status !== "DRAFT") throw new Error("Only DRAFT quotations can be sent");

  await prisma.quotation.update({ where: { id }, data: { status: "SENT" } });

  const recipients = new Set<string>();
  if (quote.customer.contactEmail) recipients.add(quote.customer.contactEmail);
  for (const u of quote.customer.users) recipients.add(u.email);

  if (recipients.size > 0) {
    const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    sendQuoteEmail({
      quoteId: id,
      customerName: quote.customer.name,
      total: Number(quote.total),
      validUntil: quote.validUntil.toLocaleDateString("en-PH"),
      to: Array.from(recipients),
    }).catch(() => {});
  }

  revalidatePath("/quotes");
}

export async function convertToOrder(quoteId: string) {
  const session = await requireSession();
  if (!["AGENT", "FINANCE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");

  const quote = await prisma.quotation.findUniqueOrThrow({
    where: { id: quoteId },
    include: { lines: true },
  });

  if (!["SENT", "ACCEPTED"].includes(quote.status)) {
    throw new Error("Only SENT or ACCEPTED quotations can be converted to orders");
  }

  // Route through createOrder rather than writing the order directly. Building the row
  // here bypassed every rule the order path enforces — channel and wholesale pricing,
  // minimum quantities, lot planning — so a quotation was a way in around all of them.
  const orderId = await createOrder({
    customerId: quote.customerId,
    warehouseId: quote.warehouseId,
    cwt2307: quote.cwt2307,
    notes: quote.notes ?? undefined,
    channel: quote.channel,
    lines: quote.lines.map((l) => ({
      skuId: l.skuId,
      qty: num(l.qty),
      unitPrice: num(l.unitPrice),
      isFree: false,
    })),
  });

  await prisma.$transaction([
    prisma.orderEvent.create({
      data: {
        orderId,
        state: "PENDING",
        actorId: session.user.id,
        note: `Created from quotation ${quoteId}`,
      },
    }),
    prisma.quotation.update({
      where: { id: quoteId },
      data: { status: "CONVERTED", orderId },
    }),
  ]);

  revalidatePath("/quotes");
  revalidatePath("/orders");
  return orderId;
}

export async function updateQuoteStatus(id: string, status: QuoteStatus) {
  const session = await requireSession();
  if (!["FINANCE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");

  await prisma.quotation.update({ where: { id }, data: { status } });
  revalidatePath("/quotes");
}
