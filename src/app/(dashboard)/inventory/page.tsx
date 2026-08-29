import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InventoryClient } from "./InventoryClient";

export default async function InventoryPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const [stocks, moves, catalogItems, warehouses, lots] = await Promise.all([
    prisma.stock.findMany({
      include: { sku: true, warehouse: true },
      orderBy: [{ warehouse: { name: "asc" } }, { sku: { name: "asc" } }],
    }),
    prisma.stockMove.findMany({
      include: { sku: true, warehouse: true },
      orderBy: { at: "desc" },
      take: 200,
    }),
    prisma.catalogItem.findMany({
      where: { active: true },
      select: { id: true, sku: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
    prisma.lot.findMany({
      include: { sku: { select: { name: true, sku: true, unitPrice: true } }, warehouse: { select: { name: true } } },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const serializedStocks = stocks.map(s => ({
    id: s.id,
    skuId: s.skuId,
    skuName: s.sku.name,
    skuSku: s.sku.sku,
    warehouseId: s.warehouseId,
    warehouseName: s.warehouse.name,
    onHand: s.onHand,
    reserved: s.reserved,
    reorderAt: s.reorderAt,
    maxLevel: s.maxLevel,
  }));

  const serializedMoves = moves.map(m => ({
    id: m.id,
    skuId: m.skuId,
    skuName: m.sku.name,
    warehouseName: m.warehouse.name,
    type: m.type,
    qty: m.qty,
    costPerUnit: m.costPerUnit.toString(),
    ref: m.ref,
    note: m.note,
    by: m.by,
    at: m.at.toISOString(),
  }));

  const serializedLots = lots.map(l => ({
    id: l.id,
    lotNumber: l.lotNumber,
    skuName: l.sku.name,
    skuSku: l.sku.sku,
    unitPrice: Number(l.sku.unitPrice),
    warehouseName: l.warehouse.name,
    warehouseId: l.warehouseId,
    receivedQty: l.receivedQty,
    remainingQty: l.remainingQty,
    status: l.status as string,
    expiryDate: l.expiryDate?.toISOString() ?? null,
    quarantineNote: l.quarantineNote ?? null,
    writeOffNote: l.writeOffNote ?? null,
    writeOffRef: l.writeOffRef ?? null,
    poId: l.poId,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <InventoryClient
      stocks={serializedStocks}
      moves={serializedMoves}
      catalogItems={catalogItems}
      warehouses={warehouses}
      lots={serializedLots}
    />
  );
}
