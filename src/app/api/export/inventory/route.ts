import { num } from "@/lib/utils";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCSV, csvResponse } from "@/lib/csv";

const TEMPLATE_ROW = {
  "SKU Code": "SAMPLE-SKU-001",
  "Warehouse": "Main Warehouse",
  "On Hand": "100",
  "Reorder At": "20",
  "Max Level": "200",
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN"].includes(session.user.role))
    return new Response("Unauthorized", { status: 401 });

  const isTemplate = req.nextUrl.searchParams.get("template") === "true";

  if (isTemplate) {
    return csvResponse(buildCSV([TEMPLATE_ROW]), `inventory-template.csv`);
  }

  const stocks = await prisma.stock.findMany({
    include: { sku: true, warehouse: true },
    orderBy: [{ warehouse: { name: "asc" } }, { sku: { name: "asc" } }],
  });

  const rows = stocks.map(s => ({
    "SKU Code": s.sku.sku,
    "Product": s.sku.name,
    "Category": s.sku.category,
    "Unit": s.sku.unit,
    "Warehouse": s.warehouse.name,
    "On Hand": num(s.onHand),
    "Reserved": num(s.reserved),
    "Available": num(s.onHand) - num(s.reserved),
    "Reorder At": s.reorderAt ?? "",
    "Max Level": s.maxLevel ?? "",
  }));

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(buildCSV(rows), `inventory-${today}.csv`);
}
