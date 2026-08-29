import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveQuota } from "@/lib/quota";
import { getCustomerCredit } from "@/lib/credit";
import { ApprovalsClient } from "./ApprovalsClient";

export default async function ApprovalsPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const pending = await prisma.order.findMany({
    where: { state: "PENDING" },
    include: { customer: true },
    orderBy: { createdAt: "asc" },
  });

  // Compute quota warnings and credit holds in parallel
  const [quotaWarnings, creditHolds] = await Promise.all([
    Promise.all(
      pending.map(async (o) => {
        const q = await getActiveQuota(o.customerId);
        if (!q) return null;
        const projected = q.consumed + Number(o.total);
        return projected > q.targetAmount
          ? { label: q.label, remaining: Math.max(0, q.remaining) }
          : null;
      })
    ),
    Promise.all(
      pending.map(async (o) => {
        const credit = await getCustomerCredit(o.customerId);
        return credit.onHold ? { unpaidCount: credit.unpaidCount } : null;
      })
    ),
  ]);

  const orders = pending.map((o, i) => ({
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    total: o.total.toString(),
    notes: o.notes,
    customer: { name: o.customer.name },
    quotaWarning: quotaWarnings[i],
    creditHold: creditHolds[i],
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[18px] font-semibold">
          Pending Approvals
          {orders.length > 0 && (
            <span className="ml-2 badge badge-warn">{orders.length}</span>
          )}
        </h1>
      </div>
      <ApprovalsClient orders={orders} />
    </div>
  );
}
