"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

async function requireAccess() {
  const session = await getServerSession(authOptions);
  if (!session || !["AGENT", "FINANCE", "ADMIN"].includes(session.user.role)) {
    throw new Error("Forbidden");
  }
}

const CustomerSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1),
  type: z.string().default("SUPERMARKET"),
  tin: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  terms: z.string().default("Net 30"),
  creditLimit: z.number().min(0).default(0),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  assignedAgentId: z.string().optional().nullable(),
  blanketDiscountPct: z.number().min(0).max(100).optional().nullable(),
});

export async function createCustomer(input: z.infer<typeof CustomerSchema>) {
  await requireAccess();
  const data = CustomerSchema.parse(input);

  if (data.code) {
    const existing = await prisma.customer.findUnique({ where: { code: data.code } });
    if (existing) throw new Error(`Customer code "${data.code}" already exists`);
  }

  await prisma.customer.create({
    data: {
      code: data.code || null,
      name: data.name,
      type: data.type,
      tin: data.tin || null,
      region: data.region || null,
      city: data.city || null,
      terms: data.terms,
      creditLimit: data.creditLimit,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      assignedAgentId: data.assignedAgentId || null,
      blanketDiscountPct: data.blanketDiscountPct ?? null,
    },
  });

  revalidatePath("/customers");
}

// ── Customer Quota CRUD ───────────────────────────────────────────────────────

async function requireFinance() {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) {
    throw new Error("Forbidden — Finance or Admin only");
  }
}

const QuotaSchema = z.object({
  customerId:   z.string().min(1),
  label:        z.string().min(1),
  periodStart:  z.string().min(1),
  periodEnd:    z.string().min(1),
  targetAmount: z.number().positive(),
  notes:        z.string().optional(),
  active:       z.boolean().optional(),
});

export async function createQuota(input: z.infer<typeof QuotaSchema>) {
  await requireFinance();
  const d = QuotaSchema.parse(input);
  await prisma.customerQuota.create({
    data: {
      customerId:   d.customerId,
      label:        d.label,
      periodStart:  new Date(d.periodStart),
      periodEnd:    new Date(d.periodEnd),
      targetAmount: d.targetAmount,
      notes:        d.notes || null,
      active:       d.active ?? true,
    },
  });
  revalidatePath("/customers");
}

export async function updateQuota(id: string, input: Partial<z.infer<typeof QuotaSchema>>) {
  await requireFinance();
  await prisma.customerQuota.update({
    where: { id },
    data: {
      ...(input.label        !== undefined && { label:        input.label }),
      ...(input.periodStart  !== undefined && { periodStart:  new Date(input.periodStart) }),
      ...(input.periodEnd    !== undefined && { periodEnd:    new Date(input.periodEnd) }),
      ...(input.targetAmount !== undefined && { targetAmount: input.targetAmount }),
      ...(input.notes        !== undefined && { notes:        input.notes || null }),
      ...(input.active       !== undefined && { active:       input.active }),
    },
  });
  revalidatePath("/customers");
}

export async function deleteQuota(id: string) {
  await requireFinance();
  await prisma.customerQuota.delete({ where: { id } });
  revalidatePath("/customers");
}

export async function updateCustomer(id: string, input: z.infer<typeof CustomerSchema>) {
  await requireAccess();
  const data = CustomerSchema.parse(input);

  if (data.code) {
    const existing = await prisma.customer.findFirst({
      where: { code: data.code, NOT: { id } },
    });
    if (existing) throw new Error(`Customer code "${data.code}" is already used`);
  }

  await prisma.customer.update({
    where: { id },
    data: {
      code: data.code || null,
      name: data.name,
      type: data.type,
      tin: data.tin || null,
      region: data.region || null,
      city: data.city || null,
      terms: data.terms,
      creditLimit: data.creditLimit,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      assignedAgentId: data.assignedAgentId || null,
      blanketDiscountPct: data.blanketDiscountPct ?? null,
    },
  });

  revalidatePath("/customers");
}
