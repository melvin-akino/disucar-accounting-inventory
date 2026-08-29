import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUnbalancedCollections } from "@/lib/collections";
import { CollectionsClient } from "./CollectionsClient";

export default async function CollectionsPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["AGENT", "DRIVER", "FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const isFinance = ["FINANCE", "ADMIN"].includes(session.user.role);
  const isAdmin = session.user.role === "ADMIN";

  // Agents with at least one assigned customer — for the collectible-worklist picker.
  const agentsWithCustomers = isFinance
    ? await prisma.user.findMany({
        where: { role: "AGENT", active: true, customersAssigned: { some: {} } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const [collections, employees, openInvoices, unbalanced] = await Promise.all([
    prisma.collection.findMany({
      where: isFinance ? {} : { employeeId: session.user.id },
      include: {
        employee: { select: { id: true, name: true } },
        invoice: { select: { id: true, customer: { select: { name: true } } } },
      },
      orderBy: { collectedAt: "desc" },
      take: 200,
    }),
    isFinance
      ? prisma.user.findMany({ where: { role: { in: ["AGENT", "DRIVER"] }, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([{ id: session.user.id, name: session.user.name ?? session.user.email }]),
    prisma.invoice.findMany({
      where: { status: { not: "PAID" } },
      select: { id: true, amount: true, paid: true, customer: { select: { name: true } } },
      orderBy: { due: "asc" },
    }),
    getUnbalancedCollections(),
  ]);

  const serializedCollections = collections.map(c => ({
    id: c.id,
    employeeId: c.employeeId,
    employeeName: c.employee.name,
    invoiceId: c.invoiceId,
    customerName: c.invoice.customer.name,
    amountCollected: c.amountCollected.toString(),
    amountRemitted: c.amountRemitted.toString(),
    status: c.status,
    collectedAt: c.collectedAt.toISOString(),
    remittedAt: c.remittedAt ? c.remittedAt.toISOString() : null,
    notes: c.notes,
    shortageNote: c.shortageNote,
  }));

  const serializedInvoices = openInvoices.map(i => ({
    id: i.id,
    customerName: i.customer.name,
    balance: (Number(i.amount) - Number(i.paid)).toString(),
  }));

  const serializedUnbalanced = unbalanced.map(u => ({
    employeeId: u.employeeId,
    employeeName: u.employeeName,
    totalUnremitted: u.totalUnremitted,
    count: u.count,
    oldestCollectedAt: u.oldestCollectedAt.toISOString(),
  }));

  return (
    <CollectionsClient
      collections={serializedCollections}
      employees={employees}
      invoices={serializedInvoices}
      unbalanced={serializedUnbalanced}
      isFinance={isFinance}
      isAdmin={isAdmin}
      agentsWithCustomers={agentsWithCustomers}
      currentUserId={session.user.id}
    />
  );
}
