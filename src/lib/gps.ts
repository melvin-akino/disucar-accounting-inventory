import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const GpsPingSchema = z.object({
  deviceId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speedKph: z.number().min(0).optional(),
  headingDeg: z.number().min(0).max(360).optional(),
  recordedAt: z.string().optional(),
});

export type GpsPing = z.infer<typeof GpsPingSchema>;

export interface IngestResult {
  accepted: number;
  rejected: { deviceId: string; reason: string }[];
}

/**
 * Ingests one or more GPS pings from an external fleet-tracking provider.
 * Unknown device IDs (unregistered vehicles) are reported, not thrown —
 * a single bad/unregistered device shouldn't fail the whole batch or make
 * the provider's platform think the webhook itself is broken.
 */
export async function ingestGpsPings(pings: GpsPing[]): Promise<IngestResult> {
  const result: IngestResult = { accepted: 0, rejected: [] };

  for (const ping of pings) {
    const vehicle = await prisma.vehicle.findUnique({ where: { externalDeviceId: ping.deviceId } });
    if (!vehicle) {
      result.rejected.push({ deviceId: ping.deviceId, reason: "Unknown device ID — no vehicle registered with this externalDeviceId" });
      continue;
    }

    const recordedAt = ping.recordedAt ? new Date(ping.recordedAt) : new Date();

    await prisma.$transaction([
      prisma.vehiclePosition.create({
        data: {
          vehicleId: vehicle.id,
          lat: ping.lat,
          lng: ping.lng,
          speedKph: ping.speedKph,
          headingDeg: ping.headingDeg,
          recordedAt,
        },
      }),
      prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { lastLat: ping.lat, lastLng: ping.lng, lastSpeedKph: ping.speedKph, lastPingAt: recordedAt },
      }),
    ]);

    result.accepted++;
  }

  return result;
}
