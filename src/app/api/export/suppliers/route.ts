import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCSV, csvResponse } from "@/lib/csv";

const TEMPLATE_ROW = {
  "Code": "SUP-001",
  "Name": "MedLine Philippines Inc",
  "Status": "ACTIVE",
  "City": "Makati City",
  "Terms": "Net 30",
  "Lead Time (days)": "7",
  "Rating": "4.5",
  "Email": "orders@medline.ph",
  "Phone": "028881234",
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "FINANCE", "ADMIN"].includes(session.user.role))
    return new Response("Unauthorized", { status: 401 });

  const isTemplate = req.nextUrl.searchParams.get("template") === "true";

  if (isTemplate) {
    return csvResponse(buildCSV([TEMPLATE_ROW]), `suppliers-template.csv`);
  }

  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });

  const rows = suppliers.map(s => ({
    "Code": s.code ?? "",
    "Name": s.name,
    "Status": s.status,
    "City": s.city ?? "",
    "Terms": s.terms,
    "Lead Time (days)": s.leadTimeDays,
    "Rating": Number(s.rating).toFixed(1),
    "Email": s.contactEmail ?? "",
    "Phone": s.contactPhone ?? "",
    "Created": s.createdAt.toLocaleDateString("en-PH"),
  }));

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(buildCSV(rows), `suppliers-${today}.csv`);
}
