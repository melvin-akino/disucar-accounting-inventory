"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { ReportData, ReportType, SalesRow, MarginRow, ArAgingRow, InventoryRow, PoSummaryRow, PlRow, LotExpiryRow, LotTraceRow, InventoryLotRow, UnbalancedCollectionRow, AgentAuditSaleRow, AgentAuditReturnRow, AgentAuditActivityRow } from "./page";
import { HelpButton } from "@/components/HelpButton";

const REPORT_TYPES: { value: ReportType; label: string; desc: string }[] = [
  { value: "SALES",        label: "Sales Summary",       desc: "Revenue by month, top customers" },
  { value: "MARGIN",       label: "Gross Margin",        desc: "Revenue vs FIFO cost of goods sold" },
  { value: "AR_AGING",     label: "AR Aging",            desc: "Outstanding receivables by age bucket" },
  { value: "INVENTORY",    label: "Inventory Snapshot",  desc: "Current stock levels by SKU & warehouse" },
  { value: "PO_SUMMARY",   label: "PO Summary",          desc: "Purchase orders by supplier & status" },
  { value: "PL",           label: "P&L Statement",       desc: "Revenue vs expenses for the period" },
  { value: "LOT_EXPIRY",   label: "Lot Expiry",          desc: "Active lots expiring within date range" },
  { value: "LOT_TRACE",    label: "Lot Traceability",    desc: "Track which orders consumed a lot" },
  { value: "INVENTORY_LOT",label: "Inventory by Lot",    desc: "Current stock broken down by lot/batch" },
  { value: "UNBALANCED_COLLECTIONS", label: "Unbalanced Collections", desc: "Employees holding unremitted field collections" },
  { value: "AGENT_AUDIT",  label: "Sales Agent Audit",   desc: "An agent's sales, returns & activities" },
];

const SHOW_DATE: Record<ReportType, boolean> = {
  SALES: true, MARGIN: true, AR_AGING: false, INVENTORY: false, PO_SUMMARY: true, PL: true,
  LOT_EXPIRY: true, LOT_TRACE: false, INVENTORY_LOT: false, UNBALANCED_COLLECTIONS: false,
  AGENT_AUDIT: true,
};

function peso(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return <th className={right ? "num" : ""}>{children}</th>;
}

function Td({ children, right = false, dim = false, warn = false }: { children: React.ReactNode; right?: boolean; dim?: boolean; warn?: boolean }) {
  const style: React.CSSProperties = right ? { textAlign: "right", fontFamily: "var(--font-geist-mono, monospace)" } : {};
  if (warn) style.color = "oklch(0.55 0.18 25)";
  if (dim) style.color = "oklch(var(--ink-3))";
  return <td style={style}>{children}</td>;
}

// ── Sales ─────────────────────────────────────────────────────────────────────

function SalesTable({ rows }: { rows: SalesRow[] }) {
  if (!rows.length) return <p className="empty-state" style={{ padding: "32px 0" }}>No orders in this period.</p>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><Th>Month</Th><Th right>Orders</Th><Th right>Revenue</Th><Th right>VAT</Th><Th right>CWT</Th><Th right>Net</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <Td>{r.month}</Td>
              <Td right>{r.orders}</Td>
              <Td right>{peso(r.revenue)}</Td>
              <Td right dim>{peso(r.vat)}</Td>
              <Td right dim>{peso(r.cwt)}</Td>
              <Td right>{peso(r.net)}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, borderTop: "2px solid oklch(var(--line))" }}>
            <td>Total</td>
            <td style={{ textAlign: "right" }}>{rows.reduce((s, r) => s + r.orders, 0)}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace" }}>{peso(rows.reduce((s, r) => s + r.revenue, 0))}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace" }}>{peso(rows.reduce((s, r) => s + r.vat, 0))}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace" }}>{peso(rows.reduce((s, r) => s + r.cwt, 0))}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace" }}>{peso(rows.reduce((s, r) => s + r.net, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── AR Aging ──────────────────────────────────────────────────────────────────

const AGING_COLORS: Record<string, string> = {
  "Current": "oklch(0.75 0.15 145)",
  "1–30 d":  "oklch(0.78 0.17 85)",
  "31–60 d": "oklch(0.72 0.16 55)",
  "61–90 d": "oklch(0.62 0.18 40)",
  "90+ d":   "oklch(0.55 0.20 25)",
};

function AgingPill({ bucket }: { bucket: string }) {
  return (
    <span style={{ padding: "1px 8px", borderRadius: 3, fontSize: 11, fontWeight: 600, background: AGING_COLORS[bucket] + "22", color: AGING_COLORS[bucket] }}>
      {bucket}
    </span>
  );
}

function ArAgingTable({ rows, buckets }: { rows: ArAgingRow[]; buckets: Record<string, number> }) {
  if (!rows.length) return <p className="empty-state" style={{ padding: "32px 0" }}>No outstanding receivables.</p>;
  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(buckets).map(([bucket, amt]) => (
          <div key={bucket} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid oklch(var(--line))", background: "oklch(var(--bg-2))", minWidth: 120 }}>
            <div style={{ fontSize: 11, color: "oklch(var(--ink-3))", marginBottom: 4 }}>{bucket}</div>
            <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 14, color: AGING_COLORS[bucket] }}>{peso(amt)}</div>
          </div>
        ))}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><Th>Invoice</Th><Th>Customer</Th><Th>Issued</Th><Th>Due</Th><Th right>Amount</Th><Th right>Paid</Th><Th right>Balance</Th><Th>Age</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="id">{r.id}</td>
                <Td>{r.customer}</Td>
                <Td dim>{r.issued}</Td>
                <Td dim>{r.due}</Td>
                <Td right>{peso(r.amount)}</Td>
                <Td right dim>{peso(r.paid)}</Td>
                <Td right warn={r.daysOverdue > 30}>{peso(r.balance)}</Td>
                <td><AgingPill bucket={r.bucket} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Unbalanced Collections ──────────────────────────────────────────────────

function UnbalancedCollectionsTable({ rows }: { rows: UnbalancedCollectionRow[] }) {
  if (!rows.length) return <p className="empty-state" style={{ padding: "32px 0" }}>No employees currently have unbalanced collections.</p>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><Th>Employee</Th><Th right>Unremitted</Th><Th right>Receipts</Th><Th>Oldest Collection</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employeeId}>
              <Td>{r.employeeName}</Td>
              <Td right warn>{peso(r.totalUnremitted)}</Td>
              <Td right>{r.count}</Td>
              <Td dim>{r.oldestCollectedAt}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sales Agent Audit ─────────────────────────────────────────────────────────

function fmtDT(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Margin colours: healthy, thin, or selling below cost. */
function marginTone(pct: number): string {
  if (pct < 0) return "#dc2626";
  if (pct < 10) return "#d97706";
  return "oklch(0.40 0.09 155)";
}

function MarginTable({ title, rows, firstCol }: { title: string; rows: MarginRow[]; firstCol: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{title}</div>
      {rows.length === 0 ? <p className="empty-state" style={{ padding: "16px 0" }}>Nothing to show.</p> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr>
            <Th>{firstCol}</Th><Th right>Qty</Th><Th right>Revenue</Th><Th right>COGS</Th>
            <Th right>Gross Profit</Th><Th right>Margin</Th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.key}>
              <Td>{r.label}</Td>
              <Td right>{r.qty.toLocaleString()}</Td>
              <Td right>{peso(r.revenue)}</Td>
              <Td right>{peso(r.cogs)}</Td>
              <Td right>{peso(r.grossProfit)}</Td>
              <td className="num" style={{ color: marginTone(r.marginPct), fontWeight: 600 }}>
                {r.marginPct.toFixed(1)}%
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function MarginView({ data }: { data?: ReportData["margin"] }) {
  if (!data) return <p className="empty-state" style={{ padding: "32px 0" }}>No data.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Revenue</div><div style={{ fontWeight: 600 }}>{peso(data.totalRevenue)}</div></div>
        <div><div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Cost of goods sold</div><div style={{ fontWeight: 600 }}>{peso(data.totalCogs)}</div></div>
        <div><div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Gross profit</div><div style={{ fontWeight: 600 }}>{peso(data.totalGrossProfit)}</div></div>
        <div>
          <div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Margin</div>
          <div style={{ fontWeight: 600, color: marginTone(data.marginPct) }}>{data.marginPct.toFixed(1)}%</div>
        </div>
        <div><div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Orders</div><div style={{ fontWeight: 600 }}>{data.ordersCounted}</div></div>
      </div>

      <p style={{ fontSize: 11.5, color: "oklch(var(--ink-3))" }}>
        Delivered orders only. Cost is the FIFO cost each line actually bore at delivery,
        so a line drawn from two receipts carries both — not the product&apos;s current price.
        {data.uncostedLines > 0 && (
          <>
            {" "}
            <strong style={{ color: "#d97706" }}>
              {data.uncostedLines} delivered line{data.uncostedLines === 1 ? " has" : "s have"} no
              cost allocation and {data.uncostedLines === 1 ? "is" : "are"} excluded
            </strong>{" "}
            — these predate FIFO costing, and counting them would overstate margin.
          </>
        )}
      </p>

      <MarginTable title="By month" rows={data.byMonth} firstCol="Month" />
      <MarginTable title="By product" rows={data.byProduct} firstCol="Product" />
      <MarginTable title="Top customers by gross profit" rows={data.byCustomer} firstCol="Customer" />
    </div>
  );
}

function AgentAuditView({ data, agentName }: {
  data?: { sales: AgentAuditSaleRow[]; returns: AgentAuditReturnRow[]; activities: AgentAuditActivityRow[]; totalSalesValue: number; salesCount: number; returnsCount: number };
  agentName?: string;
}) {
  if (!data) return <p className="empty-state" style={{ padding: "32px 0" }}>No data.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Agent</div><div style={{ fontWeight: 600 }}>{agentName ?? "—"}</div></div>
        <div><div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Orders</div><div style={{ fontWeight: 600 }}>{data.salesCount}</div></div>
        <div><div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Sales Value</div><div style={{ fontWeight: 600 }}>{peso(data.totalSalesValue)}</div></div>
        <div><div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Returns</div><div style={{ fontWeight: 600 }}>{data.returnsCount}</div></div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Sales</div>
        {data.sales.length === 0 ? <p className="empty-state" style={{ padding: "16px 0" }}>No orders in this period.</p> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><Th>Order</Th><Th>Date</Th><Th>Customer</Th><Th>State</Th><Th right>Total</Th></tr></thead>
            <tbody>{data.sales.map((r) => (
              <tr key={r.orderId}><td className="id">{r.orderId}</td><Td dim>{fmtDT(r.date)}</Td><Td>{r.customer}</Td><Td dim>{r.state}</Td><Td right>{peso(r.total)}</Td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Returns</div>
        {data.returns.length === 0 ? <p className="empty-state" style={{ padding: "16px 0" }}>No returns in this period.</p> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><Th>Return</Th><Th>Date</Th><Th>Order</Th><Th>Status</Th><Th>Reason</Th></tr></thead>
            <tbody>{data.returns.map((r) => (
              <tr key={r.returnId}><td className="id">{r.returnId.slice(0, 8)}…</td><Td dim>{fmtDT(r.date)}</Td><td className="id">{r.orderId}</td><Td dim>{r.status}</Td><Td>{r.reason}</Td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Activities</div>
        {data.activities.length === 0 ? <p className="empty-state" style={{ padding: "16px 0" }}>No recorded activities in this period.</p> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><Th>Date</Th><Th>Action</Th><Th>Detail</Th></tr></thead>
            <tbody>{data.activities.map((r, i) => (
              <tr key={i}><Td dim>{fmtDT(r.date)}</Td><Td>{r.action}</Td><Td dim>{r.detail}</Td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

// ── Inventory ─────────────────────────────────────────────────────────────────

function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  if (!rows.length) return <p className="empty-state" style={{ padding: "32px 0" }}>No stock records found.</p>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><Th>SKU</Th><Th>Product</Th><Th>Category</Th><Th>Warehouse</Th><Th right>On Hand</Th><Th right>Reserved</Th><Th right>Available</Th><Th right>Reorder At</Th><Th>Status</Th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ opacity: r.available === 0 && !r.belowReorder ? 0.6 : 1 }}>
              <td className="id">{r.sku}</td>
              <Td>{r.name}</Td>
              <Td dim>{r.category}</Td>
              <Td dim>{r.warehouse}</Td>
              <Td right>{r.onHand}</Td>
              <Td right dim>{r.reserved}</Td>
              <Td right warn={r.belowReorder}>{r.available}</Td>
              <Td right dim>{r.reorderAt ?? "—"}</Td>
              <td>
                {r.belowReorder && <span className="pill pill-CANCELLED" style={{ fontSize: 10 }}>Low Stock</span>}
                {!r.belowReorder && r.available > 0 && <span className="pill pill-DELIVERED" style={{ fontSize: 10 }}>OK</span>}
                {!r.belowReorder && r.available === 0 && <span className="pill pill-PREPARING" style={{ fontSize: 10 }}>Out</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── PO Summary ────────────────────────────────────────────────────────────────

const PO_STATUS_PILL: Record<string, string> = {
  EXPECTED: "pill-PREPARING", RECEIVING: "pill-PREPARING", RECEIVED: "pill-DELIVERED", DELAYED: "pill-CANCELLED",
};

function PoSummaryTable({ rows }: { rows: PoSummaryRow[] }) {
  if (!rows.length) return <p className="empty-state" style={{ padding: "32px 0" }}>No purchase orders in this period.</p>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><Th>PO ID</Th><Th>Supplier</Th><Th>Warehouse</Th><Th>Expected</Th><Th right>Lines</Th><Th right>Total</Th><Th>Status</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="id">{r.id}</td>
              <Td>{r.supplier}</Td>
              <Td dim>{r.warehouse}</Td>
              <Td dim>{r.expectedAt}</Td>
              <Td right dim>{r.lines}</Td>
              <Td right>{peso(r.total)}</Td>
              <td><span className={`pill ${PO_STATUS_PILL[r.status] ?? "pill-PREPARING"}`} style={{ fontSize: 10 }}>{r.status}</span></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, borderTop: "2px solid oklch(var(--line))" }}>
            <td colSpan={5}>Total</td>
            <td style={{ textAlign: "right", fontFamily: "monospace" }}>{peso(rows.reduce((s, r) => s + r.total, 0))}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── P&L ──────────────────────────────────────────────────────────────────────

function PlTable({ revenue, expenses, totalRevenue, totalExpenses, netIncome }: {
  revenue: PlRow[]; expenses: PlRow[]; totalRevenue: number; totalExpenses: number; netIncome: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: "oklch(var(--ink-3))", marginBottom: 8 }}>Revenue</div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><Th>Code</Th><Th>Account</Th><Th right>Balance</Th></tr></thead>
            <tbody>
              {revenue.map((r) => (
                <tr key={r.code}>
                  <td className="id">{r.code}</td>
                  <Td>{r.name}</Td>
                  <Td right>{peso(Math.abs(r.balance))}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: "2px solid oklch(var(--line))" }}>
                <td colSpan={2}>Total Revenue</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{peso(Math.abs(totalRevenue))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", color: "oklch(var(--ink-3))", marginBottom: 8 }}>Expenses</div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><Th>Code</Th><Th>Account</Th><Th right>Balance</Th></tr></thead>
            <tbody>
              {expenses.map((r) => (
                <tr key={r.code}>
                  <td className="id">{r.code}</td>
                  <Td>{r.name}</Td>
                  <Td right>{peso(r.balance)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: "2px solid oklch(var(--line))" }}>
                <td colSpan={2}>Total Expenses</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{peso(totalExpenses)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div style={{ gridColumn: "1 / -1", padding: "16px 20px", borderRadius: 8, background: netIncome >= 0 ? "oklch(0.95 0.04 145)" : "oklch(0.95 0.05 25)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Net Income</span>
        <span style={{ fontWeight: 800, fontSize: 18, fontFamily: "monospace", color: netIncome >= 0 ? "oklch(0.38 0.12 145)" : "oklch(0.45 0.18 25)" }}>
          {netIncome < 0 ? "(" : ""}{peso(Math.abs(netIncome))}{netIncome < 0 ? ")" : ""}
        </span>
      </div>
    </div>
  );
}

// ── Lot Expiry ────────────────────────────────────────────────────────────────

function LotExpiryTable({ rows }: { rows: LotExpiryRow[] }) {
  if (!rows.length) return <p className="empty-state" style={{ padding: "32px 0" }}>No lots expiring in this period.</p>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><Th>Lot No.</Th><Th>SKU</Th><Th>Product</Th><Th>Warehouse</Th><Th>Expiry Date</Th><Th right>Remaining</Th><Th right>Days Left</Th><Th>Risk</Th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const isCritical = r.daysLeft <= 30;
            const isWarning = !isCritical && r.daysLeft <= 90;
            return (
              <tr key={i}>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.lotNumber}</td>
                <td className="id">{r.sku}</td>
                <Td>{r.name}</Td>
                <Td dim>{r.warehouse}</Td>
                <Td warn={isCritical}>{r.expiryDate}</Td>
                <Td right>{r.remainingQty.toLocaleString()}</Td>
                <Td right warn={isCritical}>{r.daysLeft}d</Td>
                <td>
                  {isCritical && <span className="pill pill-CANCELLED" style={{ fontSize: 10 }}>Critical</span>}
                  {isWarning  && <span className="pill pill-PENDING"   style={{ fontSize: 10 }}>Warning</span>}
                  {!isCritical && !isWarning && <span className="pill pill-DELIVERED" style={{ fontSize: 10 }}>OK</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Lot Traceability ──────────────────────────────────────────────────────────

function LotTraceTable({ rows }: { rows: LotTraceRow[] }) {
  if (!rows.length) return <p className="empty-state" style={{ padding: "32px 0" }}>No traceability records found. Try a different lot number.</p>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><Th>Lot No.</Th><Th>SKU</Th><Th>Product</Th><Th>Warehouse</Th><Th>Order</Th><Th>Customer</Th><Th>Delivered</Th><Th>Expiry</Th><Th right>Qty</Th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.lotNumber}</td>
              <td className="id">{r.sku}</td>
              <Td>{r.name}</Td>
              <Td dim>{r.warehouse}</Td>
              <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.orderId}</td>
              <Td>{r.customer}</Td>
              <Td dim>{r.deliveredAt ?? "—"}</Td>
              <Td dim>{r.expiryDate ?? "—"}</Td>
              <Td right>{r.qtyTaken}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Inventory by Lot ──────────────────────────────────────────────────────────

function InventoryLotTable({ rows }: { rows: InventoryLotRow[] }) {
  if (!rows.length) return <p className="empty-state" style={{ padding: "32px 0" }}>No lots with remaining stock.</p>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><Th>Lot No.</Th><Th>SKU</Th><Th>Product</Th><Th>Warehouse</Th><Th right>Received</Th><Th right>Remaining</Th><Th>Expiry</Th><Th right>Days Left</Th><Th>Status</Th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const isCritical = r.daysLeft !== null && r.daysLeft <= 30;
            const isWarning  = r.daysLeft !== null && !isCritical && r.daysLeft <= 90;
            return (
              <tr key={i}>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.lotNumber}</td>
                <td className="id">{r.sku}</td>
                <Td>{r.name}</Td>
                <Td dim>{r.warehouse}</Td>
                <Td right dim>{r.receivedQty.toLocaleString()}</Td>
                <Td right>{r.remainingQty.toLocaleString()}</Td>
                <Td warn={isCritical}>{r.expiryDate ?? "—"}</Td>
                <Td right warn={isCritical} dim={r.daysLeft === null}>
                  {r.daysLeft !== null ? `${r.daysLeft}d` : "—"}
                </Td>
                <td>
                  {r.status === "ACTIVE" && !isCritical && !isWarning && <span className="pill pill-DELIVERED" style={{ fontSize: 10 }}>Active</span>}
                  {r.status === "ACTIVE" && isWarning  && <span className="pill pill-PENDING"   style={{ fontSize: 10 }}>Expiring</span>}
                  {r.status === "ACTIVE" && isCritical && <span className="pill pill-CANCELLED" style={{ fontSize: 10 }}>Critical</span>}
                  {r.status === "QUARANTINED" && <span className="pill pill-PREPARING" style={{ fontSize: 10 }}>Quarantined</span>}
                  {r.status === "WRITTEN_OFF" && <span className="pill" style={{ fontSize: 10, opacity: 0.6 }}>Written Off</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main client ───────────────────────────────────────────────────────────────

export function ReportsClient({ data }: { data: ReportData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [type, setType] = useState<ReportType>(data.type);
  const [from, setFrom] = useState(data.from);
  const [to, setTo] = useState(data.to);
  const [customerId, setCustomerId] = useState(data.selectedCustomerId ?? "");
  const [lotNumber, setLotNumber] = useState(data.lotNumberFilter ?? "");
  const [msrCode, setMsrCode] = useState(data.msrCodeFilter ?? "");
  const [brand, setBrand] = useState(data.brandFilter ?? "");
  const [agentId, setAgentId] = useState(data.selectedAgentId ?? "");

  const isAdmin = data.userRole === "ADMIN";

  function apply(newType?: ReportType, newFrom?: string, newTo?: string, newCustomerId?: string, newLotNumber?: string, newMsrCode?: string, newBrand?: string, newAgentId?: string) {
    const t = newType ?? type;
    const f = newFrom ?? from;
    const d = newTo ?? to;
    const cid = newCustomerId !== undefined ? newCustomerId : customerId;
    const ln = newLotNumber !== undefined ? newLotNumber : lotNumber;
    const msr = newMsrCode !== undefined ? newMsrCode : msrCode;
    const br = newBrand !== undefined ? newBrand : brand;
    const ag = newAgentId !== undefined ? newAgentId : agentId;
    setType(t);
    const cidParam = cid ? `&customerId=${cid}` : "";
    const lnParam = ln ? `&lotNumber=${encodeURIComponent(ln)}` : "";
    const msrParam = msr && t === "SALES" ? `&msrCode=${encodeURIComponent(msr)}` : "";
    const brandParam = br && (t === "SALES" || t === "INVENTORY") ? `&brand=${encodeURIComponent(br)}` : "";
    const agentParam = ag && t === "AGENT_AUDIT" ? `&agentId=${ag}` : "";
    startTransition(() => {
      router.push(`/reports?type=${t}&from=${f}&to=${d}${cidParam}${lnParam}${msrParam}${brandParam}${agentParam}`);
    });
  }

  function handleCustomerChange(newCid: string) {
    setCustomerId(newCid);
    apply(undefined, undefined, undefined, newCid);
  }

  function handleMsrChange(newMsr: string) {
    setMsrCode(newMsr);
    apply(undefined, undefined, undefined, undefined, undefined, newMsr);
  }

  function handleBrandChange(newBrand: string) {
    setBrand(newBrand);
    apply(undefined, undefined, undefined, undefined, undefined, undefined, newBrand);
  }

  function handleAgentChange(newAgent: string) {
    setAgentId(newAgent);
    apply(undefined, undefined, undefined, undefined, undefined, undefined, undefined, newAgent);
  }

  const showDate = SHOW_DATE[type];
  const cidParam = data.selectedCustomerId ? `&customerId=${data.selectedCustomerId}` : "";
  const lnParam = data.lotNumberFilter ? `&lotNumber=${encodeURIComponent(data.lotNumberFilter)}` : "";
  const msrParam = data.msrCodeFilter ? `&msrCode=${encodeURIComponent(data.msrCodeFilter)}` : "";
  const brandParam = data.brandFilter ? `&brand=${encodeURIComponent(data.brandFilter)}` : "";
  const agentParam = data.selectedAgentId ? `&agentId=${data.selectedAgentId}` : "";
  const exportUrl = `/api/export/reports?type=${data.type}&from=${data.from}&to=${data.to}${cidParam}${lnParam}${msrParam}${brandParam}${agentParam}`;
  const printUrl = `/print/report?type=${data.type}&from=${data.from}&to=${data.to}${cidParam}${lnParam}${msrParam}${brandParam}${agentParam}`;

  const totalOrders = data.sales?.totalOrders ?? 0;
  const totalRevenue = data.sales?.totalRevenue ?? 0;
  const arTotal = data.arAging?.totalBalance ?? 0;
  const invSkus = data.inventory?.totalSkus ?? 0;
  const invLow = data.inventory?.belowReorderCount ?? 0;
  const poTotal = data.poSummary?.totalValue ?? 0;
  const netIncome = data.pl?.netIncome ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-2">
            <h1 style={{ fontSize: 17, fontWeight: 600 }}>Report Builder</h1>
            <HelpButton slug="reports" label="Help: Reports" />
          </div>
          <p style={{ fontSize: 12, color: "oklch(var(--ink-3))", marginTop: 2 }}>
            Generate, view, and export operational reports
          </p>
        </div>
        <a href={exportUrl} className="btn btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </a>
        <a href={printUrl} target="_blank" className="btn btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print
        </a>
      </div>

      {/* Report type selector */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(152px, 1fr))", gap: 8, marginBottom: 18 }}>
        {REPORT_TYPES.map((rt) => (
          <button
            key={rt.value}
            onClick={() => apply(rt.value, undefined, undefined, (rt.value === "SALES" || rt.value === "AR_AGING") ? customerId : "", rt.value === "LOT_TRACE" ? lotNumber : "", rt.value === "SALES" ? msrCode : "", (rt.value === "SALES" || rt.value === "INVENTORY") ? brand : "")}
            style={{
              padding: "10px 12px", borderRadius: 8, border: "1px solid",
              borderColor: type === rt.value ? "oklch(var(--accent))" : "oklch(var(--line))",
              background: type === rt.value ? "oklch(var(--accent) / 0.08)" : "oklch(var(--bg))",
              cursor: "pointer", textAlign: "left", transition: "all 0.15s",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 12.5, color: type === rt.value ? "oklch(var(--accent))" : "oklch(var(--ink))" }}>
              {rt.label}
            </div>
            <div style={{ fontSize: 11, color: "oklch(var(--ink-3))", marginTop: 2, lineHeight: 1.3 }}>{rt.desc}</div>
          </button>
        ))}
      </div>

      {/* Customer filter (Admin only) — SALES and AR Aging only */}
      {isAdmin && data.customers.length > 0 && (type === "SALES" || type === "AR_AGING") && (
        <div className="filters" style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "oklch(var(--ink-3))", whiteSpace: "nowrap" }}>Customer</span>
            <select
              className="field-input"
              style={{ height: 32, minWidth: 220 }}
              value={customerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              disabled={isPending}
            >
              <option value="">All customers</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          {data.selectedCustomerName && (
            <div style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, background: "oklch(var(--accent) / 0.08)", border: "1px solid oklch(var(--accent) / 0.25)", color: "oklch(var(--accent))", fontWeight: 500 }}>
              Showing results for: <strong>{data.selectedCustomerName}</strong>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 8, height: 20, padding: "0 6px", fontSize: 11 }}
                onClick={() => handleCustomerChange("")}
              >✕ Clear</button>
            </div>
          )}
        </div>
      )}

      {/* MSR Code filter — SALES only */}
      {type === "SALES" && data.msrCodes.length > 0 && (
        <div className="filters" style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "oklch(var(--ink-3))", whiteSpace: "nowrap" }}>MSR Code</span>
            <select
              className="field-input"
              style={{ height: 32, minWidth: 180 }}
              value={msrCode}
              onChange={(e) => handleMsrChange(e.target.value)}
              disabled={isPending}
            >
              <option value="">All MSR codes</option>
              {data.msrCodes.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          {data.msrCodeFilter && (
            <div style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, background: "oklch(var(--accent) / 0.08)", border: "1px solid oklch(var(--accent) / 0.25)", color: "oklch(var(--accent))", fontWeight: 500 }}>
              MSR: <strong>{data.msrCodeFilter}</strong>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 8, height: 20, padding: "0 6px", fontSize: 11 }}
                onClick={() => handleMsrChange("")}
              >✕ Clear</button>
            </div>
          )}
        </div>
      )}

      {/* Brand filter — SALES / INVENTORY only */}
      {(type === "SALES" || type === "INVENTORY") && data.brands.length > 0 && (
        <div className="filters" style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "oklch(var(--ink-3))", whiteSpace: "nowrap" }}>Brand</span>
            <select
              className="field-input"
              style={{ height: 32, minWidth: 180 }}
              value={brand}
              onChange={(e) => handleBrandChange(e.target.value)}
              disabled={isPending}
            >
              <option value="">All brands</option>
              {data.brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          {data.brandFilter && (
            <div style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, background: "oklch(var(--accent) / 0.08)", border: "1px solid oklch(var(--accent) / 0.25)", color: "oklch(var(--accent))", fontWeight: 500 }}>
              Brand: <strong>{data.brandFilter}</strong>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 8, height: 20, padding: "0 6px", fontSize: 11 }}
                onClick={() => handleBrandChange("")}
              >✕ Clear</button>
            </div>
          )}
        </div>
      )}

      {/* Agent picker — AGENT_AUDIT only */}
      {type === "AGENT_AUDIT" && (
        <div className="filters" style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "oklch(var(--ink-3))", whiteSpace: "nowrap" }}>Sales Agent</span>
            <select
              className="field-input"
              style={{ height: 32, minWidth: 220 }}
              value={agentId}
              onChange={(e) => handleAgentChange(e.target.value)}
              disabled={isPending}
            >
              <option value="">— Select agent —</option>
              {data.agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Lot number filter for LOT_TRACE */}
      {type === "LOT_TRACE" && (
        <div className="filters" style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "oklch(var(--ink-3))", whiteSpace: "nowrap" }}>Lot Number</span>
            <input
              type="text"
              className="field-input"
              style={{ height: 32, width: 200, fontFamily: "monospace" }}
              placeholder="LOT-XXXXX (partial match)"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") apply(undefined, undefined, undefined, undefined, lotNumber); }}
            />
          </label>
          <button className="btn btn-primary btn-sm" onClick={() => apply(undefined, undefined, undefined, undefined, lotNumber)} disabled={isPending}>
            {isPending ? "Loading…" : "Search"}
          </button>
          {lotNumber && (
            <button className="btn btn-sm" onClick={() => { setLotNumber(""); apply(undefined, undefined, undefined, undefined, ""); }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      {showDate && (
        <div className="filters" style={{ marginBottom: 20 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "oklch(var(--ink-3))" }}>From</span>
            <input
              type="date" className="field-input" style={{ height: 32, width: 150 }}
              value={from} onChange={(e) => setFrom(e.target.value)}
              onBlur={() => apply(undefined, from, to, customerId, undefined, msrCode, brand)}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "oklch(var(--ink-3))" }}>To</span>
            <input
              type="date" className="field-input" style={{ height: 32, width: 150 }}
              value={to} onChange={(e) => setTo(e.target.value)}
              onBlur={() => apply(undefined, from, to, customerId, undefined, msrCode, brand)}
            />
          </label>
          <button className="btn btn-primary btn-sm" onClick={() => apply(undefined, from, to, customerId, undefined, msrCode, brand)} disabled={isPending}>
            {isPending ? "Loading…" : "Run Report"}
          </button>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {data.type === "SALES" && (
          <>
            <div className="stat-card"><div className="stat-label">Total Orders</div><div className="stat-value">{totalOrders}</div></div>
            <div className="stat-card"><div className="stat-label">Total Revenue</div><div className="stat-value" style={{ fontFamily: "monospace" }}>₱{(totalRevenue / 1_000_000).toFixed(2)}M</div></div>
            <div className="stat-card"><div className="stat-label">Avg Order Value</div><div className="stat-value" style={{ fontFamily: "monospace" }}>{totalOrders > 0 ? `₱${(totalRevenue / totalOrders / 1000).toFixed(1)}K` : "—"}</div></div>
            <div className="stat-card"><div className="stat-label">Top Customer</div><div className="stat-value" style={{ fontSize: 13 }}>{data.sales?.byCustomer[0]?.name ?? "—"}</div></div>
          </>
        )}
        {data.type === "MARGIN" && (
          <>
            <div className="stat-card"><div className="stat-label">Revenue</div><div className="stat-value" style={{ fontFamily: "monospace" }}>{peso(data.margin?.totalRevenue ?? 0)}</div></div>
            <div className="stat-card"><div className="stat-label">Cost of Goods Sold</div><div className="stat-value" style={{ fontFamily: "monospace" }}>{peso(data.margin?.totalCogs ?? 0)}</div></div>
            <div className="stat-card"><div className="stat-label">Gross Profit</div><div className="stat-value" style={{ fontFamily: "monospace" }}>{peso(data.margin?.totalGrossProfit ?? 0)}</div></div>
            <div className="stat-card"><div className="stat-label">Gross Margin</div><div className="stat-value" style={{ color: marginTone(data.margin?.marginPct ?? 0) }}>{(data.margin?.marginPct ?? 0).toFixed(1)}%</div></div>
          </>
        )}
        {data.type === "AR_AGING" && (
          <>
            <div className="stat-card"><div className="stat-label">Outstanding Invoices</div><div className="stat-value">{data.arAging?.rows.length ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Total AR Balance</div><div className="stat-value" style={{ fontFamily: "monospace", color: arTotal > 0 ? "oklch(0.55 0.18 25)" : undefined }}>₱{(arTotal / 1_000_000).toFixed(2)}M</div></div>
            <div className="stat-card"><div className="stat-label">90+ Days Overdue</div><div className="stat-value" style={{ color: (data.arAging?.buckets["90+ d"] ?? 0) > 0 ? "oklch(0.55 0.18 25)" : undefined }}>₱{((data.arAging?.buckets["90+ d"] ?? 0) / 1000).toFixed(0)}K</div></div>
            <div className="stat-card"><div className="stat-label">Current (not overdue)</div><div className="stat-value">₱{((data.arAging?.buckets["Current"] ?? 0) / 1000).toFixed(0)}K</div></div>
          </>
        )}
        {data.type === "INVENTORY" && (
          <>
            <div className="stat-card"><div className="stat-label">Total SKUs</div><div className="stat-value">{invSkus}</div></div>
            <div className="stat-card"><div className="stat-label">Stock Records</div><div className="stat-value">{data.inventory?.rows.length ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Below Reorder</div><div className="stat-value" style={{ color: invLow > 0 ? "oklch(0.55 0.18 25)" : undefined }}>{invLow}</div></div>
            <div className="stat-card"><div className="stat-label">Out of Stock</div><div className="stat-value">{data.inventory?.rows.filter(r => r.available === 0).length ?? 0}</div></div>
          </>
        )}
        {data.type === "PO_SUMMARY" && (
          <>
            <div className="stat-card"><div className="stat-label">Total POs</div><div className="stat-value">{data.poSummary?.rows.length ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Total Value</div><div className="stat-value" style={{ fontFamily: "monospace" }}>₱{(poTotal / 1_000).toFixed(0)}K</div></div>
            <div className="stat-card"><div className="stat-label">Received</div><div className="stat-value">{data.poSummary?.byStatus["RECEIVED"] ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Delayed</div><div className="stat-value" style={{ color: (data.poSummary?.byStatus["DELAYED"] ?? 0) > 0 ? "oklch(0.55 0.18 25)" : undefined }}>{data.poSummary?.byStatus["DELAYED"] ?? 0}</div></div>
          </>
        )}
        {data.type === "PL" && (
          <>
            <div className="stat-card"><div className="stat-label">Total Revenue</div><div className="stat-value" style={{ fontFamily: "monospace" }}>₱{(Math.abs(data.pl?.totalRevenue ?? 0) / 1_000_000).toFixed(2)}M</div></div>
            <div className="stat-card"><div className="stat-label">Total Expenses</div><div className="stat-value" style={{ fontFamily: "monospace" }}>₱{((data.pl?.totalExpenses ?? 0) / 1_000_000).toFixed(2)}M</div></div>
            <div className="stat-card"><div className="stat-label">Net Income</div><div className="stat-value" style={{ fontFamily: "monospace", color: netIncome < 0 ? "oklch(0.55 0.18 25)" : "oklch(0.40 0.14 145)" }}>₱{(Math.abs(netIncome) / 1_000_000).toFixed(2)}M</div></div>
            <div className="stat-card"><div className="stat-label">Margin</div><div className="stat-value">{data.pl?.totalRevenue ? ((netIncome / Math.abs(data.pl.totalRevenue)) * 100).toFixed(1) + "%" : "—"}</div></div>
          </>
        )}
        {data.type === "LOT_EXPIRY" && (
          <>
            <div className="stat-card"><div className="stat-label">Lots in Range</div><div className="stat-value">{data.lotExpiry?.rows.length ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Critical (≤30d)</div><div className="stat-value" style={{ color: (data.lotExpiry?.criticalCount ?? 0) > 0 ? "oklch(0.55 0.18 25)" : undefined }}>{data.lotExpiry?.criticalCount ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Warning (31–90d)</div><div className="stat-value" style={{ color: (data.lotExpiry?.warningCount ?? 0) > 0 ? "#d97706" : undefined }}>{data.lotExpiry?.warningCount ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Total Remaining</div><div className="stat-value">{(data.lotExpiry?.rows.reduce((s, r) => s + r.remainingQty, 0) ?? 0).toLocaleString()}</div></div>
          </>
        )}
        {data.type === "LOT_TRACE" && (
          <>
            <div className="stat-card"><div className="stat-label">Records Found</div><div className="stat-value">{data.lotTrace?.rows.length ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Unique Lots</div><div className="stat-value">{new Set(data.lotTrace?.rows.map(r => r.lotNumber)).size}</div></div>
            <div className="stat-card"><div className="stat-label">Unique Orders</div><div className="stat-value">{new Set(data.lotTrace?.rows.map(r => r.orderId)).size}</div></div>
            <div className="stat-card"><div className="stat-label">Total Qty Traced</div><div className="stat-value">{(data.lotTrace?.rows.reduce((s, r) => s + r.qtyTaken, 0) ?? 0).toLocaleString()}</div></div>
          </>
        )}
        {data.type === "INVENTORY_LOT" && (
          <>
            <div className="stat-card"><div className="stat-label">Total Lots</div><div className="stat-value">{data.inventoryLot?.rows.length ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Active Lots</div><div className="stat-value">{data.inventoryLot?.activeLots ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Expiring ≤90d</div><div className="stat-value" style={{ color: (data.inventoryLot?.expiringSoon ?? 0) > 0 ? "#d97706" : undefined }}>{data.inventoryLot?.expiringSoon ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Total Remaining</div><div className="stat-value">{(data.inventoryLot?.rows.reduce((s, r) => s + r.remainingQty, 0) ?? 0).toLocaleString()}</div></div>
          </>
        )}
        {data.type === "UNBALANCED_COLLECTIONS" && (
          <>
            <div className="stat-card"><div className="stat-label">Employees Flagged</div><div className="stat-value" style={{ color: (data.unbalancedCollections?.rows.length ?? 0) > 0 ? "oklch(0.55 0.18 25)" : undefined }}>{data.unbalancedCollections?.rows.length ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Total Unremitted</div><div className="stat-value" style={{ fontFamily: "monospace" }}>{peso(data.unbalancedCollections?.totalUnremitted ?? 0)}</div></div>
          </>
        )}
      </div>

      {/* Top customers for sales */}
      {data.type === "SALES" && (data.sales?.byCustomer.length ?? 0) > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head"><span className="card-h">Top Customers by Revenue</span></div>
          <div className="card-body" style={{ padding: "0 0 8px" }}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><Th>Customer</Th><Th right>Orders</Th><Th right>Revenue</Th></tr></thead>
                <tbody>
                  {data.sales!.byCustomer.map((c, i) => (
                    <tr key={i}>
                      <Td>{c.name}</Td>
                      <Td right dim>{c.orders}</Td>
                      <Td right>{peso(c.revenue)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sales by brand */}
      {data.type === "SALES" && (data.sales?.byBrand.length ?? 0) > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head"><span className="card-h">Sales by Brand</span></div>
          <div className="card-body" style={{ padding: "0 0 8px" }}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><Th>Brand</Th><Th right>Orders</Th><Th right>Revenue</Th></tr></thead>
                <tbody>
                  {data.sales!.byBrand.map((b, i) => (
                    <tr key={i}>
                      <Td>{b.brand}</Td>
                      <Td right dim>{b.orders}</Td>
                      <Td right>{peso(b.revenue)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Main table */}
      <div className="card">
        <div className="card-head">
          <span className="card-h">
            {REPORT_TYPES.find((r) => r.value === data.type)?.label}
            {showDate && <span style={{ fontWeight: 400, color: "oklch(var(--ink-3))", fontSize: 12, marginLeft: 8 }}>{data.from} → {data.to}</span>}
            {data.type === "LOT_TRACE" && data.lotNumberFilter && (
              <span style={{ fontWeight: 400, color: "oklch(var(--ink-3))", fontSize: 12, marginLeft: 8 }}>Lot: {data.lotNumberFilter}</span>
            )}
            {data.type === "SALES" && data.msrCodeFilter && (
              <span style={{ fontWeight: 400, color: "oklch(var(--ink-3))", fontSize: 12, marginLeft: 8 }}>MSR: {data.msrCodeFilter}</span>
            )}
            {(data.type === "SALES" || data.type === "INVENTORY") && data.brandFilter && (
              <span style={{ fontWeight: 400, color: "oklch(var(--ink-3))", fontSize: 12, marginLeft: 8 }}>Brand: {data.brandFilter}</span>
            )}
          </span>
        </div>
        <div className="card-body" style={{ padding: "0 0 8px" }}>
          {data.type === "SALES"        && <SalesTable rows={data.sales?.monthly ?? []} />}
          {data.type === "MARGIN"       && <MarginView data={data.margin} />}
          {data.type === "AR_AGING"     && <ArAgingTable rows={data.arAging?.rows ?? []} buckets={data.arAging?.buckets ?? {}} />}
          {data.type === "INVENTORY"    && <InventoryTable rows={data.inventory?.rows ?? []} />}
          {data.type === "PO_SUMMARY"   && <PoSummaryTable rows={data.poSummary?.rows ?? []} />}
          {data.type === "PL"           && data.pl && <PlTable {...data.pl} />}
          {data.type === "LOT_EXPIRY"   && <LotExpiryTable rows={data.lotExpiry?.rows ?? []} />}
          {data.type === "LOT_TRACE"    && <LotTraceTable rows={data.lotTrace?.rows ?? []} />}
          {data.type === "INVENTORY_LOT"&& <InventoryLotTable rows={data.inventoryLot?.rows ?? []} />}
          {data.type === "UNBALANCED_COLLECTIONS" && <UnbalancedCollectionsTable rows={data.unbalancedCollections?.rows ?? []} />}
          {data.type === "AGENT_AUDIT" && (
            data.selectedAgentId
              ? <AgentAuditView data={data.agentAudit} agentName={data.selectedAgentName} />
              : <div className="empty-state" style={{ padding: "40px 0" }}>Select a sales agent to view their audit.</div>
          )}
        </div>
      </div>
    </div>
  );
}
