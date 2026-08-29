import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCSV, csvResponse } from "@/lib/csv";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const orders = await prisma.order.findMany({
    include: { customer: true, agent: true, warehouse: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const rows = orders.map(o => ({
    "Order ID": o.id,
    "Date": o.createdAt.toLocaleDateString("en-PH"),
    "Customer": o.customer.name,
    "Status": o.state,
    "Warehouse": o.warehouse.name,
    "Agent": o.agent?.name ?? "",
    "PO Ref": o.poRef ?? "",
    "Subtotal": Number(o.subtotal).toFixed(2),
    "VAT": Number(o.vat).toFixed(2),
    "CWT": Number(o.cwt).toFixed(2),
    "Total": Number(o.total).toFixed(2),
    "Notes": o.notes ?? "",
  }));

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(buildCSV(rows), `orders-${today}.csv`);
}
