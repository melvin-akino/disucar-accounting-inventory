import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeliveriesClient } from "./DeliveriesClient";

export default async function DeliveriesPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const [drivers, vehicles, shippedOrders, runs] = await Promise.all([
    prisma.user.findMany({ where: { role: "DRIVER", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vehicle.findMany({ where: { active: true }, orderBy: { plateNumber: "asc" }, select: { id: true, plateNumber: true, model: true } }),
    prisma.order.findMany({
      where: { state: "SHIPPED" },
      include: { customer: { select: { name: true, city: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.deliveryRun.findMany({
      orderBy: { runDate: "desc" },
      include: {
        driver: { select: { name: true } },
        vehicle: { select: { plateNumber: true } },
        checkedBy: { select: { name: true } },
        stops: {
          include: {
            order: { select: { id: true, total: true, customer: { select: { name: true, city: true } } } },
            invoice: { select: { id: true, amount: true } },
          },
        },
      },
    }),
  ]);

  return (
    <DeliveriesClient
      drivers={drivers}
      vehicles={vehicles}
      eligibleOrders={shippedOrders.map(o => ({
        id: o.id,
        customerName: o.customer.name,
        city: o.customer.city,
        total: o.total.toString(),
      }))}
      runs={runs.map(r => ({
        id: r.id,
        runNumber: r.runNumber,
        runDate: r.runDate.toISOString(),
        driverName: r.driver?.name ?? null,
        plateNumber: r.vehicle?.plateNumber ?? null,
        helpers: r.helpers,
        checkedByName: r.checkedBy?.name ?? null,
        stops: r.stops.map(s => ({
          id: s.id,
          orderId: s.orderId,
          customerName: s.order.customer.name,
          city: s.order.customer.city,
          invoiceId: s.invoiceId,
          invoiceAmount: s.invoice?.amount.toString() ?? s.order.total.toString(),
          remark: s.remark,
          amountCollected: s.amountCollected?.toString() ?? null,
          note: s.note,
        })),
      }))}
      currentRole={session.user.role}
    />
  );
}
