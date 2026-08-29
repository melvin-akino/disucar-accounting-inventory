import { prisma } from "@/lib/prisma";

// Grace period an employee is allowed to hold collected-but-unremitted cash
// before they're flagged as "unbalanced."
export const COLLECTION_REMIT_GRACE_HOURS = 24;

export interface UnbalancedEmployee {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  totalUnremitted: number;
  count: number;
  oldestCollectedAt: Date;
}

/**
 * Employees currently holding unremitted (or short-remitted) collections
 * older than the grace period. Shared by the Collections UI, the Reports
 * module, and the automatic-issuance cron route.
 */
export async function getUnbalancedCollections(): Promise<UnbalancedEmployee[]> {
  const cutoff = new Date(Date.now() - COLLECTION_REMIT_GRACE_HOURS * 60 * 60 * 1000);

  const open = await prisma.collection.findMany({
    where: { status: { in: ["PENDING", "SHORT"] } },
    include: { employee: { select: { id: true, name: true, email: true } } },
  });

  const byEmployee = new Map<string, { name: string; email: string; unremitted: number; count: number; oldest: Date }>();
  for (const c of open) {
    const unremitted = Number(c.amountCollected) - Number(c.amountRemitted);
    if (unremitted <= 0) continue;
    const existing = byEmployee.get(c.employeeId);
    if (existing) {
      existing.unremitted += unremitted;
      existing.count += 1;
      if (c.collectedAt < existing.oldest) existing.oldest = c.collectedAt;
    } else {
      byEmployee.set(c.employeeId, {
        name: c.employee.name, email: c.employee.email,
        unremitted, count: 1, oldest: c.collectedAt,
      });
    }
  }

  const result: UnbalancedEmployee[] = [];
  for (const [employeeId, v] of Array.from(byEmployee)) {
    if (v.oldest <= cutoff) {
      result.push({
        employeeId, employeeName: v.name, employeeEmail: v.email,
        totalUnremitted: v.unremitted, count: v.count, oldestCollectedAt: v.oldest,
      });
    }
  }
  return result;
}

export interface AgentCollectible {
  invoiceId: string;
  customerName: string;
  city: string | null;
  issued: Date;
  due: Date;
  amount: number;
  paid: number;
  balance: number;
  status: string;
}

/**
 * Outstanding (non-PAID) invoices for customers assigned to a given sales agent —
 * the agent's field-collection worklist. Agent ownership is Customer.assignedAgentId,
 * the single source of truth (standalone invoices without an originating order can't
 * be attributed via Order.agentId, so the customer link is used instead).
 */
export async function getAgentCollectibles(agentId: string): Promise<AgentCollectible[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { notIn: ["PAID"] },
      customer: { assignedAgentId: agentId },
    },
    include: { customer: { select: { name: true, city: true } } },
    orderBy: { due: "asc" },
  });

  return invoices.map((i) => ({
    invoiceId: i.id,
    customerName: i.customer.name,
    city: i.customer.city,
    issued: i.issued,
    due: i.due,
    amount: Number(i.amount),
    paid: Number(i.paid),
    balance: Number(i.amount) - Number(i.paid),
    status: i.status,
  }));
}
