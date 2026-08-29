import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SuppliersClient } from "./SuppliersClient";

export default async function SuppliersPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });

  const serialized = suppliers.map(s => ({
    id: s.id,
    code: s.code,
    name: s.name,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    city: s.city,
    terms: s.terms,
    leadTimeDays: s.leadTimeDays,
    rating: s.rating.toString(),
    status: s.status,
    createdAt: s.createdAt.toISOString(),
  }));

  return <SuppliersClient suppliers={serialized} />;
}
