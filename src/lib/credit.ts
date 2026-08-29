import { prisma } from "@/lib/prisma";

export const UNPAID_RECEIPT_HOLD_THRESHOLD = 3;

export interface CreditStatus {
  creditLimit: number;
  outstanding: number;  // sum of unpaid invoice balances — informational only, no longer gates orders
  available: number;    // creditLimit - outstanding — informational only
  utilPct: number;      // 0–100+ — informational only
  overLimit: boolean;   // informational only
  unpaidCount: number;  // count of non-PAID invoices — this is what gates orders
  onHold: boolean;      // unpaidCount >= UNPAID_RECEIPT_HOLD_THRESHOLD
}

export async function getCustomerCredit(customerId: string): Promise<CreditStatus> {
  const [customer, invoices] = await Promise.all([
    prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { creditLimit: true } }),
    prisma.invoice.findMany({
      where: { customerId, status: { notIn: ["PAID"] } },
      select: { amount: true, paid: true },
    }),
  ]);

  const creditLimit = Number(customer.creditLimit);
  const outstanding = invoices.reduce((s, i) => s + Number(i.amount) - Number(i.paid), 0);
  const available = creditLimit - outstanding;
  const utilPct = creditLimit > 0 ? (outstanding / creditLimit) * 100 : 0;
  const unpaidCount = invoices.length;

  return {
    creditLimit, outstanding, available, utilPct,
    overLimit: outstanding > creditLimit,
    unpaidCount,
    onHold: unpaidCount >= UNPAID_RECEIPT_HOLD_THRESHOLD,
  };
}
