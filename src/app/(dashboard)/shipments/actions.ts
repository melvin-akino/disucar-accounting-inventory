"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveReliefGrant } from "@/lib/reliever";

// WAREHOUSE/ADMIN, or an active WAREHOUSE reliever (item 11).
async function isWarehouseAllowed(session: { user: { id: string; role: string } }) {
  if (["WAREHOUSE", "ADMIN"].includes(session.user.role)) return true;
  return hasActiveReliefGrant(session.user.id, "WAREHOUSE");
}

export async function updateShipmentInfo(
  shipmentId: string,
  data: { trackingNumber?: string; eta?: string; vehicleId?: string },
) {
  const session = await getServerSession(authOptions);
  if (!session || !(await isWarehouseAllowed(session))) throw new Error("Forbidden");

  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      trackingNumber: data.trackingNumber ?? null,
      eta: data.eta ? new Date(data.eta) : null,
      vehicleId: data.vehicleId || null,
    },
  });

  revalidatePath("/shipments");
  revalidatePath("/fleet");
}

// Every other Shipment currently assigned to the same truck (vehicle) that hasn't been
// delivered yet — surfaced when picking a vehicle, so Warehouse can see the full truckload.
export async function getShipmentsOnVehicle(vehicleId: string, excludeOrderId?: string) {
  if (!vehicleId) return [];
  const rows = await prisma.shipment.findMany({
    where: {
      vehicleId,
      orderId: excludeOrderId ? { not: excludeOrderId } : undefined,
      order: { state: { not: "DELIVERED" } },
    },
    include: { order: { select: { id: true, state: true, customer: { select: { name: true } } } } },
  });
  return rows.map(r => ({
    orderId: r.order.id,
    state: r.order.state,
    customerName: r.order.customer.name,
  }));
}

export async function confirmDeliveryFromShipments(orderId: string, podSignedBy: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");
  // Delivered status is now confirmed by warehouse staff only (item 10) — previously
  // Finance/Driver could too. A WAREHOUSE reliever also qualifies (item 11).
  if (!(await isWarehouseAllowed(session))) throw new Error("Forbidden");

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.state !== "SHIPPED") throw new Error("Order is not in SHIPPED state");

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { state: "DELIVERED" } });
    await tx.orderEvent.create({
      data: {
        orderId,
        state: "DELIVERED",
        actorId: session.user.id,
        note: podSignedBy ? `Delivered — signed by ${podSignedBy}` : "Delivered",
      },
    });
    if (podSignedBy) {
      await tx.shipment.updateMany({ where: { orderId }, data: { podSignedBy } });
    }
  });

  revalidatePath("/shipments");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}
