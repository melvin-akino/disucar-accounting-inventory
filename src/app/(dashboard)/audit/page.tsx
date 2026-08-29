import { num } from "@/lib/utils";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditClient } from "./AuditClient";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const [orderEvents, stockMoves, journalEntries, auditLogs] = await Promise.all([
    prisma.orderEvent.findMany({
      take: 60, orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true } } },
    }),
    prisma.stockMove.findMany({
      take: 60, orderBy: { at: "desc" },
      include: {
        sku:       { select: { name: true, sku: true } },
        warehouse: { select: { name: true } },
      },
    }),
    prisma.journalEntry.findMany({
      take: 40, orderBy: { createdAt: "desc" },
      include: { postedBy: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({
      take: 80, orderBy: { at: "desc" },
    }),
  ]);

  // Merge and sort all events
  const feed = [
    ...orderEvents.map(e => ({
      id: e.id,
      type: "order" as const,
      at: e.createdAt.toISOString(),
      actor: e.actor?.name ?? "System",
      title: `Order ${e.orderId} → ${e.state}`,
      sub: e.note ?? null,
      ref: e.orderId,
    })),
    ...stockMoves.map(m => ({
      id: m.id,
      type: "stock" as const,
      at: m.at.toISOString(),
      actor: m.by ?? "System",
      title: `${m.type}: ${num(m.qty) >= 0 ? "+" : ""}${num(m.qty)} ${m.sku.name}`,
      sub: [m.warehouse.name, m.ref, m.note].filter(Boolean).join(" · ") || null,
      ref: m.skuId,
    })),
    ...journalEntries.map(j => ({
      id: j.id,
      type: "journal" as const,
      at: j.createdAt.toISOString(),
      actor: j.postedBy?.name ?? "System",
      title: `JE ${j.id} · ${j.source}`,
      sub: j.memo,
      ref: j.id,
    })),
    ...auditLogs.map(a => ({
      id: a.id,
      type: "settings" as const,
      at: a.at.toISOString(),
      actor: a.actorName ?? "System",
      title: a.action
        .replace("user.login",         "User login")
        .replace("user.create",        "User created")
        .replace("user.update",        "User updated")
        .replace("branding.save",      "Branding settings saved")
        .replace("branding.logo",      "Logo uploaded"),
      sub: a.meta ? (() => { try { const m = JSON.parse(a.meta!); return Object.entries(m).map(([k,v]) => `${k}: ${v}`).join(" · "); } catch { return null; } })() : null,
      ref: a.entityId ?? a.id,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 300);

  return <AuditClient feed={feed} />;
}
