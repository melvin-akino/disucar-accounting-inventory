"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deliverOrder } from "@/lib/fulfilment";
import { hasActiveReliefGrant } from "@/lib/reliever";

// Warehouse actions accept WAREHOUSE/ADMIN, plus anyone currently holding an active
// reliever grant covering WAREHOUSE (item 11).
async function requireWarehouseAccess(session: { user: { id: string; role: string } }) {
  if (["WAREHOUSE", "ADMIN"].includes(session.user.role)) return;
  if (await hasActiveReliefGrant(session.user.id, "WAREHOUSE")) return;
  throw new Error("Forbidden");
}

export async function startPreparing(orderId: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");
  await requireWarehouseAccess(session);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.state !== "APPROVED") throw new Error("Order must be APPROVED first");

  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { state: "PREPARING" } }),
    prisma.orderEvent.create({
      data: { orderId, state: "PREPARING", actorId: session.user.id, note: "Preparation started" },
    }),
  ]);

  revalidatePath("/warehouse");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function markShipped(
  orderId: string,
  trackingNumber: string,
  vehicleId: string,
  eta: string,
) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");
  await requireWarehouseAccess(session);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.state !== "PREPARING") throw new Error("Order must be PREPARING first");

  const vehicle = vehicleId ? await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { plateNumber: true } }) : null;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { state: "SHIPPED" } });
    await tx.orderEvent.create({
      data: { orderId, state: "SHIPPED", actorId: session.user.id, note: vehicle ? `Shipped via ${vehicle.plateNumber}` : "Shipped" },
    });
    await tx.shipment.upsert({
      where: { orderId },
      create: {
        orderId,
        trackingNumber: trackingNumber || null,
        vehicleId: vehicleId || null,
        eta: eta ? new Date(eta) : null,
        shippedAt: new Date(),
      },
      update: {
        trackingNumber: trackingNumber || null,
        vehicleId: vehicleId || null,
        eta: eta ? new Date(eta) : null,
        shippedAt: new Date(),
      },
    });
  });

  revalidatePath("/warehouse");
  revalidatePath("/shipments");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

export async function confirmDelivery(orderId: string, podSignedBy: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");
  // Delivered status is confirmed by warehouse staff only (item 10) — or a WAREHOUSE reliever.
  await requireWarehouseAccess(session);

  // Routed through deliverOrder so the board consumes stock, draws down cost layers and
  // posts COGS. It previously only set the state, so an order delivered from here never
  // decremented inventory, held its reservation forever and recognised no cost at all.
  await deliverOrder(
    orderId,
    { id: session.user.id, name: session.user.name ?? session.user.email ?? session.user.id },
    podSignedBy
  );

  revalidatePath("/warehouse");
  revalidatePath("/shipments");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}
