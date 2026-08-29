import { NextRequest, NextResponse } from "next/server";
import { GpsPingSchema, ingestGpsPings } from "@/lib/gps";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Called by an external GPS/fleet-tracking platform, not this app's UI.
// Not session-gated; protected by a shared secret instead (same pattern as
// /api/cron/unbalanced-collections). Accepts a single ping object or an
// array of pings, so it works whether the provider sends one call per truck
// per ping or batches multiple trucks per call.
const BodySchema = z.union([GpsPingSchema, z.array(GpsPingSchema)]);

export async function POST(req: NextRequest) {
  const secret = process.env.GPS_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-gps-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const pings = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const result = await ingestGpsPings(pings);

  return NextResponse.json(result);
}
