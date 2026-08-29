import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCSV, csvResponse } from "@/lib/csv";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN", "AGENT"].includes(session.user.role))
    return new Response("Unauthorized", { status: 401 });

  const invoices = await prisma.invoice.findMany({
    include: { customer: { select: { name: true } } },
    orderBy: { issued: "desc" },
    take: 5000,
  });

  const rows = invoices.map(inv => ({
    "Invoice ID":   inv.id,
    "Customer":     inv.customer?.name ?? "",
    "SO Ref":       inv.soId ?? "",
    "Issued":       inv.issued.toLocaleDateString("en-PH"),
    "Due":          inv.due.toLocaleDateString("en-PH"),
    "Amount":       Number(inv.amount).toFixed(2),
    "Paid":         Number(inv.paid).toFixed(2),
    "Balance":      (Number(inv.amount) - Number(inv.paid)).toFixed(2),
    "Status":       inv.status,
  }));

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(buildCSV(rows), `receivables-${today}.csv`);
}
