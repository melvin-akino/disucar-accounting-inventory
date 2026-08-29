"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { recordCollection } from "../collections/actions";
import type { DeliveryRemark } from "@prisma/client";
import { nextCode } from "@/lib/ids";

async function requireWarehouseAccess() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");
  return session;
}

function genRunNumber() {
  return nextCode("DR", (since) => prisma.deliveryRun.count({ where: { createdAt: { gte: since } } }));
}

const CreateRunSchema = z.object({
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  helpers: z.string().optional(),
  runDate: z.string().min(1),
  orderIds: z.array(z.string()).min(1),
});

export async function createDeliveryRun(input: z.infer<typeof CreateRunSchema>) {
  await requireWarehouseAccess();
  const data = CreateRunSchema.parse(input);

  // Each stop links to that order's most recent invoice, if one exists yet — recordStopOutcome
  // falls back to looking this up again at reconciliation time if it's still null (an order may
  // not be invoiced until later in its lifecycle).
  const orders = await prisma.order.findMany({
    where: { id: { in: data.orderIds } },
    include: { invoices: { orderBy: { issued: "desc" }, take: 1 } },
  });

  const run = await prisma.deliveryRun.create({
    data: {
      runNumber: await genRunNumber(),
      driverId: data.driverId || null,
      vehicleId: data.vehicleId || null,
      helpers: data.helpers || null,
      runDate: new Date(data.runDate),
      stops: {
        create: orders.map(o => ({
          orderId: o.id,
          invoiceId: o.invoices[0]?.id ?? null,
        })),
      },
    },
  });

  revalidatePath("/deliveries");
  return run.id;
}

const StopOutcomeSchema = z.object({
  remark: z.enum(["DELIVERED", "STORE_CLOSED", "CANCELLED"]),
  amountCollected: z.number().min(0).optional(),
  note: z.string().optional(),
});

// Reconciling a returned truck: sets the label on a stop (does not itself change the
// linked order's state — that stays a separate action, e.g. confirmDeliveryFromShipments
// or returnShipmentToWarehouse, per the confirmed scope). If an amount was collected, it's
// booked through the existing Collections module rather than a new accounting path.
export async function recordStopOutcome(
  stopId: string,
  input: z.infer<typeof StopOutcomeSchema>,
) {
  const session = await requireWarehouseAccess();
  const data = StopOutcomeSchema.parse(input);

  const stop = await prisma.deliveryRunStop.findUniqueOrThrow({
    where: { id: stopId },
    include: { deliveryRun: true, order: { include: { invoices: { orderBy: { issued: "desc" }, take: 1 } } } },
  });

  const invoiceId = stop.invoiceId ?? stop.order.invoices[0]?.id ?? null;

  if (data.amountCollected && data.amountCollected > 0) {
    if (!invoiceId) throw new Error("This order has no invoice yet — cannot record a collection against it.");
    await recordCollection({
      employeeId: stop.deliveryRun.driverId ?? session.user.id,
      invoiceId,
      amountCollected: data.amountCollected,
      notes: `Delivery run ${stop.deliveryRun.runNumber}`,
    });
  }

  await prisma.deliveryRunStop.update({
    where: { id: stopId },
    data: {
      remark: data.remark as DeliveryRemark,
      amountCollected: data.amountCollected ?? null,
      note: data.note || null,
      invoiceId,
    },
  });

  revalidatePath("/deliveries");
  revalidatePath("/collections");
}

export async function setDeliveryRunCheckedBy(runId: string) {
  const session = await requireWarehouseAccess();
  await prisma.deliveryRun.update({ where: { id: runId }, data: { checkedById: session.user.id } });
  revalidatePath("/deliveries");
}
