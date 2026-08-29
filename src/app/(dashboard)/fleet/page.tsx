import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FleetClient } from "./FleetClient";

export default async function FleetPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "FINANCE", "ADMIN", "DRIVER"].includes(session.user.role)) redirect("/orders");

  const isDriver = session.user.role === "DRIVER";

  const [vehicles, drivers] = await Promise.all([
    prisma.vehicle.findMany({
      where: isDriver ? { driverId: session.user.id } : {},
      include: {
        driver: { select: { id: true, name: true } },
        shipments: { select: { id: true, orderId: true }, take: 1, orderBy: { createdAt: "desc" } },
      },
      orderBy: { plateNumber: "asc" },
    }),
    prisma.user.findMany({ where: { role: "DRIVER", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const serialized = vehicles.map(v => ({
    id: v.id,
    plateNumber: v.plateNumber,
    model: v.model,
    externalDeviceId: v.externalDeviceId,
    active: v.active,
    driverId: v.driverId,
    driverName: v.driver?.name ?? null,
    lastLat: v.lastLat,
    lastLng: v.lastLng,
    lastSpeedKph: v.lastSpeedKph,
    lastPingAt: v.lastPingAt ? v.lastPingAt.toISOString() : null,
    latestShipmentOrderId: v.shipments[0]?.orderId ?? null,
  }));

  return (
    <FleetClient
      vehicles={serialized}
      drivers={drivers}
      canManage={["WAREHOUSE", "ADMIN"].includes(session.user.role)}
    />
  );
}
