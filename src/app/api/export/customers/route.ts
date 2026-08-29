import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCSV, csvResponse } from "@/lib/csv";

const TEMPLATE_ROW = {
  "Code": "CUST-001",
  "Name": "St. Luke's Medical Center",
  "Type": "SUPERMARKET",
  "TIN": "123-456-789-000",
  "Region": "NCR",
  "City": "Quezon City",
  "Terms": "Net 30",
  "Credit Limit": "50000.00",
  "Email": "billing@stlukes.com.ph",
  "Phone": "09171234567",
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["AGENT", "FINANCE", "ADMIN"].includes(session.user.role))
    return new Response("Unauthorized", { status: 401 });

  const isTemplate = req.nextUrl.searchParams.get("template") === "true";

  if (isTemplate) {
    return csvResponse(buildCSV([TEMPLATE_ROW]), `customers-template.csv`);
  }

  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } });

  const rows = customers.map(c => ({
    "Code": c.code ?? "",
    "Name": c.name,
    "Type": c.type,
    "TIN": c.tin ?? "",
    "Region": c.region ?? "",
    "City": c.city ?? "",
    "Terms": c.terms,
    "Credit Limit": Number(c.creditLimit).toFixed(2),
    "Email": c.contactEmail ?? "",
    "Phone": c.contactPhone ?? "",
    "Created": c.createdAt.toLocaleDateString("en-PH"),
  }));

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(buildCSV(rows), `customers-${today}.csv`);
}

