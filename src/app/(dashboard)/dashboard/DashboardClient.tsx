"use client";

import Link from "next/link";
import { peso, shortPeso, fmtDate } from "@/lib/utils";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { closeShift } from "./shift-actions";
import type { JeSource, OrderState } from "@prisma/client";
import type { Role } from "@prisma/client";

// ── Shared types ──────────────────────────────────────────────────────────────
interface OrderRow { id: string; state: string; customerName: string; total: number; createdAt: string }
interface JeRow { id: string; date: string; source: JeSource; memo: string; amount: number }
interface StockAlert { name: string; warehouse: string; onHand: number; reorderAt: number }
interface ShipmentRow { id: string; orderId: string; customerName: string; trackingNumber: string | null; eta: string | null; total: number }

interface TillRow {
  id: string; state: string; channel: string; customerName: string;
  total: number; due: number; createdAt: string;
}

interface MonthlyPoint { month: string; revenue: number; orders: number }

interface ExpiryLot { id: string; lotNumber: string; skuName: string; warehouseName: string; remainingQty: number; expiryDate: string }
interface MorningActivityRow { agentId: string; agentName: string; ordersToday: number }

interface Props {
  role: Role;
  // finance / admin
  ar?: { open: number; overdue: number };
  ap?: { open: number; overdue: number };
  birDue?: number;
  trialBalance?: Record<string, number>;
  recentJe?: JeRow[];
  overdueInvoices?: { id: string; customerName: string; amount: number; due: string }[];
  monthlyTrend?: MonthlyPoint[];
  // orders
  orderPipeline?: { state: string; count: number }[];
  recentOrders?: OrderRow[];
  lowStockCount?: number;
  lowStockItems?: StockAlert[];
  // expiry
  nearExpiryLots?: ExpiryLot[];
  // morning activity (admin)
  morningActivity?: MorningActivityRow[];
  // agent
  agentStats?: { total: number; pending: number; thisMonth: number; customers: number };
  // cashier
  currentShift?: {
    id: string;
    openedAt: string;
    cashierName: string;
    zRead: {
      expectedCash: number;
      nonCashTotal: number;
      totalTaken: number;
      paymentCount: number;
      byTender: { tender: string; label: string; count: number; amount: number }[];
    };
  } | null;
  tillQueue?: TillRow[];
  tillStats?: {
    toPrice: number;
    toCollect: number;
    dueTotal: number;
    takenToday: number;
    paymentsToday: number;
  };
  // driver
  myShipments?: ShipmentRow[];
}

// ── Shared primitives ─────────────────────────────────────────────────────────
const ORDER_COLOR: Record<string, string> = {
  PENDING:"oklch(0.55 0.13 240)", APPROVED:"oklch(0.55 0.14 290)",
  AWAITING_PAYMENT:"oklch(0.58 0.14 55)", PAID:"oklch(0.50 0.11 175)", PREPARING:"oklch(0.55 0.12 80)",
  SHIPPED:"oklch(0.45 0.14 200)", DELIVERED:"oklch(0.45 0.13 145)", CANCELLED:"oklch(0.55 0.10 25)",
};
const SOURCE_COLOR: Record<string, string> = {
  AR:"oklch(0.55 0.13 145)", AP:"oklch(0.55 0.12 25)", BANK:"oklch(0.55 0.12 240)",
  PAYROLL:"oklch(0.55 0.12 290)", INV:"oklch(0.55 0.12 80)", GL:"oklch(0.55 0.04 250)", OPENING:"oklch(0.55 0.04 250)",
};
function KpiCard({ label, value, sub, warn, accent, href }: { label: string; value: string; sub: string; warn?: boolean; accent?: string; href?: string }) {
  const border = warn ? "3px solid oklch(0.55 0.14 25)" : `3px solid ${accent ?? "oklch(var(--accent))"}`;
  const inner = (
    <div className="stat-card" style={{ borderTop: border }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-trend" style={warn ? { color: "oklch(0.50 0.14 25)" } : undefined}>{sub}</div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

function AlertBanner({ msg, href, cta }: { msg: string; href: string; cta: string }) {
  return (
    <div className="callout mb-4" style={{ background:"oklch(0.97 0.04 25)", borderColor:"oklch(0.85 0.10 25)" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(0.55 0.14 25)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
      <span style={{ flex:1, fontSize:13 }}>{msg}</span>
      <Link href={href} className="btn btn-sm">{cta}</Link>
    </div>
  );
}

function ExpiryAlertCard({ lots }: { lots: ExpiryLot[] }) {
  if (!lots || lots.length === 0) return null;
  const today = new Date();
  const expired = lots.filter(l => new Date(l.expiryDate) < today);
  const critical = lots.filter(l => {
    const d = new Date(l.expiryDate);
    const days = Math.ceil((d.getTime() - today.getTime()) / 86400000);
    return days >= 0 && days <= 30;
  });
  const warn = lots.filter(l => {
    const d = new Date(l.expiryDate);
    const days = Math.ceil((d.getTime() - today.getTime()) / 86400000);
    return days > 30 && days <= 90;
  });

  return (
    <div className="card" style={{ borderTop: "3px solid #d97706" }}>
      <div className="card-head">
        <span className="card-h" style={{ color: "#d97706" }}>
          ⚠ Near-Expiry Lots ({lots.length})
        </span>
        <Link href="/inventory" className="btn btn-ghost btn-sm ml-auto">Manage lots →</Link>
      </div>
      <div style={{ padding: "8px 16px 4px", display: "flex", gap: 16, borderBottom: "1px solid oklch(var(--line))" }}>
        {expired.length > 0 && (
          <div style={{ fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: "#dc2626" }}>{expired.length}</span>
            <span style={{ color: "oklch(var(--ink-3))", marginLeft: 4 }}>expired</span>
          </div>
        )}
        {critical.length > 0 && (
          <div style={{ fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: "#d97706" }}>{critical.length}</span>
            <span style={{ color: "oklch(var(--ink-3))", marginLeft: 4 }}>critical (≤30d)</span>
          </div>
        )}
        {warn.length > 0 && (
          <div style={{ fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: "oklch(0.50 0.12 60)" }}>{warn.length}</span>
            <span style={{ color: "oklch(var(--ink-3))", marginLeft: 4 }}>warning (≤90d)</span>
          </div>
        )}
      </div>
      <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Lot</th>
              <th>Product</th>
              <th>Warehouse</th>
              <th className="num">Qty</th>
              <th>Expiry</th>
            </tr>
          </thead>
          <tbody>
            {lots.slice(0, 5).map(l => {
              const expiry = new Date(l.expiryDate);
              const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
              const isExpired = days < 0;
              const isCritical = days >= 0 && days <= 30;
              return (
                <tr key={l.id}>
                  <td className="id" style={{ fontWeight: 600 }}>{l.lotNumber}</td>
                  <td style={{ fontWeight: 500 }}>{l.skuName}</td>
                  <td className="dim">{l.warehouseName}</td>
                  <td className="num">{l.remainingQty.toLocaleString()}</td>
                  <td>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isExpired ? "#dc2626" : isCritical ? "#d97706" : "oklch(0.50 0.12 60)",
                    }}>
                      {expiry.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                      {isExpired ? " — EXPIRED" : ` (${days}d)`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MorningActivityCard({ agents }: { agents: MorningActivityRow[] }) {
  if (!agents || agents.length === 0) return null;
  const activeCount = agents.filter(a => a.ordersToday > 0).length;

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-h">Morning Order Activity</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "oklch(var(--ink-3))" }}>
          {activeCount} of {agents.length} agents · before 12:00 PM today
        </span>
      </div>
      <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Agent</th>
              <th className="num">Orders This Morning</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a => (
              <tr key={a.agentId}>
                <td style={{ fontWeight: 500 }}>{a.agentName}</td>
                <td className="num">{a.ordersToday}</td>
                <td>
                  <span className={`pill ${a.ordersToday > 0 ? "pill-DELIVERED" : "pill-PENDING"}`}>
                    {a.ordersToday > 0 ? "Active" : "No orders yet"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PipelineBar({ pipeline }: { pipeline: { state: string; count: number }[] }) {
  const max = Math.max(...pipeline.map(o => o.count), 1);
  return (
    <div className="card-body">
      {pipeline.map(o => (
        <div key={o.state} style={{ marginBottom: 10 }}>
          <div className="flex justify-between mb-1">
            <span style={{ fontSize:12, textTransform:"capitalize" }}>{o.state.toLowerCase()}</span>
            <span style={{ fontSize:12, fontWeight:600, fontFamily:"monospace" }}>{o.count}</span>
          </div>
          <div className="pl-bar-track">
            <div className="pl-bar-fill" style={{ width:`${(o.count/max)*100}%`, background: ORDER_COLOR[o.state] ?? "oklch(var(--accent))" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentOrdersTable({ orders, title = "Recent orders" }: { orders: OrderRow[]; title?: string }) {
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-h">{title}</span>
        <Link href="/orders" className="btn btn-ghost btn-sm ml-auto">See all →</Link>
      </div>
      <div className="tbl-wrap" style={{ border:0, borderRadius:0, borderTop:"1px solid oklch(var(--line))" }}>
        <table className="tbl">
          <thead><tr><th className="id">Order</th><th>Customer</th><th className="num">Total</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={5} style={{ textAlign:"center", padding:"20px 0", color:"oklch(var(--ink-3))", fontSize:12.5 }}>No orders yet</td></tr>}
            {orders.map(o => (
              <tr key={o.id}>
                <td className="id"><Link href={`/orders/${o.id}`} style={{ color:"oklch(var(--accent))" }}>{o.id}</Link></td>
                <td>{o.customerName}</td>
                <td className="num">{peso(o.total)}</td>
                <td><span style={{ fontSize:11, padding:"2px 8px", borderRadius:3, background:`color-mix(in oklch, ${ORDER_COLOR[o.state] ?? "grey"} 12%, white)`, color:ORDER_COLOR[o.state], fontWeight:500 }}>{o.state}</span></td>
                <td className="dim" style={{ fontSize:12 }}>{fmtDate(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Revenue trend SVG chart ───────────────────────────────────────────────────
function RevenueTrendChart({ data }: { data: MonthlyPoint[] }) {
  if (!data || data.length === 0) return (
    <div style={{ display: "grid", placeItems: "center", height: 120, color: "oklch(var(--ink-3))", fontSize: 12.5 }}>No data yet</div>
  );

  const W = 400, H = 120, PAD_L = 8, PAD_R = 8, PAD_T = 12, PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const max = Math.max(...data.map(d => d.revenue), 1);
  const step = innerW / Math.max(data.length - 1, 1);

  function x(i: number) { return PAD_L + i * step; }
  function y(val: number) { return PAD_T + innerH - (val / max) * innerH; }

  const pts = data.map((d, i) => `${x(i)},${y(d.revenue)}`).join(" ");
  const fillPts = `${x(0)},${H - PAD_B} ${pts} ${x(data.length - 1)},${H - PAD_B}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 120, overflow: "visible" }}>
      {/* Area fill */}
      <polygon points={fillPts} fill="oklch(var(--accent) / 0.08)" />
      {/* Line */}
      <polyline points={pts} fill="none" stroke="oklch(var(--accent))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots + labels */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.revenue)} r={3.5} fill="oklch(var(--accent))" />
          {d.revenue > 0 && (
            <text x={x(i)} y={y(d.revenue) - 6} textAnchor="middle" fontSize="9" fill="oklch(var(--ink-2))">
              {d.revenue >= 1e6 ? (d.revenue / 1e6).toFixed(1) + "M" : d.revenue >= 1e3 ? Math.round(d.revenue / 1e3) + "K" : Math.round(d.revenue).toString()}
            </text>
          )}
          <text x={x(i)} y={H - PAD_B + 14} textAnchor="middle" fontSize="9" fill="oklch(var(--ink-3))">
            {d.month}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── ADMIN view ────────────────────────────────────────────────────────────────
function AdminDashboard({ orderPipeline=[], ar, ap, birDue=0, lowStockCount=0, lowStockItems=[], trialBalance:tb={}, recentOrders=[], recentJe=[], monthlyTrend=[], nearExpiryLots=[], morningActivity=[] }: Props) {
  const cash = (tb["1000"]??0)+(tb["1010"]??0)+(tb["1020"]??0);
  const revenue = Math.abs(tb["4000"]??0);
  const expenses = (tb["5000"]??0)+(tb["5100"]??0)+(tb["5200"]??0)+(tb["5300"]??0)+(tb["5400"]??0)+(tb["5500"]??0)+(tb["5600"]??0)+(tb["5700"]??0);
  const netIncome = revenue - expenses;
  const totalOrders = orderPipeline.reduce((s,o)=>s+o.count,0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ fontSize:17, fontWeight:600 }}>Dashboard</h1>
          <p style={{ fontSize:12, color:"oklch(var(--ink-3))" }}>Admin overview · {fmtDate(new Date().toISOString())}</p>
        </div>
        <Link href="/orders/new" className="btn btn-accent">+ New Order</Link>
      </div>
      {(birDue ?? 0) > 0 && <AlertBanner msg={`${birDue} BIR filing${birDue! > 1?"s":""} due`} href="/ledger" cta="Open accounting" />}
      {lowStockCount > 0 && <AlertBanner msg={`${lowStockCount} SKU${lowStockCount>1?"s":""} at or below reorder threshold`} href="/inventory" cta="View inventory" />}
      {nearExpiryLots.length > 0 && <AlertBanner msg={`${nearExpiryLots.length} lot${nearExpiryLots.length>1?"s":""} expiring soon — review and quarantine or write off`} href="/inventory" cta="View lots" />}
      <div className="stat-grid mb-4">
        <KpiCard label="Cash position" value={shortPeso(cash)} sub="Bank accounts" href="/ledger" />
        <KpiCard label="Net income (YTD)" value={shortPeso(netIncome)} sub={`${revenue>0?((netIncome/revenue)*100).toFixed(1):0}% margin`} href="/ledger" />
        <KpiCard label="AR outstanding" value={shortPeso(ar?.open??0)} sub={ar?.overdue ? `${shortPeso(ar.overdue)} overdue`:"All current"} warn={!!ar?.overdue} href="/ledger" />
        <KpiCard label="AP outstanding" value={shortPeso(ap?.open??0)} sub={ap?.overdue ? `${shortPeso(ap.overdue)} overdue`:"All current"} warn={!!ap?.overdue} href="/ledger" />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="card-head"><span className="card-h">Order pipeline</span><span style={{ fontSize:12, marginLeft:"auto", color:"oklch(var(--ink-3))" }}>{totalOrders} total</span></div>
          <PipelineBar pipeline={orderPipeline} />
          <div style={{ padding:"10px 16px", borderTop:"1px solid oklch(var(--line))" }}><Link href="/orders" className="btn btn-sm w-full" style={{ justifyContent:"center" }}>View all orders →</Link></div>
        </div>
        <div className="card">
          <div className="card-head">
            <span className="card-h">Revenue trend · last 6 months</span>
            <span style={{ marginLeft:"auto", fontSize:12, color:"oklch(var(--ink-3))" }}>{shortPeso(revenue)} YTD</span>
          </div>
          <div style={{ padding:"8px 16px" }}>
            <RevenueTrendChart data={monthlyTrend} />
          </div>
          <div style={{ padding:"8px 16px 0", borderTop:"1px solid oklch(var(--line))", display:"flex", gap:24 }}>
            <div><div style={{ fontSize:11, color:"oklch(var(--ink-3))" }}>Revenue YTD</div><div style={{ fontSize:14, fontWeight:600, color:"oklch(0.45 0.13 145)" }}>{shortPeso(revenue)}</div></div>
            <div><div style={{ fontSize:11, color:"oklch(var(--ink-3))" }}>Expenses YTD</div><div style={{ fontSize:14, fontWeight:600, color:"oklch(0.45 0.12 25)" }}>{shortPeso(expenses)}</div></div>
            <div><div style={{ fontSize:11, color:"oklch(var(--ink-3))" }}>Net income</div><div style={{ fontSize:14, fontWeight:600, color:netIncome>=0?"oklch(0.45 0.13 145)":"oklch(0.45 0.14 25)" }}>{shortPeso(netIncome)}</div></div>
          </div>
          <div style={{ padding:"10px 16px", borderTop:"1px solid oklch(var(--line))" }}><Link href="/ledger" className="btn btn-sm w-full" style={{ justifyContent:"center" }}>Full accounting →</Link></div>
        </div>
      </div>
      {nearExpiryLots.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <ExpiryAlertCard lots={nearExpiryLots} />
        </div>
      )}
      {morningActivity.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <MorningActivityCard agents={morningActivity} />
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <RecentOrdersTable orders={recentOrders} />
        <div className="card">
          <div className="card-head"><span className="card-h">Recent journal entries</span><Link href="/ledger" className="btn btn-ghost btn-sm ml-auto">See all →</Link></div>
          <div className="tbl-wrap" style={{ border:0, borderRadius:0, borderTop:"1px solid oklch(var(--line))" }}>
            <table className="tbl">
              <thead><tr><th className="id">JE #</th><th>Source</th><th>Memo</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {(recentJe??[]).map(j => (
                  <tr key={j.id} style={{ cursor:"default" }}>
                    <td className="id">{j.id}</td>
                    <td><span style={{ fontSize:11, padding:"2px 7px", borderRadius:3, fontWeight:500, fontFamily:"monospace", background:`color-mix(in oklch, ${SOURCE_COLOR[j.source]??""} 12%, white)`, color:SOURCE_COLOR[j.source] }}>{j.source}</span></td>
                    <td style={{ maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.memo}</td>
                    <td className="num">{peso(j.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FINANCE view ──────────────────────────────────────────────────────────────
function FinanceDashboard({ ar, ap, birDue=0, trialBalance:tb={}, recentJe=[], overdueInvoices=[] }: Props) {
  const cash = (tb["1000"]??0)+(tb["1010"]??0)+(tb["1020"]??0);
  const revenue = Math.abs(tb["4000"]??0);
  const expenses = (tb["5000"]??0)+(tb["5100"]??0)+(tb["5200"]??0)+(tb["5300"]??0)+(tb["5400"]??0)+(tb["5500"]??0)+(tb["5600"]??0)+(tb["5700"]??0);
  const netIncome = revenue - expenses;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div><h1 style={{ fontSize:17, fontWeight:600 }}>Finance Dashboard</h1><p style={{ fontSize:12, color:"oklch(var(--ink-3))" }}>{fmtDate(new Date().toISOString())}</p></div>
        <Link href="/ledger" className="btn btn-accent">Open accounting →</Link>
      </div>
      {birDue > 0 && <AlertBanner msg={`${birDue} BIR filing${birDue>1?"s":""} due — file before deadline`} href="/ledger" cta="Review" />}
      {(ar?.overdue??0) > 0 && <AlertBanner msg={`${shortPeso(ar!.overdue)} in overdue receivables`} href="/ledger" cta="View AR" />}
      <div className="stat-grid mb-4">
        <KpiCard label="Cash position" value={shortPeso(cash)} sub="All accounts" href="/ledger" accent="oklch(0.55 0.12 240)" />
        <KpiCard label="Net income (YTD)" value={shortPeso(netIncome)} sub={`${revenue>0?((netIncome/revenue)*100).toFixed(1):0}% margin`} href="/ledger" accent="oklch(0.55 0.13 145)" />
        <KpiCard label="AR outstanding" value={shortPeso(ar?.open??0)} sub={ar?.overdue?(ar.overdue>0?`${shortPeso(ar.overdue)} overdue`:"All current"):"—"} warn={!!ar?.overdue} href="/ledger" />
        <KpiCard label="AP outstanding" value={shortPeso(ap?.open??0)} sub={ap?.overdue?(ap.overdue>0?`${shortPeso(ap.overdue)} overdue`:"All current"):"—"} warn={!!ap?.overdue} href="/ledger" />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div className="card">
          <div className="card-head"><span className="card-h">Overdue receivables</span><Link href="/ledger" className="btn btn-ghost btn-sm ml-auto">Full AR →</Link></div>
          <div className="tbl-wrap" style={{ border:0, borderRadius:0, borderTop:"1px solid oklch(var(--line))" }}>
            <table className="tbl">
              <thead><tr><th>Customer</th><th className="num">Amount Due</th><th>Due Date</th></tr></thead>
              <tbody>
                {overdueInvoices.length===0 && <tr><td colSpan={3} style={{ textAlign:"center", padding:"20px 0", color:"oklch(var(--ink-3))", fontSize:12.5 }}>No overdue invoices</td></tr>}
                {overdueInvoices.map(i => (
                  <tr key={i.id} style={{ cursor:"default" }}>
                    <td>{i.customerName}</td>
                    <td className="num" style={{ color:"oklch(0.45 0.14 25)", fontWeight:600 }}>{peso(i.amount)}</td>
                    <td className="dim" style={{ fontSize:12 }}>{fmtDate(i.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-h">Revenue vs expenses · YTD</span></div>
          <div className="card-body">
            {[["Revenue", revenue, "oklch(0.55 0.13 145)"], ["Expenses", expenses, "oklch(0.55 0.14 25)"]].map(([lbl, val, clr]) => (
              <div key={String(lbl)} style={{ marginBottom:10 }}>
                <div className="flex justify-between mb-1"><span style={{ fontSize:13 }}>{String(lbl)}</span><span style={{ fontSize:13, fontWeight:600, fontFamily:"monospace" }}>{shortPeso(Number(val))}</span></div>
                <div className="pl-bar-track"><div className="pl-bar-fill" style={{ width:revenue>0?`${(Number(val)/revenue)*100}%`:"0%", background:String(clr) }}/></div>
              </div>
            ))}
            <div style={{ borderTop:"1.5px solid oklch(var(--ink))", paddingTop:10 }}>
              <div className="flex justify-between"><span style={{ fontSize:13, fontWeight:600 }}>Net income</span><span style={{ fontSize:15, fontWeight:700, fontFamily:"monospace", color:netIncome>=0?"oklch(0.45 0.13 145)":"oklch(0.45 0.14 25)" }}>{shortPeso(netIncome)}</span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><span className="card-h">Recent journal entries</span><Link href="/ledger" className="btn btn-ghost btn-sm ml-auto">See all →</Link></div>
        <div className="tbl-wrap" style={{ border:0, borderRadius:0, borderTop:"1px solid oklch(var(--line))" }}>
          <table className="tbl">
            <thead><tr><th className="id">JE #</th><th>Source</th><th>Memo</th><th className="num">Amount</th><th>Date</th></tr></thead>
            <tbody>
              {recentJe.map(j => (
                <tr key={j.id} style={{ cursor:"default" }}>
                  <td className="id">{j.id}</td>
                  <td><span style={{ fontSize:11, padding:"2px 7px", borderRadius:3, fontWeight:500, fontFamily:"monospace", background:`color-mix(in oklch, ${SOURCE_COLOR[j.source]??""} 12%, white)`, color:SOURCE_COLOR[j.source] }}>{j.source}</span></td>
                  <td style={{ maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.memo}</td>
                  <td className="num">{peso(j.amount)}</td>
                  <td className="dim" style={{ fontSize:12 }}>{fmtDate(j.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── AGENT view ────────────────────────────────────────────────────────────────
function AgentDashboard({ agentStats, recentOrders=[], orderPipeline=[] }: Props) {
  const s = agentStats ?? { total:0, pending:0, thisMonth:0, customers:0 };
  const pipelineTotal = orderPipeline.reduce((sum,o)=>sum+o.count,0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div><h1 style={{ fontSize:17, fontWeight:600 }}>My Dashboard</h1><p style={{ fontSize:12, color:"oklch(var(--ink-3))" }}>Sales agent overview · {fmtDate(new Date().toISOString())}</p></div>
        <Link href="/orders/new" className="btn btn-accent">+ New Order</Link>
      </div>
      <div className="stat-grid mb-4">
        <KpiCard label="My orders (total)" value={String(s.total)} sub="All time" href="/orders" />
        <KpiCard label="Pending approval" value={String(s.pending)} sub="Awaiting finance review" warn={s.pending>0} href="/orders?state=PENDING" />
        <KpiCard label="This month" value={String(s.thisMonth)} sub="Orders placed" href="/orders" accent="oklch(0.55 0.13 145)" />
        <KpiCard label="Customers" value={String(s.customers)} sub="Total accounts" href="/customers" />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div className="card-head"><span className="card-h">My order pipeline</span><span style={{ fontSize:12, marginLeft:"auto", color:"oklch(var(--ink-3))" }}>{pipelineTotal} total</span></div>
          <PipelineBar pipeline={orderPipeline} />
          <div style={{ padding:"10px 16px", borderTop:"1px solid oklch(var(--line))" }}><Link href="/orders" className="btn btn-sm w-full" style={{ justifyContent:"center" }}>View all my orders →</Link></div>
        </div>
        <RecentOrdersTable orders={recentOrders} title="My recent orders" />
      </div>
    </div>
  );
}

// ── CASHIER view ──────────────────────────────────────────────────────────────
/**
 * The counter's work queue.
 *
 * One list, oldest first, of everything waiting on the till: retail orders to price,
 * wholesale orders already approved by an Admin, and priced orders still to collect.
 * A cashier previously had to scan the whole order list to find their own work, with
 * no way to see what was owed without opening each order.
 */
/**
 * The Z-read: what the session took, and whether the drawer agrees.
 *
 * Cash is shown apart from the other tenders because it is the only figure the cashier
 * can physically verify — a bank transfer cannot be short in the till.
 */
function ShiftCard({ shift }: { shift: NonNullable<Props["currentShift"]> }) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");

  const z = shift.zRead;
  const countedNum = parseFloat(counted);
  const variance = Number.isFinite(countedNum) ? Math.round((countedNum - z.expectedCash) * 100) / 100 : null;

  function submit() {
    startTransition(async () => {
      try {
        const res = await closeShift(parseFloat(counted), note || undefined);
        if (!res.ok) { toast(res.error, "error"); return; }
        toast(
          Math.abs(res.shift.variance) < 0.01
            ? "Till closed — drawer balances"
            : `Till closed — ${res.shift.variance > 0 ? "over" : "short"} by ${peso(Math.abs(res.shift.variance))}`,
          Math.abs(res.shift.variance) < 0.01 ? "success" : "info"
        );
        setOpen(false);
        setCounted("");
        setNote("");
        router.refresh();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <span className="card-h">Till session</span>
        <span style={{ fontSize: 11.5, marginLeft: "auto", color: "oklch(var(--ink-3))" }}>
          open since {new Date(shift.openedAt).toLocaleString("en-PH", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
          {" · "}{z.paymentCount} payment{z.paymentCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Cash in drawer (expected)</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{peso(z.expectedCash)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Other tenders</div>
            <div style={{ fontWeight: 600 }}>{peso(z.nonCashTotal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "oklch(var(--ink-3))", textTransform: "uppercase" }}>Total taken</div>
            <div style={{ fontWeight: 600 }}>{peso(z.totalTaken)}</div>
          </div>
        </div>

        {z.byTender.length > 0 && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: "oklch(var(--ink-3))" }}>
            {z.byTender.map((t) => (
              <span key={t.tender}>{t.label}: <strong>{peso(t.amount)}</strong> ({t.count})</span>
            ))}
          </div>
        )}

        {!open ? (
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>
            Close till (Z-read)
          </button>
        ) : (
          <div style={{ padding: "10px 12px", borderRadius: 7, background: "oklch(var(--bg-2))", border: "1px solid oklch(var(--line))", display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 11.5, color: "oklch(var(--ink-3))" }}>
              Count the cash in the drawer and enter it. Only cash is compared — other
              tenders never sit in the till.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label className="field-label">Cash counted</label>
                <input
                  className="field-input" type="number" min="0" step="0.01"
                  style={{ textAlign: "right" }}
                  value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00"
                />
              </div>
              <div>
                <label className="field-label">Variance</label>
                <div style={{
                  padding: "7px 10px", fontWeight: 600,
                  color: variance === null ? "oklch(var(--ink-3))" : Math.abs(variance) < 0.01 ? "oklch(0.40 0.09 155)" : "#dc2626",
                }}>
                  {variance === null
                    ? "—"
                    : Math.abs(variance) < 0.01
                      ? "Balances"
                      : `${variance > 0 ? "Over" : "Short"} ${peso(Math.abs(variance))}`}
                </div>
              </div>
            </div>
            <input
              className="field-input" placeholder="Note (optional) — e.g. why the drawer is short"
              value={note} onChange={(e) => setNote(e.target.value)}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn flex-1" style={{ justifyContent: "center" }} onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-accent flex-1"
                style={{ justifyContent: "center" }}
                disabled={isPending || counted === ""}
                onClick={submit}
              >
                {isPending ? "Closing…" : "Confirm close"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CashierDashboard({ tillQueue = [], tillStats, currentShift }: Props) {
  const s = tillStats ?? { toPrice: 0, toCollect: 0, dueTotal: 0, takenToday: 0, paymentsToday: 0 };

  const stateLabel: Record<string, string> = {
    PENDING: "To price",
    APPROVED: "To price",
    AWAITING_PAYMENT: "To collect",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 600 }}>Till</h1>
          <p style={{ fontSize: 12, color: "oklch(var(--ink-3))" }}>
            Counter queue · {fmtDate(new Date().toISOString())}
          </p>
        </div>
        <Link href="/orders/new" className="btn btn-accent">+ New Sale</Link>
      </div>

      {currentShift && <ShiftCard shift={currentShift} />}

      <div className="stat-grid mb-4">
        <KpiCard label="To price" value={String(s.toPrice)} sub="Waiting to be computed" href="/orders?state=PENDING" />
        <KpiCard label="To collect" value={String(s.toCollect)} sub="Priced, awaiting payment" warn={s.toCollect > 0} href="/orders?state=AWAITING_PAYMENT" />
        <KpiCard label="Outstanding" value={peso(s.dueTotal)} sub="Across orders at the till" accent="oklch(0.55 0.14 25)" />
        <KpiCard label="Taken today" value={peso(s.takenToday)} sub={`${s.paymentsToday} payment${s.paymentsToday === 1 ? "" : "s"}`} accent="oklch(0.55 0.13 145)" />
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-h">Queue</span>
          <span style={{ fontSize: 12, marginLeft: "auto", color: "oklch(var(--ink-3))" }}>
            {tillQueue.length} order{tillQueue.length === 1 ? "" : "s"} · oldest first
          </span>
        </div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Channel</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th className="num">Due</th>
              </tr>
            </thead>
            <tbody>
              {tillQueue.length === 0 && (
                <tr><td colSpan={6} className="dim" style={{ padding: "14px 8px", fontSize: 12.5 }}>
                  Nothing waiting at the till.
                </td></tr>
              )}
              {tillQueue.map((o) => (
                <tr key={o.id}>
                  <td className="id" style={{ fontWeight: 600 }}>
                    <Link href={`/orders/${o.id}`}>{o.id}</Link>
                  </td>
                  <td style={{ fontWeight: 500 }}>{o.customerName}</td>
                  <td className="dim">{o.channel === "WHOLESALE" ? "Wholesale" : "Retail"}</td>
                  <td>{stateLabel[o.state] ?? o.state}</td>
                  <td className="num">{peso(o.total)}</td>
                  <td className="num" style={o.state === "AWAITING_PAYMENT" && o.due > 0 ? { color: "#dc2626", fontWeight: 600 } : undefined}>
                    {/* An order still to be priced has collected nothing yet — showing its
                        total as "due" would imply it had already reached the till. */}
                    {o.state === "AWAITING_PAYMENT" ? peso(o.due) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── WAREHOUSE view ────────────────────────────────────────────────────────────
function WarehouseDashboard({ orderPipeline=[], lowStockCount=0, lowStockItems=[], recentOrders=[], nearExpiryLots=[] }: Props) {
  const toProcess = orderPipeline.find(o=>o.state==="APPROVED")?.count ?? 0;
  const inPrepare = orderPipeline.find(o=>o.state==="PREPARING")?.count ?? 0;
  const shipped   = orderPipeline.find(o=>o.state==="SHIPPED")?.count ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div><h1 style={{ fontSize:17, fontWeight:600 }}>Warehouse Dashboard</h1><p style={{ fontSize:12, color:"oklch(var(--ink-3))" }}>{fmtDate(new Date().toISOString())}</p></div>
        <Link href="/warehouse" className="btn btn-accent">Open Kanban →</Link>
      </div>
      {lowStockCount > 0 && <AlertBanner msg={`${lowStockCount} SKU${lowStockCount>1?"s":""} at or below reorder threshold`} href="/inventory" cta="View inventory" />}
      {nearExpiryLots.length > 0 && <AlertBanner msg={`${nearExpiryLots.length} lot${nearExpiryLots.length>1?"s":""} expiring soon — quarantine or write off`} href="/inventory" cta="View lots" />}
      <div className="stat-grid mb-4">
        <KpiCard label="To process" value={String(toProcess)} sub="Approved, awaiting prep" warn={toProcess>0} href="/warehouse" accent="oklch(0.55 0.14 290)" />
        <KpiCard label="In preparation" value={String(inPrepare)} sub="Being picked & packed" href="/warehouse" accent="oklch(0.55 0.12 80)" />
        <KpiCard label="Shipped" value={String(shipped)} sub="In transit" href="/shipments" accent="oklch(0.45 0.14 200)" />
        <KpiCard label="Low stock SKUs" value={String(lowStockCount)} sub="At or below reorder point" warn={lowStockCount>0} href="/inventory" />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <RecentOrdersTable orders={recentOrders} title="Orders needing attention" />
        <div className="card">
          <div className="card-head"><span className="card-h">Low stock alerts</span><Link href="/inventory" className="btn btn-ghost btn-sm ml-auto">View inventory →</Link></div>

          <div className="tbl-wrap" style={{ border:0, borderRadius:0, borderTop:"1px solid oklch(var(--line))" }}>
            <table className="tbl">
              <thead><tr><th>Product</th><th>Warehouse</th><th className="num">On Hand</th><th className="num">Reorder At</th></tr></thead>
              <tbody>
                {lowStockItems.length===0 && <tr><td colSpan={4} style={{ textAlign:"center", padding:"20px 0", color:"oklch(var(--ink-3))", fontSize:12.5 }}>All stock levels OK</td></tr>}
                {lowStockItems.map((s,i) => (
                  <tr key={i} style={{ cursor:"default" }}>
                    <td style={{ fontWeight:500 }}>{s.name}</td>
                    <td className="dim">{s.warehouse}</td>
                    <td className="num" style={{ color:"oklch(0.45 0.14 25)", fontWeight:600 }}>{s.onHand}</td>
                    <td className="num dim">{s.reorderAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {nearExpiryLots.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <ExpiryAlertCard lots={nearExpiryLots} />
        </div>
      )}
    </div>
  );
}

// ── DRIVER view ───────────────────────────────────────────────────────────────
function DriverDashboard({ myShipments=[] }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div><h1 style={{ fontSize:17, fontWeight:600 }}>My Deliveries</h1><p style={{ fontSize:12, color:"oklch(var(--ink-3))" }}>{fmtDate(new Date().toISOString())}</p></div>
        <Link href="/shipments" className="btn btn-accent">All shipments →</Link>
      </div>
      <div className="stat-grid mb-4" style={{ gridTemplateColumns:"repeat(2,1fr)" }}>
        <KpiCard label="Active deliveries" value={String(myShipments.length)} sub="Orders in SHIPPED state" href="/shipments" />
        <KpiCard label="With ETA today" value={String(myShipments.filter(s => s.eta && new Date(s.eta).toDateString()===new Date().toDateString()).length)} sub="Due today" href="/shipments" accent="oklch(0.55 0.12 80)" />
      </div>
      <div className="card">
        <div className="card-head"><span className="card-h">Active deliveries</span></div>
        <div className="tbl-wrap" style={{ border:0, borderRadius:0, borderTop:"1px solid oklch(var(--line))" }}>
          <table className="tbl">
            <thead><tr><th className="id">Order</th><th>Customer</th><th>Tracking #</th><th>ETA</th><th className="num">Total</th></tr></thead>
            <tbody>
              {myShipments.length===0 && <tr><td colSpan={5} style={{ textAlign:"center", padding:"20px 0", color:"oklch(var(--ink-3))", fontSize:12.5 }}>No active deliveries</td></tr>}
              {myShipments.map(s => (
                <tr key={s.id} style={{ cursor:"default" }}>
                  <td className="id"><Link href={`/orders/${s.orderId}`} style={{ color:"oklch(var(--accent))" }}>{s.orderId}</Link></td>
                  <td>{s.customerName}</td>
                  <td className="id">{s.trackingNumber ?? "—"}</td>
                  <td className="dim" style={{ fontSize:12 }}>{s.eta ? fmtDate(s.eta) : "—"}</td>
                  <td className="num">{peso(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export function DashboardClient(props: Props) {
  switch (props.role) {
    case "FINANCE":    return <FinanceDashboard    {...props} />;
    case "AGENT":      return <AgentDashboard      {...props} />;
    case "CASHIER":    return <CashierDashboard    {...props} />;
    case "WAREHOUSE":  return <WarehouseDashboard  {...props} />;
    case "DRIVER":     return <DriverDashboard     {...props} />;
    default:           return <AdminDashboard      {...props} />;
  }
}
