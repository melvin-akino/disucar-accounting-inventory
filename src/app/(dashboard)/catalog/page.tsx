import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CatalogClient } from "./CatalogClient";

export default async function CatalogPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["AGENT", "FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const [items, suppliers, categories] = await Promise.all([
    prisma.catalogItem.findMany({
      orderBy: { name: "asc" },
      include: { parent: { select: { sku: true } } },
    }),
    prisma.supplier.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const serializedItems = items.map(i => ({
    id: i.id,
    sku: i.sku,
    name: i.name,
    category: i.category,
    unit: i.unit,
    unitsPerCase: i.unitsPerCase,
    unitPrice: i.unitPrice.toString(),
    brand: i.brand,
    imageUrl: i.imageUrl,
    active: i.active,
    supplierId: i.supplierId,
    parentId: i.parentId,
    parentSku: i.parent?.sku ?? null,
  }));

  return <CatalogClient items={serializedItems} suppliers={suppliers} categories={categories} />;
}
