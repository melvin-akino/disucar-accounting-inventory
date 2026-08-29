import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeTrialBalance } from "@/lib/coa";
import { getMorningWindow } from "@/lib/utils";
import { DashboardClient } from "./DashboardClient";
import type { Role } from "@prisma/client";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = session.user.role as Role;

  // Customer has no dashboard
  if (role === "CUSTOMER") redirect("/orders");

  // ── ADMIN: full view ──────────────────────────────────────────────────────
  if (role === "ADMIN") {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    // Load expiry thresholds for near-expiry query
    const orgSettings = await prisma.orgSettings.findUnique({ where: { id: "singleton" } });
    const expiryWarnDays = orgSettings?.expiryWarnDays ?? 90;
    const warnCutoff = new Date();
    warnCutoff.setDate(warnCutoff.getDate() + expiryWarnDays);

    const morningWindow = getMorningWindow();

    const [orderCounts, invoiceSummary, billSummary, stockAlerts, birDue, recentOrders, recentJe, allJeLines, recentOrdersTrend, nearExpiryLots, activeAgents, morningOrders] =
      await Promise.all([
        prisma.order.groupBy({ by: ["state"], _count: { state: true } }),
        prisma.invoice.findMany({ where: { status: { not: "PAID" } }, select: { amount: true, paid: true, status: true } }),
        prisma.bill.findMany({ where: { status: { not: "PAID" } }, select: { amount: true, paid: true, status: true } }),
        prisma.stock.findMany({ where: { reorderAt: { not: null } }, include: { sku: { select: { name: true } }, warehouse: { select: { name: true } } } }),
        prisma.birFiling.count({ where: { status: "DUE" } }),
        prisma.order.findMany({ take: 6, orderBy: { createdAt: "desc" }, select: { id: true, state: true, total: true, createdAt: true, customer: { select: { name: true } } } }),
        prisma.journalEntry.findMany({ take: 6, orderBy: { date: "desc" }, select: { id: true, date: true, source: true, memo: true, lines: { select: { dr: true } } } }),
        prisma.journalLine.findMany({ select: { code: true, dr: true, cr: true } }),
        prisma.order.findMany({ where: { createdAt: { gte: sixMonthsAgo } }, select: { total: true, createdAt: true } }),
        prisma.lot.findMany({
          where: { expiryDate: { lte: warnCutoff }, status: "ACTIVE", remainingQty: { gt: 0 } },
          include: { sku: { select: { name: true, sku: true } }, warehouse: { select: { name: true } } },
          orderBy: { expiryDate: "asc" },
          take: 10,
        }),
        prisma.user.findMany({ where: { role: "AGENT", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        prisma.order.groupBy({
          by: ["agentId"],
          where: { createdAt: { gte: morningWindow.start, lte: morningWindow.end }, agentId: { not: null } },
          _count: { agentId: true },
        }),
      ]);

    const tb = computeTrialBalance(allJeLines.map(l => ({ code: l.code, dr: Number(l.dr), cr: Number(l.cr) })));
    const arOpen = invoiceSummary.reduce((s, i) => s + Number(i.amount) - Number(i.paid), 0);
    const arOverdue = invoiceSummary.filter(i => i.status === "OVERDUE").reduce((s, i) => s + Number(i.amount) - Number(i.paid), 0);
    const apOpen = billSummary.reduce((s, b) => s + Number(b.amount) - Number(b.paid), 0);
    const apOverdue = billSummary.filter(b => b.status === "OVERDUE").reduce((s, b) => s + Number(b.amount) - Number(b.paid), 0);
    const lowStock = stockAlerts.filter(s => s.onHand <= (s.reorderAt ?? 0));

    const morningCountByAgent = new Map(morningOrders.map(o => [o.agentId, o._count.agentId]));
    const morningActivity = activeAgents.map(a => ({
      agentId: a.id,
      agentName: a.name,
      ordersToday: morningCountByAgent.get(a.id) ?? 0,
    }));

    // Build last 6 months trend
    const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-PH", { month: "short" });
      const pts = recentOrdersTrend.filter(o => {
        const od = new Date(o.createdAt);
        return `${od.getFullYear()}-${String(od.getMonth() + 1).padStart(2, "0")}` === key;
      });
      return { month: label, revenue: pts.reduce((s, o) => s + Number(o.total), 0), orders: pts.length };
    });

    return (
      <DashboardClient
        role="ADMIN"
        orderPipeline={["PENDING","APPROVED","PREPARING","SHIPPED","DELIVERED"].map(s => ({
          state: s, count: orderCounts.find(o => o.state === s)?._count.state ?? 0,
        }))}
        ar={{ open: arOpen, overdue: arOverdue }}
        ap={{ open: apOpen, overdue: apOverdue }}
        birDue={birDue}
        lowStockCount={lowStock.length}
        lowStockItems={lowStock.slice(0, 5).map(s => ({ name: s.sku.name, warehouse: s.warehouse.name, onHand: s.onHand, reorderAt: s.reorderAt! }))}
        trialBalance={tb}
        recentOrders={recentOrders.map(o => ({ id: o.id, state: o.state, customerName: o.customer.name, total: Number(o.total), createdAt: o.createdAt.toISOString() }))}
        recentJe={recentJe.map(j => ({ id: j.id, date: j.date.toISOString(), source: j.source, memo: j.memo, amount: j.lines.reduce((s, l) => s + Number(l.dr), 0) }))}
        monthlyTrend={monthlyTrend}
        nearExpiryLots={nearExpiryLots.map(l => ({
          id: l.id, lotNumber: l.lotNumber, skuName: l.sku.name,
          warehouseName: l.warehouse.name, remainingQty: l.remainingQty,
          expiryDate: l.expiryDate!.toISOString(),
        }))}
        morningActivity={morningActivity}
      />
    );
  }

  // ── FINANCE ───────────────────────────────────────────────────────────────
  if (role === "FINANCE") {
    const [invoiceSummary, billSummary, birDue, recentJe, allJeLines] = await Promise.all([
      prisma.invoice.findMany({ where: { status: { not: "PAID" } }, select: { amount: true, paid: true, status: true, due: true, customer: { select: { name: true } }, id: true } }),
      prisma.bill.findMany({ where: { status: { not: "PAID" } }, select: { amount: true, paid: true, status: true, due: true, vendor: true, id: true } }),
      prisma.birFiling.count({ where: { status: "DUE" } }),
      prisma.journalEntry.findMany({ take: 8, orderBy: { date: "desc" }, select: { id: true, date: true, source: true, memo: true, lines: { select: { dr: true } } } }),
      prisma.journalLine.findMany({ select: { code: true, dr: true, cr: true } }),
    ]);

    const tb = computeTrialBalance(allJeLines.map(l => ({ code: l.code, dr: Number(l.dr), cr: Number(l.cr) })));
    const arOpen = invoiceSummary.reduce((s, i) => s + Number(i.amount) - Number(i.paid), 0);
    const arOverdue = invoiceSummary.filter(i => i.status === "OVERDUE").reduce((s, i) => s + Number(i.amount) - Number(i.paid), 0);
    const apOpen = billSummary.reduce((s, b) => s + Number(b.amount) - Number(b.paid), 0);
    const apOverdue = billSummary.filter(b => b.status === "OVERDUE").reduce((s, b) => s + Number(b.amount) - Number(b.paid), 0);
    const overdueInvoices = invoiceSummary.filter(i => i.status === "OVERDUE").slice(0, 5);

    return (
      <DashboardClient
        role="FINANCE"
        ar={{ open: arOpen, overdue: arOverdue }}
        ap={{ open: apOpen, overdue: apOverdue }}
        birDue={birDue}
        trialBalance={tb}
        recentJe={recentJe.map(j => ({ id: j.id, date: j.date.toISOString(), source: j.source, memo: j.memo, amount: j.lines.reduce((s, l) => s + Number(l.dr), 0) }))}
        overdueInvoices={overdueInvoices.map(i => ({ id: i.id, customerName: (i as { customer?: { name: string } }).customer?.name ?? "—", amount: Number(i.amount) - Number(i.paid), due: (i as { due: Date }).due.toISOString() }))}
      />
    );
  }

  // ── AGENT ─────────────────────────────────────────────────────────────────
  if (role === "AGENT") {
    const agentId = session.user.id;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [allMyOrders, thisMonthCount, customerCount, recentOrders] = await Promise.all([
      prisma.order.groupBy({ by: ["state"], where: { agentId }, _count: { state: true } }),
      prisma.order.count({ where: { agentId, createdAt: { gte: startOfMonth } } }),
      prisma.customer.count(),
      prisma.order.findMany({ where: { agentId }, take: 8, orderBy: { createdAt: "desc" }, select: { id: true, state: true, total: true, createdAt: true, customer: { select: { name: true } } } }),
    ]);

    const totalOrders = allMyOrders.reduce((s, o) => s + o._count.state, 0);
    const pendingCount = allMyOrders.find(o => o.state === "PENDING")?._count.state ?? 0;

    return (
      <DashboardClient
        role="AGENT"
        agentStats={{ total: totalOrders, pending: pendingCount, thisMonth: thisMonthCount, customers: customerCount }}
        recentOrders={recentOrders.map(o => ({ id: o.id, state: o.state, customerName: o.customer.name, total: Number(o.total), createdAt: o.createdAt.toISOString() }))}
        orderPipeline={["PENDING","APPROVED","PREPARING","SHIPPED","DELIVERED"].map(s => ({
          state: s, count: allMyOrders.find(o => o.state === s)?._count.state ?? 0,
        }))}
      />
    );
  }

  // ── WAREHOUSE ─────────────────────────────────────────────────────────────
  if (role === "WAREHOUSE") {
    const orgSettingsWh = await prisma.orgSettings.findUnique({ where: { id: "singleton" } });
    const expiryWarnDaysWh = orgSettingsWh?.expiryWarnDays ?? 90;
    const warnCutoffWh = new Date();
    warnCutoffWh.setDate(warnCutoffWh.getDate() + expiryWarnDaysWh);

    const [orderCounts, stockAlerts, recentOrders, nearExpiryLotsWh] = await Promise.all([
      prisma.order.groupBy({ by: ["state"], where: { state: { in: ["APPROVED","PREPARING","SHIPPED"] } }, _count: { state: true } }),
      prisma.stock.findMany({ where: { reorderAt: { not: null } }, include: { sku: { select: { name: true, sku: true } }, warehouse: { select: { name: true } } }, orderBy: { onHand: "asc" }, take: 8 }),
      prisma.order.findMany({ where: { state: { in: ["APPROVED","PREPARING"] } }, take: 8, orderBy: { createdAt: "asc" }, select: { id: true, state: true, total: true, createdAt: true, customer: { select: { name: true } } } }),
      prisma.lot.findMany({
        where: { expiryDate: { lte: warnCutoffWh }, status: "ACTIVE", remainingQty: { gt: 0 } },
        include: { sku: { select: { name: true, sku: true } }, warehouse: { select: { name: true } } },
        orderBy: { expiryDate: "asc" },
        take: 10,
      }),
    ]);

    const lowStock = stockAlerts.filter(s => s.onHand <= (s.reorderAt ?? 0));

    return (
      <DashboardClient
        role="WAREHOUSE"
        orderPipeline={["APPROVED","PREPARING","SHIPPED"].map(s => ({
          state: s, count: orderCounts.find(o => o.state === s)?._count.state ?? 0,
        }))}
        lowStockCount={lowStock.length}
        lowStockItems={lowStock.slice(0, 6).map(s => ({ name: s.sku.name, warehouse: s.warehouse.name, onHand: s.onHand, reorderAt: s.reorderAt! }))}
        recentOrders={recentOrders.map(o => ({ id: o.id, state: o.state, customerName: o.customer.name, total: Number(o.total), createdAt: o.createdAt.toISOString() }))}
        nearExpiryLots={nearExpiryLotsWh.map(l => ({
          id: l.id, lotNumber: l.lotNumber, skuName: l.sku.name,
          warehouseName: l.warehouse.name, remainingQty: l.remainingQty,
          expiryDate: l.expiryDate!.toISOString(),
        }))}
      />
    );
  }

  // ── DRIVER ────────────────────────────────────────────────────────────────
  if (role === "DRIVER") {
    const shipments = await prisma.shipment.findMany({
      where: { order: { state: "SHIPPED" } },
      include: { order: { select: { id: true, customer: { select: { name: true } }, total: true } } },
      orderBy: { eta: "asc" },
      take: 10,
    });

    return (
      <DashboardClient
        role="DRIVER"
        myShipments={shipments.map(s => ({
          id: s.id, orderId: s.orderId, customerName: s.order.customer.name,
          trackingNumber: s.trackingNumber, eta: s.eta?.toISOString() ?? null,
          total: Number(s.order.total),
        }))}
      />
    );
  }

  redirect("/orders");
}
