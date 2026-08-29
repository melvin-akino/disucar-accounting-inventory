import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeTrialBalance } from "@/lib/coa";
import { getUnbalancedCollections } from "@/lib/collections";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export type ReportType = "SALES" | "AR_AGING" | "INVENTORY" | "PO_SUMMARY" | "PL" | "LOT_EXPIRY" | "LOT_TRACE" | "INVENTORY_LOT" | "UNBALANCED_COLLECTIONS" | "AGENT_AUDIT";

// ── Data shapes ───────────────────────────────────────────────────────────────

export interface SalesRow {
  month: string;
  orders: number;
  revenue: number;
  vat: number;
  cwt: number;
  net: number;
}

export interface SalesByCustomer {
  name: string;
  orders: number;
  revenue: number;
}

export interface SalesByBrand {
  brand: string;
  orders: number;
  revenue: number;
}

export interface AgentAuditSaleRow { orderId: string; date: string; customer: string; state: string; total: number }
export interface AgentAuditReturnRow { returnId: string; date: string; orderId: string; status: string; reason: string }
export interface AgentAuditActivityRow { date: string; action: string; detail: string }

export interface ArAgingRow {
  id: string;
  customer: string;
  issued: string;
  due: string;
  amount: number;
  paid: number;
  balance: number;
  bucket: "Current" | "1–30 d" | "31–60 d" | "61–90 d" | "90+ d";
  daysOverdue: number;
}

export interface InventoryRow {
  sku: string;
  name: string;
  category: string;
  unit: string;
  warehouse: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderAt: number | null;
  belowReorder: boolean;
}

export interface PoSummaryRow {
  id: string;
  supplier: string;
  warehouse: string;
  status: string;
  expectedAt: string;
  lines: number;
  total: number;
}

export interface PlRow {
  code: string;
  name: string;
  type: string;
  balance: number;
}

export interface LotExpiryRow {
  lotNumber: string;
  sku: string;
  name: string;
  warehouse: string;
  expiryDate: string;
  remainingQty: number;
  daysLeft: number;
  status: string;
}

export interface LotTraceRow {
  lotNumber: string;
  sku: string;
  name: string;
  warehouse: string;
  expiryDate: string | null;
  orderId: string;
  customer: string;
  deliveredAt: string | null;
  qtyTaken: number;
}

export interface UnbalancedCollectionRow {
  employeeId: string;
  employeeName: string;
  totalUnremitted: number;
  count: number;
  oldestCollectedAt: string;
}

export interface InventoryLotRow {
  lotNumber: string;
  sku: string;
  name: string;
  warehouse: string;
  receivedQty: number;
  remainingQty: number;
  expiryDate: string | null;
  daysLeft: number | null;
  status: string;
}

export interface ReportData {
  type: ReportType;
  from: string;
  to: string;
  sales?: { monthly: SalesRow[]; byCustomer: SalesByCustomer[]; byBrand: SalesByBrand[]; totalRevenue: number; totalOrders: number };
  arAging?: { rows: ArAgingRow[]; totalBalance: number; buckets: Record<string, number> };
  inventory?: { rows: InventoryRow[]; belowReorderCount: number; totalSkus: number };
  poSummary?: { rows: PoSummaryRow[]; byStatus: Record<string, number>; totalValue: number };
  pl?: { revenue: PlRow[]; expenses: PlRow[]; totalRevenue: number; totalExpenses: number; netIncome: number };
  lotExpiry?: { rows: LotExpiryRow[]; criticalCount: number; warningCount: number };
  lotTrace?: { rows: LotTraceRow[]; lotNumber: string };
  inventoryLot?: { rows: InventoryLotRow[]; activeLots: number; expiringSoon: number };
  unbalancedCollections?: { rows: UnbalancedCollectionRow[]; totalUnremitted: number };
  agentAudit?: {
    sales: AgentAuditSaleRow[];
    returns: AgentAuditReturnRow[];
    activities: AgentAuditActivityRow[];
    totalSalesValue: number;
    salesCount: number;
    returnsCount: number;
  };
  // Agent picker (AGENT_AUDIT only)
  agents: { id: string; name: string }[];
  selectedAgentId?: string;
  selectedAgentName?: string;
  // Customer filter metadata
  userRole: string;
  customers: { id: string; name: string }[];
  selectedCustomerId?: string;
  selectedCustomerName?: string;
  // Lot trace filter
  lotNumberFilter?: string;
  // MSR code filter (SALES only)
  msrCodes: string[];
  msrCodeFilter?: string;
  // Brand filter (SALES, INVENTORY only)
  brands: string[];
  brandFilter?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short" });
}

function agingBucket(daysOverdue: number): ArAgingRow["bucket"] {
  if (daysOverdue <= 0) return "Current";
  if (daysOverdue <= 30) return "1–30 d";
  if (daysOverdue <= 60) return "31–60 d";
  if (daysOverdue <= 90) return "61–90 d";
  return "90+ d";
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props { searchParams: { type?: string; from?: string; to?: string; customerId?: string; lotNumber?: string; msrCode?: string; brand?: string; agentId?: string } }

export default async function ReportsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const type = (searchParams.type ?? "SALES") as ReportType;
  const toDate = searchParams.to ?? new Date().toISOString().slice(0, 10);
  const fromDate = searchParams.from ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const customerId = searchParams.customerId || undefined;
  const lotNumberFilter = searchParams.lotNumber?.trim() || "";
  const msrCodeFilter = searchParams.msrCode?.trim() || "";
  const brandFilter = searchParams.brand?.trim() || "";
  const agentId = searchParams.agentId || undefined;

  const from = new Date(fromDate + "T00:00:00");
  const to = new Date(toDate + "T23:59:59");

  const userRole = session.user.role;

  // Fetch customers list for Admin dropdown (and to resolve selected customer name)
  const customers = userRole === "ADMIN"
    ? await prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];

  let selectedCustomerName: string | undefined;
  if (customerId) {
    const found = customers.find((c) => c.id === customerId)
      ?? await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } });
    selectedCustomerName = found?.name;
  }

  // Fetch distinct MSR codes for SALES dropdown
  const msrCodes = type === "SALES"
    ? (await prisma.order.findMany({
        where: { msrCode: { not: null } },
        select: { msrCode: true },
        distinct: ["msrCode"],
      })).map((r) => r.msrCode!).filter(Boolean).sort()
    : [];

  // Fetch distinct brands for SALES / INVENTORY dropdown
  const brands = (type === "SALES" || type === "INVENTORY")
    ? (await prisma.catalogItem.findMany({
        where: { brand: { not: null } },
        select: { brand: true },
        distinct: ["brand"],
      })).map((r) => r.brand!).filter(Boolean).sort()
    : [];

  // Fetch agents for the AGENT_AUDIT picker (and resolve the selected agent name).
  const agents = type === "AGENT_AUDIT"
    ? await prisma.user.findMany({ where: { role: "AGENT" }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  const selectedAgentName = agentId ? agents.find((a) => a.id === agentId)?.name : undefined;

  let data: ReportData = { type, from: fromDate, to: toDate, userRole, customers, selectedCustomerId: customerId, selectedCustomerName, lotNumberFilter, msrCodes, msrCodeFilter, brands, brandFilter, agents, selectedAgentId: agentId, selectedAgentName };

  // ── Sales Summary ──────────────────────────────────────────────────────────
  if (type === "SALES") {
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(customerId && { customerId }),
        ...(msrCodeFilter && { msrCode: msrCodeFilter }),
        ...(brandFilter && { lines: { some: { sku: { brand: brandFilter } } } }),
      },
      include: {
        customer: { select: { name: true } },
        lines: { select: { lineTotal: true, sku: { select: { brand: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    const monthMap = new Map<string, SalesRow>();
    const customerMap = new Map<string, SalesByCustomer>();
    const brandMap = new Map<string, { brand: string; orders: Set<string>; revenue: number }>();

    for (const o of orders) {
      const m = monthLabel(o.createdAt);
      const rev = Number(o.subtotal);
      const vat = Number(o.vat);
      const cwt = Number(o.cwt);

      if (!monthMap.has(m)) monthMap.set(m, { month: m, orders: 0, revenue: 0, vat: 0, cwt: 0, net: 0 });
      const row = monthMap.get(m)!;
      row.orders++;
      row.revenue += rev;
      row.vat += vat;
      row.cwt += cwt;
      row.net += rev - cwt;

      const cn = o.customer.name;
      if (!customerMap.has(cn)) customerMap.set(cn, { name: cn, orders: 0, revenue: 0 });
      const cr = customerMap.get(cn)!;
      cr.orders++;
      cr.revenue += rev;

      for (const l of o.lines) {
        const b = l.sku.brand ?? "Unbranded";
        if (!brandMap.has(b)) brandMap.set(b, { brand: b, orders: new Set(), revenue: 0 });
        const br = brandMap.get(b)!;
        br.orders.add(o.id);
        br.revenue += Number(l.lineTotal);
      }
    }

    const monthly = Array.from(monthMap.values());
    const byCustomer = Array.from(customerMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const byBrand = Array.from(brandMap.values())
      .map((b) => ({ brand: b.brand, orders: b.orders.size, revenue: b.revenue }))
      .sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = monthly.reduce((s, r) => s + r.revenue, 0);

    data.sales = { monthly, byCustomer, byBrand, totalRevenue, totalOrders: orders.length };
  }

  // ── AR Aging ───────────────────────────────────────────────────────────────
  if (type === "AR_AGING") {
    const invoices = await prisma.invoice.findMany({
      where: { status: { not: "PAID" }, ...(customerId && { customerId }) },
      include: { customer: { select: { name: true } } },
      orderBy: { due: "asc" },
    });

    const today = new Date();
    const rows: ArAgingRow[] = invoices.map((inv) => {
      const balance = Number(inv.amount) - Number(inv.paid);
      const daysOverdue = Math.floor((today.getTime() - new Date(inv.due).getTime()) / 86400_000);
      return {
        id: inv.id,
        customer: inv.customer.name,
        issued: new Date(inv.issued).toLocaleDateString("en-PH"),
        due: new Date(inv.due).toLocaleDateString("en-PH"),
        amount: Number(inv.amount),
        paid: Number(inv.paid),
        balance,
        bucket: agingBucket(daysOverdue),
        daysOverdue,
      };
    });

    const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
    const buckets: Record<string, number> = { "Current": 0, "1–30 d": 0, "31–60 d": 0, "61–90 d": 0, "90+ d": 0 };
    for (const r of rows) buckets[r.bucket] = (buckets[r.bucket] ?? 0) + r.balance;

    data.arAging = { rows, totalBalance, buckets };
  }

  // ── Inventory Snapshot ─────────────────────────────────────────────────────
  if (type === "INVENTORY") {
    const stocks = await prisma.stock.findMany({
      where: { ...(brandFilter && { sku: { brand: brandFilter } }) },
      include: {
        sku: { select: { sku: true, name: true, category: true, unit: true } },
        warehouse: { select: { name: true } },
      },
      orderBy: [{ warehouse: { name: "asc" } }, { sku: { name: "asc" } }],
    });

    const rows: InventoryRow[] = stocks.map((s) => {
      const available = s.onHand - s.reserved;
      const belowReorder = s.reorderAt != null && s.onHand <= s.reorderAt;
      return {
        sku: s.sku.sku,
        name: s.sku.name,
        category: s.sku.category,
        unit: s.sku.unit,
        warehouse: s.warehouse.name,
        onHand: s.onHand,
        reserved: s.reserved,
        available,
        reorderAt: s.reorderAt,
        belowReorder,
      };
    });

    data.inventory = {
      rows,
      belowReorderCount: rows.filter((r) => r.belowReorder).length,
      totalSkus: new Set(rows.map((r) => r.sku)).size,
    };
  }

  // ── PO Summary ─────────────────────────────────────────────────────────────
  if (type === "PO_SUMMARY") {
    const pos = await prisma.inboundPO.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: {
        supplier: { select: { name: true } },
        warehouse: { select: { name: true } },
        lines: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const rows: PoSummaryRow[] = pos.map((po) => ({
      id: po.id,
      supplier: po.supplier.name,
      warehouse: po.warehouse.name,
      status: po.status,
      expectedAt: new Date(po.expectedAt).toLocaleDateString("en-PH"),
      lines: po.lines.length,
      total: Number(po.total),
    }));

    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const totalValue = rows.reduce((s, r) => s + r.total, 0);

    data.poSummary = { rows, byStatus, totalValue };
  }

  // ── P&L ────────────────────────────────────────────────────────────────────
  if (type === "PL") {
    const jes = await prisma.journalEntry.findMany({
      where: { date: { gte: from, lte: to } },
      include: { lines: true },
    });

    const allLines = jes.flatMap((je) => je.lines.map((l) => ({ code: l.code, dr: Number(l.dr), cr: Number(l.cr) })));
    const tb = computeTrialBalance(allLines);

    const { COA, COA_BY_CODE } = await import("@/lib/coa");

    const revenue: PlRow[] = [];
    const expenses: PlRow[] = [];
    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const acct of COA) {
      if (acct.type === "REVENUE" || acct.type === "EXPENSE") {
        const raw = tb[acct.code] ?? 0;
        const balance = acct.normal === "DR" ? raw : -raw;
        const row: PlRow = { code: acct.code, name: acct.name, type: acct.type, balance };
        if (acct.type === "REVENUE") {
          revenue.push(row);
          totalRevenue += balance;
        } else {
          expenses.push(row);
          totalExpenses += balance;
        }
      }
    }

    data.pl = { revenue, expenses, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses };
  }

  // ── Lot Expiry Report ──────────────────────────────────────────────────────
  if (type === "LOT_EXPIRY") {
    const today = new Date();
    const lots = await prisma.lot.findMany({
      where: {
        expiryDate: { not: null, gte: from, lte: to },
        status: "ACTIVE",
        remainingQty: { gt: 0 },
      },
      include: {
        sku: { select: { sku: true, name: true } },
        warehouse: { select: { name: true } },
      },
      orderBy: { expiryDate: "asc" },
    });

    const rows: LotExpiryRow[] = lots.map((l) => {
      const exp = new Date(l.expiryDate!);
      const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / 86400_000);
      return {
        lotNumber: l.lotNumber,
        sku: l.sku.sku,
        name: l.sku.name,
        warehouse: l.warehouse.name,
        expiryDate: exp.toLocaleDateString("en-PH"),
        remainingQty: l.remainingQty,
        daysLeft,
        status: l.status,
      };
    });

    const criticalDays = 30;
    const warningDays = 90;
    data.lotExpiry = {
      rows,
      criticalCount: rows.filter((r) => r.daysLeft <= criticalDays).length,
      warningCount: rows.filter((r) => r.daysLeft > criticalDays && r.daysLeft <= warningDays).length,
    };
  }

  // ── Lot Traceability Report ────────────────────────────────────────────────
  if (type === "LOT_TRACE") {
    const orderLineLots = await prisma.orderLineLot.findMany({
      where: lotNumberFilter
        ? { lot: { lotNumber: { contains: lotNumberFilter, mode: "insensitive" } } }
        : undefined,
      include: {
        lot: {
          select: { lotNumber: true, expiryDate: true, warehouse: { select: { name: true } } },
        },
        orderLine: {
          select: {
            sku: { select: { sku: true, name: true } },
            order: {
              select: {
                id: true,
                customer: { select: { name: true } },
                events: {
                  where: { state: "DELIVERED" },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { createdAt: true },
                },
              },
            },
          },
        },
      },
      orderBy: [{ lot: { lotNumber: "asc" } }, { orderLine: { order: { id: "asc" } } }],
      take: 500,
    });

    const rows: LotTraceRow[] = orderLineLots.map((oll) => {
      const deliveredEvent = oll.orderLine.order.events[0];
      return {
        lotNumber: oll.lot.lotNumber,
        sku: oll.orderLine.sku.sku,
        name: oll.orderLine.sku.name,
        warehouse: oll.lot.warehouse.name,
        expiryDate: oll.lot.expiryDate ? new Date(oll.lot.expiryDate).toLocaleDateString("en-PH") : null,
        orderId: oll.orderLine.order.id,
        customer: oll.orderLine.order.customer.name,
        deliveredAt: deliveredEvent ? new Date(deliveredEvent.createdAt).toLocaleDateString("en-PH") : null,
        qtyTaken: oll.qtyTaken,
      };
    });

    data.lotTrace = { rows, lotNumber: lotNumberFilter };
  }

  // ── Inventory by Lot ───────────────────────────────────────────────────────
  if (type === "INVENTORY_LOT") {
    const today = new Date();
    const lots = await prisma.lot.findMany({
      where: { remainingQty: { gt: 0 } },
      include: {
        sku: { select: { sku: true, name: true } },
        warehouse: { select: { name: true } },
      },
      orderBy: [{ warehouse: { name: "asc" } }, { sku: { name: "asc" } }, { expiryDate: "asc" }],
    });

    const rows: InventoryLotRow[] = lots.map((l) => {
      const exp = l.expiryDate ? new Date(l.expiryDate) : null;
      const daysLeft = exp ? Math.ceil((exp.getTime() - today.getTime()) / 86400_000) : null;
      return {
        lotNumber: l.lotNumber,
        sku: l.sku.sku,
        name: l.sku.name,
        warehouse: l.warehouse.name,
        receivedQty: l.receivedQty,
        remainingQty: l.remainingQty,
        expiryDate: exp ? exp.toLocaleDateString("en-PH") : null,
        daysLeft,
        status: l.status,
      };
    });

    data.inventoryLot = {
      rows,
      activeLots: rows.filter((r) => r.status === "ACTIVE").length,
      expiringSoon: rows.filter((r) => r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= 90).length,
    };
  }

  // ── Unbalanced Collections ─────────────────────────────────────────────────
  if (type === "UNBALANCED_COLLECTIONS") {
    const unbalanced = await getUnbalancedCollections();
    const rows: UnbalancedCollectionRow[] = unbalanced.map((u) => ({
      employeeId: u.employeeId,
      employeeName: u.employeeName,
      totalUnremitted: u.totalUnremitted,
      count: u.count,
      oldestCollectedAt: u.oldestCollectedAt.toLocaleDateString("en-PH"),
    }));
    data.unbalancedCollections = { rows, totalUnremitted: rows.reduce((s, r) => s + r.totalUnremitted, 0) };
  }

  // ── Sales Agent Audit ──────────────────────────────────────────────────────
  // Combines an agent's Sales (orders they placed), Returns (against those orders),
  // and Activities (order-event actions they performed) over the selected date range.
  if (type === "AGENT_AUDIT" && agentId) {
    const orders = await prisma.order.findMany({
      where: { agentId, createdAt: { gte: from, lte: to } },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const orderIds = orders.map((o) => o.id);

    const [returns, events] = await Promise.all([
      prisma.returnRequest.findMany({
        where: { orderId: { in: orderIds }, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.orderEvent.findMany({
        where: { actorId: agentId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

    const sales: AgentAuditSaleRow[] = orders.map((o) => ({
      orderId: o.id,
      date: o.createdAt.toISOString(),
      customer: o.customer.name,
      state: o.state,
      total: Number(o.total),
    }));
    const returnRows: AgentAuditReturnRow[] = returns.map((r) => ({
      returnId: r.id,
      date: r.createdAt.toISOString(),
      orderId: r.orderId,
      status: r.status,
      reason: r.reason,
    }));
    const activities: AgentAuditActivityRow[] = events.map((e) => ({
      date: e.createdAt.toISOString(),
      action: e.state,
      detail: e.note ?? "",
    }));

    data.agentAudit = {
      sales,
      returns: returnRows,
      activities,
      totalSalesValue: sales.reduce((s, r) => s + r.total, 0),
      salesCount: sales.length,
      returnsCount: returnRows.length,
    };
  }

  return <ReportsClient data={data} />;
}
