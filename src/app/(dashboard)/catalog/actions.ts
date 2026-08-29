"use server";

import { validateVessel } from "@/lib/bulk";
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
  return session;
}

const CatalogSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  unitsPerCase: z.number().int().positive().optional().nullable(),
  unitPrice: z.number().positive(),
  // Null = not sold wholesale. An empty field must clear the price, not keep the old one.
  wholesalePrice: z.number().positive().optional().nullable(),
  wholesaleMinQty: z.number().positive().optional().nullable(),
  itemKind: z.enum(["PACKAGED", "BULK", "BULK_VESSEL"]).default("PACKAGED"),
  bulkSourceId: z.string().optional().nullable(),
  bulkVolumeM3: z.number().positive().optional().nullable(),
  lengthM: z.number().positive().optional().nullable(),
  widthM: z.number().positive().optional().nullable(),
  heightM: z.number().positive().optional().nullable(),
  brand: z.string().optional(),
  imageUrl: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

export async function createCatalogItem(input: z.infer<typeof CatalogSchema>) {
  await requireAccess();
  const data = CatalogSchema.parse(input);

  // A truck size with no pile behind it would silently sell nothing.
  const vessel = validateVessel({
    itemKind: data.itemKind,
    bulkSourceId: data.bulkSourceId ?? null,
    bulkVolumeM3: data.bulkVolumeM3 ?? null,
  });
  if (!vessel.ok) throw new Error(vessel.error);

  const existing = await prisma.catalogItem.findUnique({ where: { sku: data.sku } });
  if (existing) throw new Error(`SKU "${data.sku}" already exists`);

  await prisma.catalogItem.create({
    data: {
      sku: data.sku,
      name: data.name,
      category: data.category,
      unit: data.unit,
      unitsPerCase: data.unitsPerCase ?? null,
      unitPrice: data.unitPrice,
      wholesalePrice: data.wholesalePrice ?? null,
      wholesaleMinQty: data.wholesaleMinQty ?? null,
      itemKind: data.itemKind,
      bulkSourceId: data.itemKind === "BULK_VESSEL" ? data.bulkSourceId ?? null : null,
      bulkVolumeM3: data.itemKind === "BULK_VESSEL" ? data.bulkVolumeM3 ?? null : null,
      lengthM: data.lengthM ?? null,
      widthM: data.widthM ?? null,
      heightM: data.heightM ?? null,
      brand: data.brand || null,
      imageUrl: data.imageUrl || null,
      supplierId: data.supplierId || null,
      parentId: data.parentId || null,
      active: data.active,
    },
  });

  revalidatePath("/catalog");
}

export async function updateCatalogItem(id: string, input: z.infer<typeof CatalogSchema>) {
  await requireAccess();
  const data = CatalogSchema.parse(input);

  // A truck size with no pile behind it would silently sell nothing.
  const vessel = validateVessel({
    itemKind: data.itemKind,
    bulkSourceId: data.bulkSourceId ?? null,
    bulkVolumeM3: data.bulkVolumeM3 ?? null,
  });
  if (!vessel.ok) throw new Error(vessel.error);

  const existing = await prisma.catalogItem.findFirst({
    where: { sku: data.sku, NOT: { id } },
  });
  if (existing) throw new Error(`SKU "${data.sku}" is already used by another item`);

  // Guard against a self-referential parent (a SKU cannot be its own case sibling).
  const parentId = data.parentId && data.parentId !== id ? data.parentId : null;

  await prisma.catalogItem.update({
    where: { id },
    data: {
      sku: data.sku,
      name: data.name,
      category: data.category,
      unit: data.unit,
      unitsPerCase: data.unitsPerCase ?? null,
      unitPrice: data.unitPrice,
      wholesalePrice: data.wholesalePrice ?? null,
      wholesaleMinQty: data.wholesaleMinQty ?? null,
      itemKind: data.itemKind,
      bulkSourceId: data.itemKind === "BULK_VESSEL" ? data.bulkSourceId ?? null : null,
      bulkVolumeM3: data.itemKind === "BULK_VESSEL" ? data.bulkVolumeM3 ?? null : null,
      lengthM: data.lengthM ?? null,
      widthM: data.widthM ?? null,
      heightM: data.heightM ?? null,
      brand: data.brand || null,
      imageUrl: data.imageUrl || null,
      supplierId: data.supplierId || null,
      parentId,
      active: data.active,
    },
  });

  revalidatePath("/catalog");
}

// ── Catalog image upload ─────────────────────────────────────────────────────
export async function uploadCatalogImage(formData: FormData): Promise<{ imageUrl: string }> {
  await requireAccess();

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");
  if (file.size > 2 * 1024 * 1024) throw new Error("Image must be under 2 MB");

  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) throw new Error("Only PNG, JPG or WebP allowed");

  const { writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const { randomUUID } = await import("crypto");

  const ext = file.name.split(".").pop() ?? "png";
  const filename = `item-${randomUUID()}.${ext}`;
  const dir = join(process.cwd(), "uploads", "catalog");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()));

  return { imageUrl: `/api/uploads/catalog/${filename}` };
}

// ── Product categories ───────────────────────────────────────────────────────
// Anyone who can manage the catalog (AGENT/FINANCE/ADMIN, same as items above) can
// also manage the category list, since the two go together in the same UI.

const CategorySchema = z.object({
  code: z.string().trim().min(1).max(30).regex(/^[A-Z0-9_]+$/, "Code must be UPPER_SNAKE_CASE (letters, numbers, underscores)"),
  name: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

export async function createCategory(input: z.infer<typeof CategorySchema>) {
  await requireAccess();
  const data = CategorySchema.parse(input);

  const existing = await prisma.category.findUnique({ where: { code: data.code } });
  if (existing) throw new Error(`Category code "${data.code}" already exists`);

  await prisma.category.create({ data });
  revalidatePath("/catalog");
}

export async function updateCategory(id: string, input: z.infer<typeof CategorySchema>) {
  await requireAccess();
  const data = CategorySchema.parse(input);

  const existing = await prisma.category.findFirst({ where: { code: data.code, NOT: { id } } });
  if (existing) throw new Error(`Category code "${data.code}" is already used by another category`);

  const current = await prisma.category.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction([
    prisma.category.update({ where: { id }, data }),
    // Renaming the code re-points every catalog item that used the old code, so
    // products don't silently fall back to an "unassigned" category.
    ...(current.code !== data.code
      ? [prisma.catalogItem.updateMany({ where: { category: current.code }, data: { category: data.code } })]
      : []),
  ]);

  revalidatePath("/catalog");
}

export async function deleteCategory(id: string) {
  await requireAccess();

  const category = await prisma.category.findUniqueOrThrow({ where: { id } });
  const inUse = await prisma.catalogItem.count({ where: { category: category.code } });
  if (inUse > 0) throw new Error(`Cannot delete "${category.name}" — ${inUse} product${inUse === 1 ? "" : "s"} still use it. Reassign them first.`);

  await prisma.category.delete({ where: { id } });
  revalidatePath("/catalog");
}
