"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

async function requireAccess() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "FINANCE", "ADMIN"].includes(session.user.role)) {
    throw new Error("Forbidden");
  }
}

const SupplierSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  city: z.string().optional(),
  terms: z.string().default("Net 30"),
  leadTimeDays: z.number().int().min(0).default(7),
  rating: z.number().min(0).max(5).default(4.5),
  status: z.enum(["ACTIVE", "ON_HOLD", "INACTIVE"]).default("ACTIVE"),
});

export async function createSupplier(input: z.infer<typeof SupplierSchema>) {
  await requireAccess();
  const data = SupplierSchema.parse(input);

  if (data.code) {
    const existing = await prisma.supplier.findUnique({ where: { code: data.code } });
    if (existing) throw new Error(`Supplier code "${data.code}" already exists`);
  }

  await prisma.supplier.create({
    data: {
      code: data.code || null,
      name: data.name,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      city: data.city || null,
      terms: data.terms,
      leadTimeDays: data.leadTimeDays,
      rating: data.rating,
      status: data.status,
    },
  });

  revalidatePath("/suppliers");
}

export async function updateSupplier(id: string, input: z.infer<typeof SupplierSchema>) {
  await requireAccess();
  const data = SupplierSchema.parse(input);

  if (data.code) {
    const existing = await prisma.supplier.findFirst({
      where: { code: data.code, NOT: { id } },
    });
    if (existing) throw new Error(`Supplier code "${data.code}" is already used`);
  }

  await prisma.supplier.update({
    where: { id },
    data: {
      code: data.code || null,
      name: data.name,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      city: data.city || null,
      terms: data.terms,
      leadTimeDays: data.leadTimeDays,
      rating: data.rating,
      status: data.status,
    },
  });

  revalidatePath("/suppliers");
}
