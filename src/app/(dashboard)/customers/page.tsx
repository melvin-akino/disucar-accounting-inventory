import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UNPAID_RECEIPT_HOLD_THRESHOLD } from "@/lib/credit";
import { CustomersClient } from "./CustomersClient";

export default async function CustomersPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["AGENT", "FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const [customers, unpaidCounts, agents] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      include: {
        quotas: { orderBy: { periodStart: "desc" } },
      },
    }),
    prisma.invoice.groupBy({
      by: ["customerId"],
      where: { status: { notIn: ["PAID"] } },
      _count: true,
    }),
    prisma.user.findMany({
      where: { role: "AGENT", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const unpaidCountByCustomer = Object.fromEntries(unpaidCounts.map(u => [u.customerId, u._count]));

  const serialized = customers.map(c => {
    const unpaidCount = unpaidCountByCustomer[c.id] ?? 0;
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      tin: c.tin,
      region: c.region,
      city: c.city,
      terms: c.terms,
      creditLimit: c.creditLimit.toString(),
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      createdAt: c.createdAt.toISOString(),
      assignedAgentId: c.assignedAgentId,
      blanketDiscountPct: c.blanketDiscountPct != null ? c.blanketDiscountPct.toString() : null,
      unpaidCount,
      onHold: unpaidCount >= UNPAID_RECEIPT_HOLD_THRESHOLD,
      quotas: c.quotas.map(q => ({
        id:           q.id,
        label:        q.label,
        periodStart:  q.periodStart.toISOString(),
        periodEnd:    q.periodEnd.toISOString(),
        targetAmount: q.targetAmount.toString(),
        active:       q.active,
        notes:        q.notes,
      })),
    };
  });

  return (
    <CustomersClient
      customers={serialized}
      agents={agents}
    />
  );
}
