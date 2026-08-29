"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { HelpButton } from "@/components/HelpButton";
import { createPO, updatePOStatus, receivePO, generateReorderPOs, logBackorder, closePO } from "./actions";
import { linkBillToPO } from "../ledger/actions";

interface PoLine { id: string; skuId: string; skuCode: string; skuName: string; unit: string; qty: number; unitCost: number; accepted: number; damaged: number }
interface BackorderRow {
  id: string; poLineId: string; skuId: string; qty: number; costPerUnit: string;
  disposition: "GOOD" | "BAD"; badReasonType: string | null; badReasonNote: string | null;
  loggedByName: string | null; createdAt: string;
}
interface BillRef { id: string; status: string }
interface PoRow {
  id: string; supplierId: string; supplierName: string;
  warehouseId: string; warehouseName: string;
  status: string; expectedAt: string; total: string; createdAt: string;
  closedAt: string | null;
  lines: PoLine[];
  backorders: BackorderRow[];
  bills: BillRef[];
}
interface Supplier { id: string; name: string }
interface Warehouse { id: string; name: string }
interface CatalogItem { id: string; sku: string; name: string; unit: string }
interface BillOption { id: string; supplierId: string | null; poId: string | null; status: string; amount: string }

interface Props {
  pos: PoRow[]; suppliers: Supplier[]; warehouses: Warehouse[]; catalog: CatalogItem[];
  bills: BillOption[]; role: string;
}

const STATUS_PILL: Record<string, string> = {
  EXPECTED: "pill-PENDING", RECEIVING: "pill-PREPARING", RECEIVED: "pill-DELIVERED", DELAYED: "pill-CANCELLED",
};

const BO_REASON_LABEL: Record<string, string> = {
  RAT_BITE: "Rat Bite", DAMAGED_CONTAINER: "Damaged Container", EXPIRED: "Expired",
  WRONG_ITEM: "Wrong Item", SHORT_SHIP: "Short Ship", OTHER: "Other",
};

function peso(n: string | number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// ── Create PO modal ───────────────────────────────────────────────────────────
function CreatePoModal({ suppliers, warehouses, catalog, onClose }: {
  suppliers: Supplier[]; warehouses: Warehouse[]; catalog: CatalogItem[]; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [expectedAt, setExpectedAt] = useState("");
  const [lines, setLines] = useState([{ skuId: "", qty: 1, unitCost: 0 }]);
  const [err, setErr] = useState("");

  function addLine() { setLines(l => [...l, { skuId: "", qty: 1, unitCost: 0 }]); }
  function removeLine(i: number) { setLines(l => l.filter((_, j) => j !== i)); }
  function setLine<K extends keyof typeof lines[0]>(i: number, key: K, val: typeof lines[0][K]) {
    setLines(l => l.map((row, j) => j === i ? { ...row, [key]: val } : row));
  }

  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const valid = lines.every(l => l.skuId && l.qty > 0);
    if (!valid) { setErr("Fill in all line items"); return; }
    start(async () => {
      try {
        await createPO({ supplierId, warehouseId, expectedAt, lines });
        router.refresh(); onClose();
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <Modal open onClose={onClose} title="Create Purchase Order">
      <div className="card-body">
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="field-label">Supplier *</label>
              <select className="field-input" value={supplierId} onChange={e => setSupplierId(e.target.value)} required>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Destination Warehouse *</label>
              <select className="field-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Expected Arrival *</label>
            <input type="date" className="field-input" value={expectedAt} onChange={e => setExpectedAt(e.target.value)} required />
          </div>

          {/* Lines */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label className="field-label" style={{ margin: 0 }}>Line Items *</label>
              <button type="button" className="btn btn-sm" onClick={addLine}>+ Add Line</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lines.map((line, i) => {
                const sku = catalog.find(c => c.id === line.skuId);
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 28px", gap: 6, alignItems: "center" }}>
                    <select className="field-input" value={line.skuId} onChange={e => setLine(i, "skuId", e.target.value)} required>
                      <option value="">— Product —</option>
                      {catalog.map(c => <option key={c.id} value={c.id}>{c.sku} — {c.name}</option>)}
                    </select>
                    <input
                      type="number" className="field-input" min="1" step="1"
                      value={line.qty} onChange={e => setLine(i, "qty", parseInt(e.target.value) || 1)}
                      placeholder={`Qty (${sku?.unit ?? "pc"})`}
                    />
                    <input
                      type="number" className="field-input" min="0" step="0.01"
                      value={line.unitCost || ""} onChange={e => setLine(i, "unitCost", parseFloat(e.target.value) || 0)}
                      placeholder="Unit cost"
                    />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(i)} disabled={lines.length === 1}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}>
            Total: {peso(total)}
          </div>

          {err && <p style={{ color: "oklch(var(--err))", fontSize: 12.5 }}>{err}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create PO"}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

// ── Receive PO modal ──────────────────────────────────────────────────────────
function ReceiveModal({ po, onClose }: { po: PoRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lineData, setLineData] = useState(po.lines.map(l => ({
    lineId: l.id, skuId: l.skuId, accepted: l.qty, damaged: 0,
    lotNumber: "", expiryDate: "",
    // Defaults to the PO's agreed cost; the warehouse overrides it when the delivery
    // lands at a different price. Whatever is confirmed here becomes this lot's cost
    // and follows the goods through FIFO into COGS.
    unitCost: l.unitCost,
  })));
  const [err, setErr] = useState("");

  function setVal<K extends keyof typeof lineData[0]>(i: number, key: K, val: typeof lineData[0][K]) {
    setLineData(d => d.map((row, j) => j === i ? { ...row, [key]: val } : row));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    start(async () => {
      try {
        await receivePO({
          poId: po.id,
          lines: lineData.map(l => ({
            lineId: l.lineId, skuId: l.skuId,
            accepted: l.accepted, damaged: l.damaged,
            lotNumber: l.lotNumber || undefined,
            expiryDate: l.expiryDate || undefined,
            unitCost: l.unitCost,
          })),
        });
        router.refresh(); onClose();
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <Modal open onClose={onClose} title={`Receive PO — ${po.id}`}>
      <div className="card-body">
        <p style={{ fontSize: 12.5, color: "oklch(var(--ink-3))", marginBottom: 12 }}>
          {po.supplierName} → {po.warehouseName}
        </p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {po.lines.map((l, i) => (
            <div key={l.id} style={{ padding: "12px 14px", borderRadius: 8, background: "oklch(var(--bg-2))", border: "1px solid oklch(var(--line))" }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{l.skuName}</div>
              <div style={{ fontSize: 11.5, color: "oklch(var(--ink-3))", marginBottom: 10 }}>{l.skuCode} · ordered {l.qty} {l.unit}</div>
              <div style={{ display: "grid", gridTemplateColumns: "90px 90px 110px 1fr 140px", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(var(--ink-3))", display: "block", marginBottom: 3 }}>Accepted</label>
                  <input type="number" className="field-input" min="0" max={l.qty} step="1" style={{ textAlign: "center" }}
                    value={lineData[i].accepted} onChange={e => setVal(i, "accepted", parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(var(--ink-3))", display: "block", marginBottom: 3 }}>Damaged</label>
                  <input type="number" className="field-input" min="0" max={l.qty} step="1" style={{ textAlign: "center" }}
                    value={lineData[i].damaged} onChange={e => setVal(i, "damaged", parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(var(--ink-3))", display: "block", marginBottom: 3 }}>Unit Cost</label>
                  <input type="number" className="field-input" min="0" step="0.0001" style={{ textAlign: "right" }}
                    value={lineData[i].unitCost} onChange={e => setVal(i, "unitCost", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(var(--ink-3))", display: "block", marginBottom: 3 }}>Lot / Batch No.</label>
                  <input type="text" className="field-input" placeholder="e.g. LOT-2025-001"
                    value={lineData[i].lotNumber} onChange={e => setVal(i, "lotNumber", e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(var(--ink-3))", display: "block", marginBottom: 3 }}>Expiry Date</label>
                  <input type="date" className="field-input"
                    value={lineData[i].expiryDate} onChange={e => setVal(i, "expiryDate", e.target.value)} />
                </div>
              </div>
            </div>
          ))}
          {err && <p style={{ color: "oklch(var(--err))", fontSize: 12.5 }}>{err}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Processing…" : "Confirm Receipt"}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

// ── B.O. (backorder) log panel ────────────────────────────────────────────────
function BoLogPanel({ po, catalog, bills, role, onChanged }: {
  po: PoRow; catalog: CatalogItem[]; bills: BillOption[]; role: string; onChanged: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [logLineId, setLogLineId] = useState("");
  const [qty, setQty] = useState(1);
  const [costPerUnit, setCostPerUnit] = useState(0);
  const [disposition, setDisposition] = useState<"GOOD" | "BAD">("GOOD");
  const [badReasonType, setBadReasonType] = useState("DAMAGED_CONTAINER");
  const [badReasonNote, setBadReasonNote] = useState("");

  const canLog = ["WAREHOUSE", "ADMIN"].includes(role);
  const canClose = ["FINANCE", "ADMIN"].includes(role);

  const outstandingByLine = po.lines.map(l => {
    const logged = po.backorders.filter(b => b.poLineId === l.id).reduce((s, b) => s + b.qty, 0);
    return { line: l, outstanding: l.damaged - logged };
  }).filter(x => x.outstanding > 0);

  const allResolved = outstandingByLine.length === 0;
  const linkedBills = po.bills;
  const allPaid = linkedBills.length > 0 && linkedBills.every(b => b.status === "PAID");
  const closeable = allResolved && allPaid && !po.closedAt;

  const supplierBillOptions = bills.filter(b => b.supplierId === po.supplierId && (!b.poId || b.poId === po.id));

  function submitLog(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const target = outstandingByLine.find(x => x.line.id === logLineId);
    if (!target) { setErr("Select a line with outstanding B.O. qty."); return; }
    start(async () => {
      try {
        await logBackorder({
          poId: po.id, poLineId: logLineId, skuId: target.line.skuId, warehouseId: po.warehouseId,
          qty, costPerUnit, disposition,
          badReasonType: disposition === "BAD" ? (badReasonType as never) : undefined,
          badReasonNote: disposition === "BAD" ? (badReasonNote || undefined) : undefined,
        });
        router.refresh(); onChanged();
        setQty(1); setCostPerUnit(0); setBadReasonNote("");
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  function handleLinkBill(billId: string) {
    start(async () => {
      const res = await linkBillToPO(billId, po.id);
      if (res.error) setErr(res.error); else { router.refresh(); onChanged(); }
    });
  }

  function handleClose() {
    setErr("");
    start(async () => {
      try {
        await closePO(po.id);
        router.refresh(); onChanged();
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <div style={{ borderTop: "1px solid oklch(var(--line))", paddingTop: 14, marginTop: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        B.O. (Backorder) Log
      </div>

      {po.backorders.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid oklch(var(--line))" }}>
              <th style={{ textAlign: "left", padding: "4px 0" }}>SKU</th>
              <th style={{ textAlign: "right", padding: "4px 4px" }}>Qty</th>
              <th style={{ textAlign: "left", padding: "4px 4px" }}>Disposition</th>
              <th style={{ textAlign: "left", padding: "4px 4px" }}>Reason</th>
              <th style={{ textAlign: "left", padding: "4px 0" }}>Logged by</th>
            </tr>
          </thead>
          <tbody>
            {po.backorders.map(b => {
              const sku = catalog.find(c => c.id === b.skuId);
              return (
                <tr key={b.id} style={{ borderBottom: "1px solid oklch(var(--line))" }}>
                  <td style={{ padding: "6px 0" }}>{sku?.name ?? b.skuId}</td>
                  <td style={{ textAlign: "right", padding: "6px 4px" }}>{b.qty}</td>
                  <td style={{ padding: "6px 4px" }}>
                    <span className={`pill ${b.disposition === "GOOD" ? "pill-DELIVERED" : "pill-CANCELLED"}`}>{b.disposition === "GOOD" ? "Good — restocked" : "Bad — written off"}</span>
                  </td>
                  <td style={{ padding: "6px 4px" }}>{b.badReasonType ? BO_REASON_LABEL[b.badReasonType] : "—"}{b.badReasonNote ? ` (${b.badReasonNote})` : ""}</td>
                  <td style={{ padding: "6px 0", fontSize: 11, color: "oklch(var(--ink-3))" }}>{b.loggedByName ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!po.closedAt && outstandingByLine.length > 0 && (
        <div style={{ fontSize: 12, color: "oklch(0.45 0.12 25)", marginBottom: 10 }}>
          {outstandingByLine.map(x => `${x.outstanding} × ${x.line.skuName}`).join(", ")} still unresolved.
        </div>
      )}

      {!po.closedAt && canLog && outstandingByLine.length > 0 && (
        <form onSubmit={submitLog} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, padding: 12, borderRadius: 8, background: "oklch(var(--bg-2))" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", gap: 8 }}>
            <select className="field-input" value={logLineId} onChange={e => setLogLineId(e.target.value)} required>
              <option value="">— Line with outstanding B.O. —</option>
              {outstandingByLine.map(x => (
                <option key={x.line.id} value={x.line.id}>{x.line.skuName} (outstanding {x.outstanding})</option>
              ))}
            </select>
            <input type="number" className="field-input" min="1" step="1" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} placeholder="Qty" />
            <input type="number" className="field-input" min="0" step="0.01" value={costPerUnit || ""} onChange={e => setCostPerUnit(parseFloat(e.target.value) || 0)} placeholder="Cost/unit" />
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="radio" checked={disposition === "GOOD"} onChange={() => setDisposition("GOOD")} /> Good B.O. — return to inventory
            </label>
            <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="radio" checked={disposition === "BAD"} onChange={() => setDisposition("BAD")} /> Bad B.O. — write off
            </label>
          </div>
          {disposition === "BAD" && (
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8 }}>
              <select className="field-input" value={badReasonType} onChange={e => setBadReasonType(e.target.value)}>
                {Object.entries(BO_REASON_LABEL).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
              <input type="text" className="field-input" placeholder="Note (optional)" value={badReasonNote} onChange={e => setBadReasonNote(e.target.value)} />
            </div>
          )}
          <div>
            <button type="submit" className="btn btn-sm btn-accent" disabled={pending}>{pending ? "Logging…" : "Log B.O."}</button>
          </div>
        </form>
      )}

      {canClose && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "oklch(var(--ink-3))", display: "block", marginBottom: 3 }}>Link Supplier Bill</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {linkedBills.length === 0 && <span style={{ fontSize: 12, color: "oklch(var(--ink-3))" }}>No bill linked yet.</span>}
              {linkedBills.map(b => <span key={b.id} className={`pill ${b.status === "PAID" ? "pill-DELIVERED" : "pill-PENDING"}`}>{b.id} · {b.status}</span>)}
              {supplierBillOptions.filter(b => !linkedBills.some(lb => lb.id === b.id)).length > 0 && (
                <select className="field-input" style={{ width: 220 }} defaultValue="" onChange={e => e.target.value && handleLinkBill(e.target.value)}>
                  <option value="">+ Link a bill…</option>
                  {supplierBillOptions.filter(b => !linkedBills.some(lb => lb.id === b.id)).map(b => (
                    <option key={b.id} value={b.id}>{b.id} · {peso(b.amount)} · {b.status}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {po.closedAt ? (
            <div style={{ fontSize: 12.5, color: "oklch(0.40 0.09 155)", fontWeight: 500 }}>Closed {fmtDate(po.closedAt)}.</div>
          ) : (
            <div>
              <button className="btn btn-primary btn-sm" disabled={!closeable || pending} onClick={handleClose} title={!closeable ? "Resolve all B.O. lines and fully pay a linked bill first" : ""}>
                {pending ? "Closing…" : "Close PO"}
              </button>
              {!closeable && (
                <span style={{ fontSize: 11.5, color: "oklch(var(--ink-3))", marginLeft: 8 }}>
                  {!allResolved ? "Resolve outstanding B.O. lines" : !allPaid ? "Bill must be fully paid" : ""}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {err && <p style={{ color: "oklch(var(--err))", fontSize: 12.5, marginTop: 8 }}>{err}</p>}
    </div>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
function DetailDrawer({ po, catalog, bills, role, onClose, onReceive, onDelay, onChanged }: {
  po: PoRow; catalog: CatalogItem[]; bills: BillOption[]; role: string; onClose: () => void;
  onReceive: () => void; onDelay: () => void; onChanged: () => void;
}) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer">
        <div className="card-head" style={{ justifyContent: "space-between" }}>
          <div>
            <span className="card-h" style={{ fontFamily: "var(--font-geist-mono, ui-monospace)", fontSize: 14 }}>{po.id}</span>
            <span style={{ marginLeft: 10 }}><span className={`pill ${STATUS_PILL[po.status]}`}>{po.status}</span></span>
            {po.closedAt && <span style={{ marginLeft: 6 }}><span className="pill pill-DELIVERED">CLOSED</span></span>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <a href={`/print/po/${po.id}`} target="_blank" className="btn btn-ghost btn-sm" title="Print PO">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print PO
            </a>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          <div className="dl">
            <dt>Supplier</dt><dd>{po.supplierName}</dd>
            <dt>Warehouse</dt><dd>{po.warehouseName}</dd>
            <dt>Expected</dt><dd>{fmtDate(po.expectedAt)}</dd>
            <dt>Total</dt><dd style={{ fontWeight: 600 }}>{peso(po.total)}</dd>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Line Items</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid oklch(var(--line))" }}>
                  <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 600 }}>Product</th>
                  <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: 600 }}>Ordered</th>
                  {po.status === "RECEIVED" && <>
                    <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: 600 }}>Accepted</th>
                    <th style={{ textAlign: "right", padding: "4px 4px", fontWeight: 600 }}>Damaged</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {po.lines.map(l => (
                  <tr key={l.id} style={{ borderBottom: "1px solid oklch(var(--line))" }}>
                    <td style={{ padding: "6px 0" }}>
                      <div style={{ fontWeight: 500 }}>{l.skuName}</div>
                      <div style={{ fontSize: 11, color: "oklch(var(--ink-3))" }}>{l.skuCode}</div>
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 4px" }}>{l.qty} {l.unit}</td>
                    {po.status === "RECEIVED" && <>
                      <td style={{ textAlign: "right", padding: "6px 4px", color: "oklch(0.40 0.09 155)", fontWeight: 500 }}>{l.accepted}</td>
                      <td style={{ textAlign: "right", padding: "6px 4px", color: l.damaged > 0 ? "oklch(0.45 0.12 25)" : "oklch(var(--ink-3))" }}>{l.damaged}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {po.status === "EXPECTED" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-accent" onClick={onReceive}>Receive Goods</button>
              <button className="btn" onClick={onDelay}>Mark Delayed</button>
            </div>
          )}
          {po.status === "RECEIVING" && (
            <button className="btn btn-accent" onClick={onReceive}>Complete Receipt</button>
          )}

          {po.status === "RECEIVED" && po.lines.some(l => l.damaged > 0) && (
            <BoLogPanel po={po} catalog={catalog} bills={bills} role={role} onChanged={onChanged} />
          )}
        </div>
      </div>
    </>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function InboundClient({ pos, suppliers, warehouses, catalog, bills, role }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<PoRow | null>(null);
  const [receiving, setReceiving] = useState<PoRow | null>(null);

  // Keep the open detail drawer in sync with fresh server data after a B.O./close action.
  useEffect(() => {
    if (selected) {
      const fresh = pos.find(p => p.id === selected.id);
      if (fresh) setSelected(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  const filtered = pos.filter(p => {
    if (filterStatus !== "ALL" && p.status !== filterStatus) return false;
    const q = search.toLowerCase();
    return !q || p.id.toLowerCase().includes(q) || p.supplierName.toLowerCase().includes(q) || p.warehouseName.toLowerCase().includes(q);
  });

  const counts = { EXPECTED: 0, RECEIVING: 0, RECEIVED: 0, DELAYED: 0 };
  pos.forEach(p => { counts[p.status as keyof typeof counts] = (counts[p.status as keyof typeof counts] ?? 0) + 1; });

  function handleDelay(po: PoRow) {
    start(async () => { await updatePOStatus(po.id, "DELAYED"); router.refresh(); setSelected(null); });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2" style={{ flex: 1 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600 }}>Purchase Orders</h1>
          <HelpButton slug="inbound-pos" label="Help: Purchase Orders" />
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          New PO
        </button>
      </div>

      {/* Status chips */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["ALL", "All"], ["EXPECTED", "Expected"], ["RECEIVING", "Receiving"], ["RECEIVED", "Received"], ["DELAYED", "Delayed"]].map(([val, label]) => (
          <button
            key={val}
            className="btn btn-sm"
            style={filterStatus === val ? { background: "oklch(var(--accent))", color: "white", borderColor: "oklch(var(--accent))" } : {}}
            onClick={() => setFilterStatus(val)}
          >
            {label}
            {val !== "ALL" && <span style={{ marginLeft: 4, opacity: 0.7 }}>{counts[val as keyof typeof counts]}</span>}
          </button>
        ))}
        <div className="search-box" style={{ width: 200, marginLeft: "auto" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input placeholder="Search POs…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="id">PO #</th>
              <th>Supplier</th>
              <th>Warehouse</th>
              <th>Status</th>
              <th>Expected</th>
              <th className="num">Lines</th>
              <th className="num">Total</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="empty-state" style={{ padding: "32px 0" }}>No purchase orders found</td></tr>
            )}
            {filtered.map(po => (
              <tr key={po.id} onClick={() => setSelected(po)} style={{ cursor: "pointer" }}>
                <td className="id">{po.id}</td>
                <td style={{ fontWeight: 500 }}>{po.supplierName}</td>
                <td className="dim">{po.warehouseName}</td>
                <td><span className={`pill ${STATUS_PILL[po.status]}`}>{po.status}</span></td>
                <td style={{ fontSize: 12.5 }}>{fmtDate(po.expectedAt)}</td>
                <td className="num dim">{po.lines.length}</td>
                <td className="num" style={{ fontWeight: 500 }}>{peso(po.total)}</td>
                <td className="dim" style={{ fontSize: 12 }}>{fmtDate(po.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && <CreatePoModal suppliers={suppliers} warehouses={warehouses} catalog={catalog} onClose={() => setCreateOpen(false)} />}
      {selected && !receiving && (
        <DetailDrawer
          po={selected}
          catalog={catalog}
          bills={bills}
          role={role}
          onClose={() => setSelected(null)}
          onReceive={() => { setReceiving(selected); setSelected(null); }}
          onDelay={() => handleDelay(selected)}
          onChanged={() => {}}
        />
      )}
      {receiving && <ReceiveModal po={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}
