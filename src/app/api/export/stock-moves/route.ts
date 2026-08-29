import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCSV, csvResponse } from "@/lib/csv";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN"].includes(session.user.role))
    return new Response("Unauthorized", { status: 401 });

  const moves = await prisma.stockMove.findMany({
    include: { sku: true, warehouse: true },
    orderBy: { at: "desc" },
    take: 10000,
  });

  const rows = moves.map(m => ({
    "Date": m.at.toLocaleDateString("en-PH"),
    "Time": m.at.toLocaleTimeString("en-PH", { hour12: false }),
    "SKU Code": m.sku.sku,
    "Product": m.sku.name,
    "Warehouse": m.warehouse.name,
    "Type": m.type,
    "Qty": m.qty,
    "Cost/Unit": Number(m.costPerUnit).toFixed(2),
    "Reference": m.ref ?? "",
    "Note": m.note ?? "",
    "By": m.by ?? "",
  }));

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(buildCSV(rows), `stock-moves-${today}.csv`);
}
