"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { orderTotal } from "@/lib/utils";
import { writeAudit } from "@/lib/audit";
import { nextCode } from "@/lib/ids";

// Deliberately NOT session-gated — this is the public QR order form. Every
// input here is untrusted (no session to derive identity/price/agent from),
// unlike src/app/(dashboard)/orders/actions.ts::createOrder.

const RATE_LIMIT_WINDOW_HOURS = 24;
const RATE_LIMIT_MAX_ORDERS = 5;

const SubmitPublicOrderSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().optional().or(z.literal("")),
  address: z.string().trim().min(1, "Delivery address is required").max(1000),
  honeypot: z.string().optional(),
  lines: z.array(z.object({
    skuId: z.string().min(1),
    qty: z.number().int().positive(),
  })).min(1),
});

export async function submitPublicOrder(input: z.infer<typeof SubmitPublicOrderSchema>) {
  const data = SubmitPublicOrderSchema.parse(input);

  // Bots fill every field, including ones humans never see.
  if (data.honeypot && data.honeypot.trim().length > 0) {
    throw new Error("Submission rejected.");
  }

  const agent = await prisma.user.findFirst({
    where: { qrToken: data.token, active: true, role: "AGENT" },
  });
  if (!agent) throw new Error("This order link is no longer valid. Please ask your agent for a new one.");

  const warehouse = agent.homeWarehouseId
    ? await prisma.warehouse.findUnique({ where: { id: agent.homeWarehouseId } })
    : await prisma.warehouse.findFirst({ orderBy: { name: "asc" } });
  if (!warehouse) throw new Error("No warehouse is configured to fulfill this order yet.");

  // Rate limit: cap orders per phone number in the trailing window.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000);
  const recentCount = await prisma.order.count({
    where: {
      createdAt: { gte: windowStart },
      customer: { contactPhone: data.phone },
    },
  });
  if (recentCount >= RATE_LIMIT_MAX_ORDERS) {
    throw new Error("Too many orders submitted with this phone number recently. Please contact your agent directly.");
  }

  // Find-or-create the customer by phone number.
  let customer = await prisma.customer.findFirst({ where: { contactPhone: data.phone } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: data.name,
        type: "INDIVIDUAL",
        source: "QR_SELF_SERVICE",
        contactPhone: data.phone,
        contactEmail: data.email || null,
      },
    });
  }

  // Recompute line prices server-side — never trust a client-submitted price.
  const skuIds = data.lines.map((l) => l.skuId);
  const items = await prisma.catalogItem.findMany({ where: { id: { in: skuIds }, active: true } });
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));

  const missing = data.lines.find((l) => !itemMap[l.skuId]);
  if (missing) throw new Error("One of the selected products is no longer available.");

  const lines = data.lines.map((l) => {
    const item = itemMap[l.skuId];
    const unitPrice = Number(item.unitPrice);
    return { skuId: l.skuId, name: item.name, unit: item.unit, qty: l.qty, unitPrice, lineTotal: l.qty * unitPrice };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const { vat, cwt, total } = orderTotal(subtotal, false);

  const orderId = await nextCode("SO", (since) => prisma.order.count({ where: { createdAt: { gte: since } } }));

  const order = await prisma.order.create({
    data: {
      id: orderId,
      customerId: customer.id,
      agentId: agent.id,
      warehouseId: warehouse.id,
      subtotal, vat, cwt, total,
      cwt2307: false,
      notes: data.address || null,
      lines: { create: lines },
      events: { create: { state: "PENDING", note: `Order created via QR — self-service (agent: ${agent.name})` } },
    },
  });

  await writeAudit({
    action: "public_order.created",
    entityType: "order",
    entityId: order.id,
    actorName: "public (QR order form)",
    meta: { agentId: agent.id, customerId: customer.id, total },
  });

  revalidatePath("/orders");
  return order.id;
}
