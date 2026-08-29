"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { approveReturn, receiveReturn, closeReturn, createReturn, rejectReturn, receiveReturnsBulk } from "./actions";

type ReturnStatus = "REQUESTED" | "APPROVED" | "RECEIVED" | "CLOSED" | "REJECTED";
type Disposition = "RESTOCK" | "SCRAP";

interface ReturnLine {
  id: string; skuId: string; name: string;
  qtyRequested: number; qtyReceived: number; disposition: Disposition;
  returnLotNumber: string | null; returnExpiryDate: string | null;
}
interface OrderLineLotInfo {
  qtyTaken: number;
  lot: { lotNumber: string; expiryDate: string | null };
}
interface ReturnItem {
  id: string; status: ReturnStatus; reason: string; notes: string | null;
  createdAt: string; orderId: string;
  rejectedReason: string | null;
  creditNoteRef: string | null;
  order: {
    id: string;
    customer: { name: string };
    warehouse: { code: string; name: string };
    lines: { skuId: string; unitPrice: number; lots: OrderLineLotInfo[] }[];
  };
  lines: ReturnLine[];
}
interface OrderOption {
  id: string;
  customer: { name: string };
  lines: { skuId: string; name: string; qty: number }[];
}

interface Props {
  returns: ReturnItem[];
  deliveredOrders: OrderOption[];
  canApprove: boolean;
  canReceive: boolean;
  canClose: boolean;
  canCreate: boolean;
  canReject: boolean;
}

const STATUS_COLOR: Record<ReturnStatus, string> = {
  REQUESTED: "#d97706", APPROVED: "#2563eb", RECEIVED: "#16a34a",
  CLOSED: "#6b7280", REJECTED: "#dc2626",
};

function StatusPill({ status }: { status: ReturnStatus }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      fontSize: 11, fontWeight: 600,
      background: STATUS_COLOR[status] + "22", color: STATUS_COLOR[status],
    }}>{status}</span>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({
  ret, canApprove, canReceive, canClose, canReject,
  onClose, onApprove, onReceive, onClose2, onReject,
}: {
  ret: ReturnItem;
  canApprove: boolean; canReceive: boolean; canClose: boolean; canReject: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReceive: () => void;
  onClose2: () => void;
  onReject: () => void;
}) {
  // Build price map from order lines
  const priceMap = new Map(ret.order.lines.map(l => [l.skuId, Number(l.unitPrice)]));

  // Compute credit amounts (based on received qty if RECEIVED/CLOSED, else requested qty)
  const isPostReceive = ["RECEIVED", "CLOSED"].includes(ret.status);
  let subtotal = 0;
  for (const line of ret.lines) {
    const qty = isPostReceive ? (line.qtyReceived || 0) : line.qtyRequested;
    subtotal += qty * (priceMap.get(line.skuId) ?? 0);
  }
  const subtotalRounded = Math.round(subtotal * 100) / 100;
  const vat = Math.round(subtotal * 0.12 * 100) / 100;
  const total = Math.round((subtotalRounded + vat) * 100) / 100;

  const fmt = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2 });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "oklch(var(--bg))", borderRadius: 10, width: "min(700px, 95vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid oklch(var(--line))", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Return Detail</span>
            <StatusPill status={ret.status} />
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
            <div>
              <div style={{ color: "oklch(var(--ink-3))", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Return ID</div>
              <div style={{ fontFamily: "monospace" }}>{ret.id}</div>
            </div>
            <div>
              <div style={{ color: "oklch(var(--ink-3))", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Order</div>
              <div style={{ fontFamily: "monospace" }}>{ret.orderId}</div>
            </div>
            <div>
              <div style={{ color: "oklch(var(--ink-3))", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Customer</div>
              <div>{ret.order.customer.name}</div>
            </div>
            <div>
              <div style={{ color: "oklch(var(--ink-3))", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Returns to Warehouse</div>
              <div>{ret.order.warehouse.name} <span style={{ color: "oklch(var(--ink-3))" }}>({ret.order.warehouse.code})</span></div>
            </div>
            <div>
              <div style={{ color: "oklch(var(--ink-3))", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Date Filed</div>
              <div>{new Date(ret.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}</div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ color: "oklch(var(--ink-3))", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Reason</div>
              <div>{ret.reason}</div>
            </div>
            {ret.notes && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ color: "oklch(var(--ink-3))", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Notes</div>
                <div style={{ fontSize: 12, color: "oklch(var(--ink-2))" }}>{ret.notes}</div>
              </div>
            )}
            {ret.status === "REJECTED" && ret.rejectedReason && (
              <div style={{ gridColumn: "1 / -1", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Rejection Reason</div>
                <div style={{ fontSize: 13, color: "#991b1b" }}>{ret.rejectedReason}</div>
              </div>
            )}
          </div>

          {/* Line items */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Line Items</div>
            <div style={{ border: "1px solid oklch(var(--line))", borderRadius: 7, overflow: "hidden" }}>
              <table className="tbl" style={{ borderRadius: 0 }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Requested</th>
                    {isPostReceive && <th className="num">Received</th>}
                    <th>Disposition</th>
                    {isPostReceive && <th>Lot No.</th>}
                    {isPostReceive && <th>Expiry</th>}
                    <th className="num">Unit Price</th>
                    <th className="num">Line Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {ret.lines.map(line => {
                    const unitPrice = priceMap.get(line.skuId) ?? 0;
                    const qty = isPostReceive ? (line.qtyReceived || 0) : line.qtyRequested;
                    const lineCredit = qty * unitPrice;
                    const expDate = line.returnExpiryDate ? new Date(line.returnExpiryDate) : null;
                    return (
                      <tr key={line.id}>
                        <td style={{ fontSize: 13 }}>{line.name}</td>
                        <td className="num">{line.qtyRequested}</td>
                        {isPostReceive && <td className="num">{line.qtyReceived}</td>}
                        <td>
                          <span style={{
                            fontSize: 11, padding: "2px 6px", borderRadius: 4,
                            background: line.disposition === "RESTOCK" ? "#dcfce7" : "#fee2e2",
                            color: line.disposition === "RESTOCK" ? "#16a34a" : "#dc2626",
                          }}>{line.disposition}</span>
                        </td>
                        {isPostReceive && (
                          <td style={{ fontSize: 12, fontFamily: "monospace" }}>
                            {line.returnLotNumber ?? <span style={{ color: "oklch(var(--ink-3))" }}>—</span>}
                          </td>
                        )}
                        {isPostReceive && (
                          <td style={{ fontSize: 12 }}>
                            {expDate
                              ? expDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
                              : <span style={{ color: "oklch(var(--ink-3))" }}>—</span>}
                          </td>
                        )}
                        <td className="num" style={{ fontSize: 12 }}>₱{fmt(unitPrice)}</td>
                        <td className="num" style={{ fontSize: 12 }}>₱{fmt(lineCredit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial summary */}
          {ret.status !== "REJECTED" && (
            <div style={{ background: "oklch(var(--bg-2))", borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Credit Note Summary {isPostReceive ? "(based on qty received)" : "(estimate — pending receipt)"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "oklch(var(--ink-2))" }}>Subtotal</span>
                  <span>₱{fmt(subtotalRounded)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "oklch(var(--ink-2))" }}>VAT (12%)</span>
                  <span>₱{fmt(vat)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid oklch(var(--line))", paddingTop: 6, marginTop: 2 }}>
                  <span>Total Credit to AR</span>
                  <span>₱{fmt(total)}</span>
                </div>
                {ret.creditNoteRef && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "oklch(var(--ink-3))", marginTop: 4 }}>
                    <span>Credit Note Ref</span>
                    <span style={{ fontFamily: "monospace" }}>{ret.creditNoteRef}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: "14px 20px", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid oklch(var(--line))" }}>
          <button type="button" onClick={onClose} className="btn">Close</button>
          {ret.status === "REQUESTED" && canReject && (
            <button type="button" onClick={onReject} className="btn" style={{ color: "#dc2626", borderColor: "#fca5a5" }}>Reject</button>
          )}
          {ret.status === "APPROVED" && canReject && (
            <button type="button" onClick={onReject} className="btn" style={{ color: "#dc2626", borderColor: "#fca5a5" }}>Reject</button>
          )}
          {ret.status === "REQUESTED" && canApprove && (
            <button type="button" onClick={onApprove} className="btn btn-accent">Approve</button>
          )}
          {ret.status === "APPROVED" && canReceive && (
            <button type="button" onClick={onReceive} className="btn btn-accent">Receive</button>
          )}
          {ret.status === "RECEIVED" && canClose && (
            <button type="button" onClick={onClose2} className="btn btn-accent">Close Return</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reject Modal ──────────────────────────────────────────────────────────────
function RejectModal({ ret, onClose }: { ret: ReturnItem; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) { toast("Rejection reason is required", "error"); return; }
    startTransition(async () => {
      try {
        await rejectReturn(ret.id, reason);
        toast("Return rejected", "success");
        router.refresh();
        onClose();
      } catch (e) { toast((e as Error).message, "error"); }
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "oklch(var(--bg))", borderRadius: 10, width: "min(480px, 95vw)", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <form onSubmit={submit}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid oklch(var(--line))", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: "#dc2626" }}>Reject Return</span>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, color: "oklch(var(--ink-2))", margin: 0 }}>
              Rejecting return <strong style={{ fontFamily: "monospace" }}>{ret.id.slice(0, 8)}…</strong> for order <strong>{ret.orderId}</strong>.
              This action cannot be undone.
            </p>
            <div>
              <label className="field-label">Reason for Rejection <span style={{ color: "#dc2626" }}>*</span></label>
              <textarea
                className="field-input"
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Explain why this return is being rejected…"
                required
              />
            </div>
          </div>
          <div style={{ padding: "14px 20px", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid oklch(var(--line))" }}>
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="submit" disabled={isPending || !reason.trim()} className="btn"
              style={{ background: "#dc2626", color: "#fff", opacity: isPending || !reason.trim() ? 0.6 : 1 }}>
              {isPending ? "Rejecting…" : "Confirm Reject"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── New Return Modal ──────────────────────────────────────────────────────────
function NewReturnModal({ orders, onClose }: { orders: OrderOption[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<{ skuId: string; name: string; qtyRequested: number; disposition: Disposition }[]>([]);

  const selectedOrder = orders.find(o => o.id === orderId);

  function handleOrderChange(id: string) {
    setOrderId(id);
    const order = orders.find(o => o.id === id);
    setLines(order ? order.lines.map(l => ({ skuId: l.skuId, name: l.name, qtyRequested: 1, disposition: "RESTOCK" as Disposition })) : []);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId || !reason || lines.length === 0) { toast("Fill all fields", "error"); return; }
    const activeLines = lines.filter(l => l.qtyRequested > 0);
    if (!activeLines.length) { toast("At least one line must have qty > 0", "error"); return; }
    startTransition(async () => {
      try {
        const id = await createReturn({ orderId, reason, notes, lines: activeLines });
        toast(`Return ${id} requested`, "success");
        router.refresh();
        onClose();
      } catch (e) { toast((e as Error).message, "error"); }
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "oklch(var(--bg))", borderRadius: 10, width: "min(680px, 95vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <form onSubmit={submit}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid oklch(var(--line))", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>New Return / RMA</span>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="field-label">Delivered Order</label>
              <select className="field-input" value={orderId} onChange={e => handleOrderChange(e.target.value)} required>
                <option value="">Select order…</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.id} — {o.customer.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Reason for Return</label>
              <input className="field-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Defective unit, wrong item, excess order…" required />
            </div>
            <div>
              <label className="field-label">Notes</label>
              <textarea className="field-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional details…" />
            </div>

            {lines.length > 0 && (
              <div>
                <label className="field-label">Line Items</label>
                <div style={{ border: "1px solid oklch(var(--line))", borderRadius: 7, overflow: "hidden" }}>
                  <table className="tbl" style={{ borderRadius: 0 }}>
                    <thead><tr><th>Product</th><th className="num" style={{ width: 80 }}>Max Qty</th><th className="num" style={{ width: 80 }}>Return Qty</th><th style={{ width: 110 }}>Disposition</th></tr></thead>
                    <tbody>
                      {lines.map((line, i) => {
                        const original = selectedOrder?.lines.find(l => l.skuId === line.skuId);
                        return (
                          <tr key={line.skuId}>
                            <td>{line.name}</td>
                            <td className="num" style={{ color: "oklch(var(--ink-3))", fontSize: 12 }}>{original?.qty ?? 0}</td>
                            <td className="num">
                              <input type="number" min={0} max={original?.qty ?? 999} className="field-input text-right"
                                value={line.qtyRequested}
                                onChange={e => {
                                  const v = parseInt(e.target.value) || 0;
                                  setLines(prev => prev.map((l, idx) => idx === i ? { ...l, qtyRequested: v } : l));
                                }}
                              />
                            </td>
                            <td>
                              <select className="field-input" value={line.disposition}
                                onChange={e => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, disposition: e.target.value as Disposition } : l))}>
                                <option value="RESTOCK">Restock</option>
                                <option value="SCRAP">Scrap</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: "14px 20px", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid oklch(var(--line))" }}>
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="submit" disabled={isPending} className="btn btn-accent">{isPending ? "Submitting…" : "Submit Return"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Receive Modal ─────────────────────────────────────────────────────────────
function ReceiveModal({ ret, onClose }: { ret: ReturnItem; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [qtys, setQtys] = useState<Record<string, number>>(
    Object.fromEntries(ret.lines.map(l => [l.id, l.qtyRequested]))
  );
  // Pre-populate lot data from original order's consumed lots (first lot per SKU)
  const [lotData, setLotData] = useState<Record<string, { lotNumber: string; expiryDate: string }>>(() => {
    const init: Record<string, { lotNumber: string; expiryDate: string }> = {};
    for (const line of ret.lines) {
      const orderLine = ret.order.lines.find(ol => ol.skuId === line.skuId);
      const firstLot = orderLine?.lots?.[0];
      init[line.id] = {
        lotNumber: firstLot?.lot.lotNumber ?? "",
        expiryDate: firstLot?.lot.expiryDate
          ? new Date(firstLot.lot.expiryDate).toISOString().slice(0, 10)
          : "",
      };
    }
    return init;
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const lines = ret.lines.map(l => ({
      id: l.id,
      qtyReceived: qtys[l.id] ?? 0,
      lotNumber: lotData[l.id]?.lotNumber || undefined,
      expiryDate: lotData[l.id]?.expiryDate || undefined,
    }));
    startTransition(async () => {
      try {
        await receiveReturn(ret.id, lines);
        toast("Return received", "success");
        router.refresh();
        onClose();
      } catch (e) { toast((e as Error).message, "error"); }
    });
  }

  const hasRestock = ret.lines.some(l => l.disposition === "RESTOCK");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "oklch(var(--bg))", borderRadius: 10, width: "min(760px, 95vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <form onSubmit={submit}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid oklch(var(--line))", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Receive Return — {ret.id}</span>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
          </div>
          <div style={{ padding: 20 }}>
            {hasRestock && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, fontSize: 12, color: "#1d4ed8" }}>
                Lot numbers are pre-filled from the original order. Confirm or adjust before saving — restocked items will be returned to their lot.
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Requested</th>
                    <th className="num">Received</th>
                    <th>Disposition</th>
                    {hasRestock && <th>Lot No.</th>}
                    {hasRestock && <th>Expiry Date</th>}
                  </tr>
                </thead>
                <tbody>
                  {ret.lines.map(line => (
                    <tr key={line.id}>
                      <td>{line.name}</td>
                      <td className="num">{line.qtyRequested}</td>
                      <td className="num">
                        <input type="number" min={0} max={line.qtyRequested} className="field-input text-right" style={{ width: 70 }}
                          value={qtys[line.id] ?? line.qtyRequested}
                          onChange={e => setQtys(p => ({ ...p, [line.id]: parseInt(e.target.value) || 0 }))}
                        />
                      </td>
                      <td>
                        <span style={{ fontSize: 12, padding: "2px 6px", borderRadius: 4, background: line.disposition === "RESTOCK" ? "#dcfce7" : "#fee2e2", color: line.disposition === "RESTOCK" ? "#16a34a" : "#dc2626" }}>
                          {line.disposition}
                        </span>
                      </td>
                      {hasRestock && (
                        <td>
                          {line.disposition === "RESTOCK" ? (
                            <input
                              type="text"
                              className="field-input"
                              style={{ width: 130, fontSize: 12, fontFamily: "monospace" }}
                              placeholder="LOT-XXXXX"
                              value={lotData[line.id]?.lotNumber ?? ""}
                              onChange={e => setLotData(p => ({ ...p, [line.id]: { ...p[line.id], lotNumber: e.target.value } }))}
                            />
                          ) : <span style={{ color: "oklch(var(--ink-3))", fontSize: 12 }}>—</span>}
                        </td>
                      )}
                      {hasRestock && (
                        <td>
                          {line.disposition === "RESTOCK" ? (
                            <input
                              type="date"
                              className="field-input"
                              style={{ width: 140, fontSize: 12 }}
                              value={lotData[line.id]?.expiryDate ?? ""}
                              onChange={e => setLotData(p => ({ ...p, [line.id]: { ...p[line.id], expiryDate: e.target.value } }))}
                            />
                          ) : <span style={{ color: "oklch(var(--ink-3))", fontSize: 12 }}>—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ padding: "14px 20px", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid oklch(var(--line))" }}>
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="submit" disabled={isPending} className="btn btn-accent">{isPending ? "Saving…" : "Confirm Receipt"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────
export function ReturnsClient({ returns, deliveredOrders, canApprove, canReceive, canClose, canCreate, canReject }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [receiving, setReceiving] = useState<ReturnItem | null>(null);
  const [detail, setDetail] = useState<ReturnItem | null>(null);
  const [rejecting, setRejecting] = useState<ReturnItem | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected] = useState<string[]>([]);

  function handleApprove(id: string) {
    startTransition(async () => {
      try { await approveReturn(id); toast("Return approved", "success"); router.refresh(); }
      catch (e) { toast((e as Error).message, "error"); }
    });
  }
  function handleClose(id: string) {
    startTransition(async () => {
      try { await closeReturn(id); toast("Return closed", "success"); router.refresh(); }
      catch (e) { toast((e as Error).message, "error"); }
    });
  }

  function toggleSelect(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  function handleBulkReceive() {
    if (selected.length === 0) return;
    startTransition(async () => {
      try {
        const res = await receiveReturnsBulk(selected);
        toast(`${res.received} return(s) received${res.skipped.length ? `, ${res.skipped.length} skipped` : ""}`, "success");
        setSelected([]);
        router.refresh();
      } catch (e) { toast((e as Error).message, "error"); }
    });
  }

  const filtered = returns.filter(r => statusFilter === "ALL" || r.status === statusFilter);
  const selectableApproved = filtered.filter(r => r.status === "APPROVED");

  return (
    <>
      {showNew && <NewReturnModal orders={deliveredOrders} onClose={() => setShowNew(false)} />}
      {receiving && <ReceiveModal ret={receiving} onClose={() => setReceiving(null)} />}
      {rejecting && <RejectModal ret={rejecting} onClose={() => { setRejecting(null); setDetail(null); }} />}
      {detail && !rejecting && (
        <DetailModal
          ret={detail}
          canApprove={canApprove}
          canReceive={canReceive}
          canClose={canClose}
          canReject={canReject}
          onClose={() => setDetail(null)}
          onApprove={() => { handleApprove(detail.id); setDetail(null); }}
          onReceive={() => { setReceiving(detail); setDetail(null); }}
          onClose2={() => { handleClose(detail.id); setDetail(null); }}
          onReject={() => setRejecting(detail)}
        />
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select className="field-input" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All Statuses</option>
            {["REQUESTED", "APPROVED", "RECEIVED", "CLOSED", "REJECTED"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {canReceive && selected.length > 0 && (
            <button className="btn btn-accent" disabled={isPending} onClick={handleBulkReceive}>
              Receive Selected ({selected.length})
            </button>
          )}
          <span style={{ flex: 1 }} />
          {canCreate && (
            <button className="btn btn-accent" onClick={() => setShowNew(true)}>+ New Return</button>
          )}
        </div>

        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {canReceive && (
                    <th style={{ width: 32 }}>
                      <input
                        type="checkbox"
                        checked={selectableApproved.length > 0 && selected.length === selectableApproved.length}
                        onChange={e => setSelected(e.target.checked ? selectableApproved.map(r => r.id) : [])}
                        title="Select all approved"
                      />
                    </th>
                  )}
                  <th>Return ID</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Warehouse</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Items</th>
                  <th>Date</th>
                  <th style={{ width: 260 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={canReceive ? 10 : 9} style={{ textAlign: "center", padding: "32px 0", color: "oklch(var(--ink-3))", fontSize: 13 }}>No returns found</td></tr>
                )}
                {filtered.map(ret => (
                  <tr key={ret.id} style={{ opacity: ret.status === "REJECTED" ? 0.55 : 1 }}>
                    {canReceive && (
                      <td>
                        {ret.status === "APPROVED" && (
                          <input type="checkbox" checked={selected.includes(ret.id)} onChange={() => toggleSelect(ret.id)} />
                        )}
                      </td>
                    )}
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{ret.id.slice(0, 8)}…</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{ret.orderId}</td>
                    <td>{ret.order.customer.name}</td>
                    <td style={{ fontSize: 12 }}>{ret.order.warehouse.code}</td>
                    <td style={{ fontSize: 12, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ret.reason}</td>
                    <td><StatusPill status={ret.status} /></td>
                    <td style={{ fontSize: 12 }}>{ret.lines.length} line{ret.lines.length !== 1 ? "s" : ""}</td>
                    <td style={{ fontSize: 12 }}>{new Date(ret.createdAt).toLocaleDateString("en-PH")}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", alignItems: "center" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDetail(ret)}>View</button>
                        {ret.status === "REQUESTED" && canApprove && (
                          <button className="btn btn-sm" onClick={() => handleApprove(ret.id)} disabled={isPending}>Approve</button>
                        )}
                        {ret.status === "APPROVED" && canReceive && (
                          <button className="btn btn-accent btn-sm" onClick={() => setReceiving(ret)}>Receive</button>
                        )}
                        {ret.status === "RECEIVED" && canClose && (
                          <button className="btn btn-sm" onClick={() => handleClose(ret.id)} disabled={isPending}>Close</button>
                        )}
                        {["REQUESTED", "APPROVED"].includes(ret.status) && canReject && (
                          <button className="btn btn-sm" onClick={() => setRejecting(ret)}
                            style={{ color: "#dc2626", borderColor: "#fca5a5" }}>Reject</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
