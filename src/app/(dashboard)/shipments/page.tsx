import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ShipmentsClient } from "./ShipmentsClient";
import { HelpButton } from "@/components/HelpButton";

export default async function ShipmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "FINANCE", "ADMIN", "DRIVER"].includes(session.user.role)) redirect("/orders");

  const role = session.user.role;

  const [shipments, vehicles] = await Promise.all([
    prisma.shipment.findMany({
      include: { order: { include: { customer: true } }, vehicle: { select: { plateNumber: true, lastPingAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.vehicle.findMany({ where: { active: true }, select: { id: true, plateNumber: true }, orderBy: { plateNumber: "asc" } }),
  ]);

  const serialized = shipments.map((s) => ({
    id: s.id,
    orderId: s.orderId,
    trackingNumber: s.trackingNumber,
    shippedAt: s.shippedAt?.toISOString() ?? null,
    eta: s.eta?.toISOString() ?? null,
    podSignedBy: s.podSignedBy,
    orderState: s.order.state,
    customerName: s.order.customer.name,
    vehicleId: s.vehicleId,
    vehiclePlate: s.vehicle?.plateNumber ?? null,
    vehicleLastPingAt: s.vehicle?.lastPingAt ? s.vehicle.lastPingAt.toISOString() : null,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-[18px] font-semibold">Shipments</h1>
          <HelpButton slug="shipments" label="Help: Shipments" />
        </div>
      </div>
      <ShipmentsClient shipments={serialized} vehicles={vehicles} role={role} />
    </div>
  );
}
