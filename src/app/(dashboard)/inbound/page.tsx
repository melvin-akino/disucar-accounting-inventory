import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InboundClient } from "./InboundClient";

export default async function InboundPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const [pos, suppliers, warehouses, catalog, bills] = await Promise.all([
    prisma.inboundPO.findMany({
      include: {
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        lines: { include: { sku: { select: { id: true, sku: true, name: true, unit: true } } } },
        backorders: true,
        bills: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.supplier.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.catalogItem.findMany({ where: { active: true }, select: { id: true, sku: true, name: true, unit: true }, orderBy: { name: "asc" } }),
    prisma.bill.findMany({ select: { id: true, supplierId: true, poId: true, status: true, amount: true }, orderBy: { issued: "desc" } }),
  ]);

  const serialized = pos.map(po => ({
    id: po.id,
    supplierId: po.supplierId,
    supplierName: po.supplier.name,
    warehouseId: po.warehouseId,
    warehouseName: po.warehouse.name,
    status: po.status,
    expectedAt: po.expectedAt.toISOString(),
    total: po.total.toString(),
    createdAt: po.createdAt.toISOString(),
    closedAt: po.closedAt ? po.closedAt.toISOString() : null,
    lines: po.lines.map(l => ({
      id: l.id,
      skuId: l.skuId,
      skuCode: l.sku.sku,
      skuName: l.sku.name,
      unit: l.sku.unit,
      qty: l.qty,
      unitCost: Number(l.unitCost),
      accepted: l.accepted,
      damaged: l.damaged,
    })),
    backorders: po.backorders.map(b => ({
      id: b.id,
      poLineId: b.poLineId,
      skuId: b.skuId,
      qty: b.qty,
      costPerUnit: b.costPerUnit.toString(),
      disposition: b.disposition,
      badReasonType: b.badReasonType,
      badReasonNote: b.badReasonNote,
      loggedByName: b.loggedByName,
      createdAt: b.createdAt.toISOString(),
    })),
    bills: po.bills.map(b => ({ id: b.id, status: b.status })),
  }));

  return (
    <InboundClient
      pos={serialized}
      suppliers={suppliers}
      warehouses={warehouses}
      catalog={catalog}
      bills={bills.map(b => ({ id: b.id, supplierId: b.supplierId, poId: b.poId, status: b.status, amount: b.amount.toString() }))}
      role={session.user.role}
    />
  );
}
