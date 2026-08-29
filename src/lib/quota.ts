import { prisma } from "@/lib/prisma";

export interface QuotaStatus {
  quotaId: string;
  label: string;
  periodStart: string;   // ISO string (safe for server→client)
  periodEnd: string;
  targetAmount: number;
  consumed: number;
  remaining: number;
  pct: number;
  isOver: boolean;
}

/**
 * Returns the active quota period for a customer (if any) and its live
 * consumption (sum of non-cancelled approved/later orders in the period).
 * Returns null if no active quota exists.
 */
export async function getActiveQuota(customerId: string): Promise<QuotaStatus | null> {
  const now = new Date();

  const quota = await prisma.customerQuota.findFirst({
    where: {
      customerId,
      active: true,
      periodStart: { lte: now },
      periodEnd:   { gte: now },
    },
    orderBy: { periodStart: "desc" },
  });
  if (!quota) return null;

  // Sum totals of all non-cancelled, approved-or-later orders in the period
  const agg = await prisma.order.aggregate({
    _sum: { total: true },
    where: {
      customerId,
      state: { in: ["APPROVED", "PREPARING", "SHIPPED", "DELIVERED"] },
      createdAt: { gte: quota.periodStart, lte: quota.periodEnd },
    },
  });

  const consumed      = Number(agg._sum.total ?? 0);
  const targetAmount  = Number(quota.targetAmount);
  const remaining     = targetAmount - consumed;
  const pct           = targetAmount > 0
    ? Math.min((consumed / targetAmount) * 100, 100)
    : 0;

  return {
    quotaId:      quota.id,
    label:        quota.label,
    periodStart:  quota.periodStart.toISOString(),
    periodEnd:    quota.periodEnd.toISOString(),
    targetAmount,
    consumed,
    remaining,
    pct,
    isOver: consumed > targetAmount,
  };
}
