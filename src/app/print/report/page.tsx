import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeTrialBalance, COA } from "@/lib/coa";
import { PrintButton } from "../PrintButton";
import type { ReportType } from "@/app/(dashboard)/reports/page";
import type { LotExpiryRow, LotTraceRow, InventoryLotRow } from "@/app/(dashboard)/reports/page";
import { getOrgSettings } from "@/lib/org-settings";
import { getUnbalancedCollections } from "@/lib/collections";

export const dynamic = "force-dynamic";

function peso(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props { searchParams: { type?: string; from?: string; to?: string; customerId?: string; lotNumber?: string; brand?: string } }

export default async function PrintReportPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const brand = await getOrgSettings();

  const type = (searchParams.type ?? "SALES") as ReportType;
  const toDate = searchParams.to ?? new Date().toISOString().slice(0, 10);
  const fromDate = searchParams.from ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const customerId = searchParams.customerId || undefined;
  const lotNumberFilter = searchParams.lotNumber?.trim() || "";
  const brandFilter = searchParams.brand?.trim() || "";
  const from = new Date(fromDate + "T00:00:00");
  const to = new Date(toDate + "T23:59:59");

  let selectedCustomerName: string | undefined;
  if (customerId) {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } });
    selectedCustomerName = c?.name;
  }

  const TITLES: Record<ReportType, string> = {
    SALES: "Sales Summary Report",
    AR_AGING: "AR Aging Report",
    INVENTORY: "Inventory Snapshot",
    PO_SUMMARY: "Purchase Order Summary",
    PL: "Profit & Loss Statement",
    LOT_EXPIRY: "Lot Expiry Report",
    LOT_TRACE: "Lot Traceability Report",
    INVENTORY_LOT: "Inventory by Lot/Batch",
    UNBALANCED_COLLECTIONS: "Unbalanced Collections Report",
    AGENT_AUDIT: "Sales Agent Audit Report",
  };

  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const title = TITLES[type];

  const cell: React.CSSProperties = { border: "1px solid #ddd", padding: "5px 8px", fontSize: 12 };
  const cellR: React.CSSProperties = { ...cell, textAlign: "right", fontFamily: "monospace" };
  const hd: React.CSSProperties = { ...cell, background: "#f0f0f0", fontWeight: 700, fontSize: 11 };
  const hdR: React.CSSProperties = { ...hd, textAlign: "right" };

  let content: React.ReactNode = null;

  // ── Sales ──────────────────────────────────────────────────────────────────
  if (type === "SALES") {
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: from, lte: to }, ...(customerId && { customerId }), ...(brandFilter && { lines: { some: { sku: { brand: brandFilter } } } }) },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    const monthMap = new Map<string, { orders: number; revenue: number; vat: number; cwt: number }>();
    for (const o of orders) {
      const m = o.createdAt.toLocaleDateString("en-PH", { year: "numeric", month: "short" });
      if (!monthMap.has(m)) monthMap.set(m, { orders: 0, revenue: 0, vat: 0, cwt: 0 });
      const r = monthMap.get(m)!;
      r.orders++; r.revenue += Number(o.subtotal); r.vat += Number(o.vat); r.cwt += Number(o.cwt);
    }

    const rows = Array.from(monthMap.entries());
    content = (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={hd}>Month</th><th style={hdR}>Orders</th><th style={hdR}>Revenue</th><th style={hdR}>VAT</th><th style={hdR}>CWT</th><th style={hdR}>Net</th></tr></thead>
        <tbody>
          {rows.map(([month, r]) => (
            <tr key={month}><td style={cell}>{month}</td><td style={cellR}>{r.orders}</td><td style={cellR}>{peso(r.revenue)}</td><td style={cellR}>{peso(r.vat)}</td><td style={cellR}>{peso(r.cwt)}</td><td style={cellR}>{peso(r.revenue - r.cwt)}</td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700 }}>
            <td style={hd}>Total</td>
            <td style={hdR}>{orders.length}</td>
            <td style={hdR}>{peso(rows.reduce((s, [, r]) => s + r.revenue, 0))}</td>
            <td style={hdR}>{peso(rows.reduce((s, [, r]) => s + r.vat, 0))}</td>
            <td style={hdR}>{peso(rows.reduce((s, [, r]) => s + r.cwt, 0))}</td>
            <td style={hdR}>{peso(rows.reduce((s, [, r]) => s + r.revenue - r.cwt, 0))}</td>
          </tr>
        </tfoot>
      </table>
    );
  }

  // ── AR Aging ───────────────────────────────────────────────────────────────
  if (type === "AR_AGING") {
    const invoices = await prisma.invoice.findMany({
      where: { status: { not: "PAID" }, ...(customerId && { customerId }) },
      include: { customer: { select: { name: true } } },
      orderBy: { due: "asc" },
    });
    const todayMs = Date.now();
    content = (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={hd}>Invoice</th><th style={hd}>Customer</th><th style={hd}>Issued</th><th style={hd}>Due</th><th style={hdR}>Amount</th><th style={hdR}>Paid</th><th style={hdR}>Balance</th><th style={hd}>Age</th></tr></thead>
        <tbody>
          {invoices.map((inv) => {
            const balance = Number(inv.amount) - Number(inv.paid);
            const days = Math.floor((todayMs - new Date(inv.due).getTime()) / 86400_000);
            const bucket = days <= 0 ? "Current" : days <= 30 ? "1–30 d" : days <= 60 ? "31–60 d" : days <= 90 ? "61–90 d" : "90+ d";
            return (
              <tr key={inv.id}>
                <td style={cell}>{inv.id}</td>
                <td style={cell}>{inv.customer.name}</td>
                <td style={cell}>{new Date(inv.issued).toLocaleDateString("en-PH")}</td>
                <td style={cell}>{new Date(inv.due).toLocaleDateString("en-PH")}</td>
                <td style={cellR}>{peso(Number(inv.amount))}</td>
                <td style={cellR}>{peso(Number(inv.paid))}</td>
                <td style={{ ...cellR, color: days > 30 ? "#c00" : "#111" }}>{peso(balance)}</td>
                <td style={cell}>{bucket}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  // ── Inventory ──────────────────────────────────────────────────────────────
  if (type === "INVENTORY") {
    const stocks = await prisma.stock.findMany({
      where: { ...(brandFilter && { sku: { brand: brandFilter } }) },
      include: { sku: { select: { sku: true, name: true, category: true, unit: true } }, warehouse: { select: { name: true } } },
      orderBy: [{ warehouse: { name: "asc" } }, { sku: { name: "asc" } }],
    });
    content = (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={hd}>SKU</th><th style={hd}>Product</th><th style={hd}>Warehouse</th><th style={hdR}>On Hand</th><th style={hdR}>Reserved</th><th style={hdR}>Available</th><th style={hdR}>Reorder At</th><th style={hd}>Status</th></tr></thead>
        <tbody>
          {stocks.map((s) => {
            const avail = s.onHand - s.reserved;
            const low = s.reorderAt != null && s.onHand <= s.reorderAt;
            return (
              <tr key={s.id}>
                <td style={cell}>{s.sku.sku}</td>
                <td style={cell}>{s.sku.name}</td>
                <td style={cell}>{s.warehouse.name}</td>
                <td style={cellR}>{s.onHand}</td>
                <td style={cellR}>{s.reserved}</td>
                <td style={{ ...cellR, color: low ? "#c00" : "#111" }}>{avail}</td>
                <td style={cellR}>{s.reorderAt ?? "—"}</td>
                <td style={{ ...cell, color: low ? "#c00" : "#080" }}>{low ? "LOW STOCK" : "OK"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  // ── PO Summary ─────────────────────────────────────────────────────────────
  if (type === "PO_SUMMARY") {
    const pos = await prisma.inboundPO.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { supplier: { select: { name: true } }, warehouse: { select: { name: true } }, lines: true },
      orderBy: { createdAt: "desc" },
    });
    content = (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={hd}>PO ID</th><th style={hd}>Supplier</th><th style={hd}>Warehouse</th><th style={hd}>Expected</th><th style={hdR}>Lines</th><th style={hdR}>Total</th><th style={hd}>Status</th></tr></thead>
        <tbody>
          {pos.map((po) => (
            <tr key={po.id}>
              <td style={cell}>{po.id}</td>
              <td style={cell}>{po.supplier.name}</td>
              <td style={cell}>{po.warehouse.name}</td>
              <td style={cell}>{new Date(po.expectedAt).toLocaleDateString("en-PH")}</td>
              <td style={cellR}>{po.lines.length}</td>
              <td style={cellR}>{peso(Number(po.total))}</td>
              <td style={cell}>{po.status}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700 }}>
            <td style={hd} colSpan={5}>Total</td>
            <td style={hdR}>{peso(pos.reduce((s, po) => s + Number(po.total), 0))}</td>
            <td style={hd} />
          </tr>
        </tfoot>
      </table>
    );
  }

  // ── Lot Expiry ─────────────────────────────────────────────────────────────
  if (type === "LOT_EXPIRY") {
    const today = new Date();
    const lots = await prisma.lot.findMany({
      where: { expiryDate: { not: null, gte: from, lte: to }, status: "ACTIVE", remainingQty: { gt: 0 } },
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

    content = (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={hd}>Lot No.</th><th style={hd}>SKU</th><th style={hd}>Product</th><th style={hd}>Warehouse</th><th style={hd}>Expiry Date</th><th style={hdR}>Remaining</th><th style={hdR}>Days Left</th><th style={hd}>Risk</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const risk = r.daysLeft <= 30 ? "Critical" : r.daysLeft <= 90 ? "Warning" : "OK";
            const riskColor = r.daysLeft <= 30 ? "#c00" : r.daysLeft <= 90 ? "#b45309" : "#080";
            return (
              <tr key={i}>
                <td style={{ ...cell, fontFamily: "monospace" }}>{r.lotNumber}</td>
                <td style={cell}>{r.sku}</td>
                <td style={cell}>{r.name}</td>
                <td style={cell}>{r.warehouse}</td>
                <td style={{ ...cell, color: r.daysLeft <= 30 ? "#c00" : "#111" }}>{r.expiryDate}</td>
                <td style={cellR}>{r.remainingQty.toLocaleString()}</td>
                <td style={{ ...cellR, color: riskColor }}>{r.daysLeft}d</td>
                <td style={{ ...cell, color: riskColor, fontWeight: 600 }}>{risk}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700 }}>
            <td style={hd} colSpan={5}>Total</td>
            <td style={hdR}>{rows.reduce((s, r) => s + r.remainingQty, 0).toLocaleString()}</td>
            <td style={hd} colSpan={2} />
          </tr>
        </tfoot>
      </table>
    );
  }

  // ── Lot Traceability ───────────────────────────────────────────────────────
  if (type === "LOT_TRACE") {
    const orderLineLots = await prisma.orderLineLot.findMany({
      where: lotNumberFilter
        ? { lot: { lotNumber: { contains: lotNumberFilter, mode: "insensitive" } } }
        : undefined,
      include: {
        lot: { select: { lotNumber: true, expiryDate: true, warehouse: { select: { name: true } } } },
        orderLine: {
          select: {
            sku: { select: { sku: true, name: true } },
            order: {
              select: {
                id: true,
                customer: { select: { name: true } },
                events: { where: { state: "DELIVERED" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
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

    content = (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={hd}>Lot No.</th><th style={hd}>SKU</th><th style={hd}>Product</th><th style={hd}>Warehouse</th><th style={hd}>Order</th><th style={hd}>Customer</th><th style={hd}>Delivered</th><th style={hd}>Expiry</th><th style={hdR}>Qty</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...cell, fontFamily: "monospace", fontSize: 11 }}>{r.lotNumber}</td>
              <td style={cell}>{r.sku}</td>
              <td style={cell}>{r.name}</td>
              <td style={cell}>{r.warehouse}</td>
              <td style={{ ...cell, fontFamily: "monospace", fontSize: 11 }}>{r.orderId}</td>
              <td style={cell}>{r.customer}</td>
              <td style={cell}>{r.deliveredAt ?? "—"}</td>
              <td style={cell}>{r.expiryDate ?? "—"}</td>
              <td style={cellR}>{r.qtyTaken}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
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

    content = (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={hd}>Lot No.</th><th style={hd}>SKU</th><th style={hd}>Product</th><th style={hd}>Warehouse</th><th style={hdR}>Received</th><th style={hdR}>Remaining</th><th style={hd}>Expiry</th><th style={hdR}>Days Left</th><th style={hd}>Status</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const isCritical = r.daysLeft !== null && r.daysLeft <= 30;
            return (
              <tr key={i}>
                <td style={{ ...cell, fontFamily: "monospace", fontSize: 11 }}>{r.lotNumber}</td>
                <td style={cell}>{r.sku}</td>
                <td style={cell}>{r.name}</td>
                <td style={cell}>{r.warehouse}</td>
                <td style={cellR}>{r.receivedQty.toLocaleString()}</td>
                <td style={cellR}>{r.remainingQty.toLocaleString()}</td>
                <td style={{ ...cell, color: isCritical ? "#c00" : "#111" }}>{r.expiryDate ?? "—"}</td>
                <td style={{ ...cellR, color: isCritical ? "#c00" : "#111" }}>{r.daysLeft !== null ? `${r.daysLeft}d` : "—"}</td>
                <td style={{ ...cell, color: r.status === "ACTIVE" ? "#080" : "#888" }}>{r.status}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700 }}>
            <td style={hd} colSpan={4}>Total</td>
            <td style={hdR}>{rows.reduce((s, r) => s + r.receivedQty, 0).toLocaleString()}</td>
            <td style={hdR}>{rows.reduce((s, r) => s + r.remainingQty, 0).toLocaleString()}</td>
            <td style={hd} colSpan={3} />
          </tr>
        </tfoot>
      </table>
    );
  }

  // ── P&L ────────────────────────────────────────────────────────────────────
  if (type === "PL") {
    const jes = await prisma.journalEntry.findMany({
      where: { date: { gte: from, lte: to } },
      include: { lines: true },
    });
    const allLines = jes.flatMap((je) => je.lines.map((l) => ({ code: l.code, dr: Number(l.dr), cr: Number(l.cr) })));
    const tb = computeTrialBalance(allLines);

    const revenue = COA.filter((a) => a.type === "REVENUE");
    const expenses = COA.filter((a) => a.type === "EXPENSE");
    const totalRev = revenue.reduce((s, a) => s + (a.normal === "DR" ? (tb[a.code] ?? 0) : -(tb[a.code] ?? 0)), 0);
    const totalExp = expenses.reduce((s, a) => s + (a.normal === "DR" ? (tb[a.code] ?? 0) : -(tb[a.code] ?? 0)), 0);

    content = (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={hd}>Code</th><th style={hd}>Account</th><th style={hd}>Type</th><th style={hdR}>Balance</th></tr></thead>
        <tbody>
          {[...revenue, ...expenses].map((a) => {
            const raw = tb[a.code] ?? 0;
            const balance = a.normal === "DR" ? raw : -raw;
            return (
              <tr key={a.code} style={{ background: a.type === "REVENUE" ? "#f6fff9" : "#fff8f6" }}>
                <td style={cell}>{a.code}</td>
                <td style={cell}>{a.name}</td>
                <td style={cell}>{a.type}</td>
                <td style={cellR}>{peso(Math.abs(balance))}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700 }}>
            <td style={hd} colSpan={3}>Net Income</td>
            <td style={{ ...hdR, color: totalRev - totalExp >= 0 ? "#080" : "#c00" }}>{peso(Math.abs(totalRev - totalExp))}</td>
          </tr>
        </tfoot>
      </table>
    );
  }

  // ── Unbalanced Collections ────────────────────────────────────────────────
  if (type === "UNBALANCED_COLLECTIONS") {
    const unbalanced = await getUnbalancedCollections();
    content = (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={hd}>Employee</th><th style={hdR}>Unremitted</th><th style={hdR}>Receipts</th><th style={hd}>Oldest Collection</th></tr></thead>
        <tbody>
          {unbalanced.map((u) => (
            <tr key={u.employeeId}>
              <td style={cell}>{u.employeeName}</td>
              <td style={{ ...cellR, color: "#c00" }}>{peso(u.totalUnremitted)}</td>
              <td style={cellR}>{u.count}</td>
              <td style={cell}>{u.oldestCollectedAt.toLocaleDateString("en-PH")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 900, margin: "0 auto", padding: "24px 32px", color: "#111" }}>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <PrintButton backHref={`/reports?type=${type}&from=${fromDate}&to=${toDate}${lotNumberFilter ? `&lotNumber=${encodeURIComponent(lotNumberFilter)}` : ""}`} backLabel="Back to Reports" />

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        {brand.logoUrl && (
          <img src={brand.logoUrl} alt={brand.name} style={{ width: 128, height: "auto", objectFit: "contain", marginBottom: 8, display: "block", margin: "0 auto 8px" }} />
        )}
        <div style={{ fontWeight: 800, fontSize: 16, color: brand.color }}>{brand.name}</div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{brand.tagline} · {brand.address}</div>
        <div style={{ fontWeight: 700, fontSize: 14, marginTop: 6 }}>{title}</div>
        {selectedCustomerName && (
          <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 600, marginTop: 3 }}>Customer: {selectedCustomerName}</div>
        )}
        {(type === "SALES" || type === "PO_SUMMARY" || type === "PL" || type === "LOT_EXPIRY") && (
          <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Period: {fromDate} to {toDate}</div>
        )}
        {type === "LOT_TRACE" && lotNumberFilter && (
          <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 600, marginTop: 3 }}>Lot Filter: {lotNumberFilter}</div>
        )}
        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Generated: {today}</div>
      </div>

      {content}

      <div style={{ marginTop: 32, borderTop: "1px solid #ddd", paddingTop: 10, fontSize: 10, color: "#888", textAlign: "center" }}>
        For internal use only · Unaudited
      </div>
    </div>
  );
}
