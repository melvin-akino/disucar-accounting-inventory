"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
}

export async function confirmDelivery(orderId: string, podSignedBy: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");
  // Delivered status is confirmed by warehouse staff only (item 10) — or a WAREHOUSE reliever.
  await requireWarehouseAccess(session);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.state !== "SHIPPED") throw new Error("Order must be SHIPPED first");

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

  revalidatePath("/warehouse");
  revalidatePath("/shipments");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}
