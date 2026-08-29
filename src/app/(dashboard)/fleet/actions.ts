"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

async function requireAccess() {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN"].includes(session.user.role)) throw new Error("Forbidden");
  return session;
}

const VehicleSchema = z.object({
  plateNumber: z.string().min(1),
  model: z.string().optional(),
  externalDeviceId: z.string().min(1),
  driverId: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

export async function createVehicle(input: z.infer<typeof VehicleSchema>) {
  await requireAccess();
  const data = VehicleSchema.parse(input);

  const existingPlate = await prisma.vehicle.findUnique({ where: { plateNumber: data.plateNumber } });
  if (existingPlate) throw new Error(`Plate number "${data.plateNumber}" already exists`);
  const existingDevice = await prisma.vehicle.findUnique({ where: { externalDeviceId: data.externalDeviceId } });
  if (existingDevice) throw new Error(`Device ID "${data.externalDeviceId}" is already assigned to another vehicle`);

  await prisma.vehicle.create({
    data: {
      plateNumber: data.plateNumber,
      model: data.model || null,
      externalDeviceId: data.externalDeviceId,
      driverId: data.driverId || null,
      active: data.active,
    },
  });

  revalidatePath("/fleet");
}

export async function updateVehicle(id: string, input: z.infer<typeof VehicleSchema>) {
  await requireAccess();
  const data = VehicleSchema.parse(input);

  const existingPlate = await prisma.vehicle.findFirst({ where: { plateNumber: data.plateNumber, NOT: { id } } });
  if (existingPlate) throw new Error(`Plate number "${data.plateNumber}" is already used by another vehicle`);
  const existingDevice = await prisma.vehicle.findFirst({ where: { externalDeviceId: data.externalDeviceId, NOT: { id } } });
  if (existingDevice) throw new Error(`Device ID "${data.externalDeviceId}" is already assigned to another vehicle`);

  await prisma.vehicle.update({
    where: { id },
    data: {
      plateNumber: data.plateNumber,
      model: data.model || null,
      externalDeviceId: data.externalDeviceId,
      driverId: data.driverId || null,
      active: data.active,
    },
  });

  revalidatePath("/fleet");
}

export async function getVehicleTrail(vehicleId: string, from: string, to: string) {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");

  const positions = await prisma.vehiclePosition.findMany({
    where: { vehicleId, recordedAt: { gte: new Date(from), lte: new Date(to) } },
    orderBy: { recordedAt: "asc" },
    select: { lat: true, lng: true, recordedAt: true, speedKph: true },
  });

  return positions.map(p => ({ lat: p.lat, lng: p.lng, recordedAt: p.recordedAt.toISOString(), speedKph: p.speedKph }));
}
