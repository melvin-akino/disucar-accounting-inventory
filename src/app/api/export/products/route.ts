import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCSV, csvResponse } from "@/lib/csv";

const TEMPLATE_ROW = {
  "SKU": "SAMPLE-SKU-001",
  "Name": "Lucky Me! Pancit Canton Original 60g",
  "Category": "NOODLES",
  "Unit": "pc",
  "Unit Price": "13.50",
  "Brand": "Lucky Me!",
  "Active": "true",
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["AGENT", "FINANCE", "ADMIN"].includes(session.user.role))
    return new Response("Unauthorized", { status: 401 });

  const isTemplate = req.nextUrl.searchParams.get("template") === "true";
  const today = new Date().toISOString().slice(0, 10);

  if (isTemplate) {
    return csvResponse(buildCSV([TEMPLATE_ROW]), `products-template.csv`);
  }

  const items = await prisma.catalogItem.findMany({
    orderBy: [{ category: "asc" }, { sku: "asc" }],
  });

  const rows = items.map(i => ({
    "SKU": i.sku,
    "Name": i.name,
    "Category": i.category,
    "Unit": i.unit,
    "Units Per Case": i.unitsPerCase ?? "",
    "Unit Price": Number(i.unitPrice).toFixed(2),
    "Brand": i.brand ?? "",
    "Active": i.active ? "true" : "false",
  }));

  return csvResponse(buildCSV(rows), `products-${today}.csv`);
}
