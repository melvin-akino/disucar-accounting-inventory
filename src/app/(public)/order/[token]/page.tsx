import { num } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { OrderPageClient } from "./OrderPageClient";

export const dynamic = "force-dynamic";

interface Props { params: { token: string } }

export default async function PublicOrderPage({ params }: Props) {
  const agent = await prisma.user.findFirst({
    where: { qrToken: params.token, active: true, role: "AGENT" },
    select: { id: true, name: true },
  });

  if (!agent) {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>This link isn't valid</h1>
        <p style={{ fontSize: 14, color: "oklch(var(--ink-3))" }}>
          The order link you scanned is no longer active. Please ask your agent for a current QR code.
        </p>
      </div>
    );
  }

  const [catalog, categories] = await Promise.all([
    prisma.catalogItem.findMany({
      where: { active: true },
      select: { id: true, sku: true, name: true, brand: true, unit: true, unitsPerCase: true, unitPrice: true, imageUrl: true, category: true },
    }),
    prisma.category.findMany({ select: { code: true, name: true } }),
  ]);
  const categoryLabels = Object.fromEntries(categories.map((c) => [c.code, c.name]));

  // Pareto ordering: fast-moving items first. Rank by total quantity sold over the last 90
  // days, descending; items with no recent sales fall back to alphabetical at the end.
  const since = new Date(Date.now() - 90 * 86400_000);
  const soldAgg = await prisma.orderLine.groupBy({
    by: ["skuId"],
    where: { order: { createdAt: { gte: since }, state: { not: "CANCELLED" } } },
    _sum: { qty: true },
  });
  const soldBySku = new Map(soldAgg.map((r) => [r.skuId, num(r._sum.qty) ?? 0]));

  const sorted = [...catalog].sort((a, b) => {
    const qa = soldBySku.get(a.id) ?? 0;
    const qb = soldBySku.get(b.id) ?? 0;
    if (qb !== qa) return qb - qa;
    return a.name.localeCompare(b.name);
  });

  const serializedCatalog = sorted.map((c) => ({
    id: c.id,
    sku: c.sku,
    name: c.name,
    brand: c.brand,
    unit: c.unit,
    unitsPerCase: c.unitsPerCase,
    unitPrice: c.unitPrice.toString(),
    imageUrl: c.imageUrl,
    category: c.category,
  }));

  return <OrderPageClient token={params.token} agentName={agent.name} catalog={serializedCatalog} categoryLabels={categoryLabels} />;
}
