import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WarehouseClient } from "./WarehouseClient";
import type { OrderState } from "@prisma/client";

// Warehouse work starts at PAID. APPROVED now means a wholesale order that has
// cleared its Admin gate but is still at the till, which the yard cannot act on —
// showing it here gave the warehouse a column of orders it could do nothing with,
// while its real queue (PAID) was missing from the board entirely.
const COLS: OrderState[] = ["PAID", "PREPARING", "SHIPPED"];

export default async function WarehousePage() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN", "FINANCE"].includes(session.user.role)) redirect("/orders");

  const role = session.user.role;

  const stateFilter = role === "FINANCE" ? ["SHIPPED"] : COLS;

  const [orders, vehicles] = await Promise.all([
    prisma.order.findMany({
      where: { state: { in: stateFilter as OrderState[] } },
      include: { customer: true, warehouse: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.vehicle.findMany({ where: { active: true }, select: { id: true, plateNumber: true }, orderBy: { plateNumber: "asc" } }),
  ]);

  const serialized = orders.map((o) => ({
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    total: o.total.toString(),
    state: o.state,
    customer: { name: o.customer.name },
    warehouse: { name: o.warehouse.name },
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[18px] font-semibold">Warehouse</h1>
      </div>
      <WarehouseClient orders={serialized} role={role} vehicles={vehicles} />
    </div>
  );
}
