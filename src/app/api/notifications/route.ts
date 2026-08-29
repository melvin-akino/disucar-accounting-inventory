import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUnbalancedCollections } from "@/lib/collections";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ items: [] });

  const role = session.user.role;
  const items: { type: string; label: string; count: number; href: string }[] = [];

  const now = new Date();

  if (["FINANCE", "ADMIN"].includes(role)) {
    const [overdueInvoices, birDue] = await Promise.all([
      prisma.invoice.count({ where: { status: "OVERDUE" } }),
      prisma.birFiling.count({ where: { status: "DUE" } }),
    ]);
    if (overdueInvoices > 0) items.push({ type: "warn", label: "Overdue invoices", count: overdueInvoices, href: "/ledger" });
    if (birDue > 0) items.push({ type: "warn", label: "BIR filings due", count: birDue, href: "/ledger" });
  }

  if (["WAREHOUSE", "ADMIN"].includes(role)) {
    const stocksWithReorder = await prisma.stock.findMany({ where: { reorderAt: { not: null } }, select: { onHand: true, reorderAt: true } });
    const lowStock = stocksWithReorder.filter(s => s.onHand <= s.reorderAt!).length;

    const pendingApprovals = await prisma.order.count({ where: { state: "APPROVED" } });
    const expectedPOs = await prisma.inboundPO.count({ where: { status: "EXPECTED", expectedAt: { lte: now } } });

    if (pendingApprovals > 0) items.push({ type: "info", label: "Orders ready to pick", count: pendingApprovals, href: "/warehouse" });
    if (expectedPOs > 0) items.push({ type: "warn", label: "Overdue PO arrivals", count: expectedPOs, href: "/inbound" });
  }

  // Pending approvals for FINANCE
  if (["FINANCE", "ADMIN"].includes(role)) {
    const pendingOrders = await prisma.order.count({ where: { state: "PENDING" } });
    if (pendingOrders > 0) items.push({ type: "info", label: "Orders pending approval", count: pendingOrders, href: "/approvals" });
  }

  // Unbalanced field collections
  if (["AGENT", "DRIVER", "FINANCE", "ADMIN"].includes(role)) {
    const unbalanced = await getUnbalancedCollections();
    if (["AGENT", "DRIVER"].includes(role)) {
      const mine = unbalanced.find(e => e.employeeId === session.user.id);
      if (mine) items.push({ type: "warn", label: "Unremitted collection", count: mine.count, href: "/collections" });
    } else if (unbalanced.length > 0) {
      items.push({ type: "warn", label: "Employees with unbalanced collections", count: unbalanced.length, href: "/collections" });
    }
  }

  return NextResponse.json({ items, total: items.reduce((s, i) => s + i.count, 0) });
}
