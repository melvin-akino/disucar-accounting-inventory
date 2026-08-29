"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createOrder, getCustomerCredit, getAvailableLots, type AvailableLot } from "../actions";
import { useToast } from "@/components/ui/Toast";
import { peso, orderTotal } from "@/lib/utils";
import type { Customer, CatalogItem, Warehouse } from "@prisma/client";
import type { CreditStatus } from "@/lib/credit";

interface Props {
  customers: Customer[];
  catalog: CatalogItem[];
  warehouses: Warehouse[];
  fixedCustomerId?: string;  // set for CUSTOMER role
  backHref?: string;
  currentRole?: string;
}

interface Line {
  skuId: string;
  qty: number;
  unitPrice: number;
  // Per-lot quantities keyed by lot id. Empty until the picker is opened; an empty
  // selection submits nothing and the server applies FIFO.
  lotPlan: Record<string, number>;
  lotOverrideReason: string;
}
interface FreeLine { skuId: string; qty: number }

function CreditInfoBar({ credit }: { credit: CreditStatus }) {
  const projectedUtil = credit.creditLimit > 0
    ? Math.min((credit.outstanding / credit.creditLimit) * 100, 100)
    : 0;
  const barColor = credit.onHold ? "#dc2626" : projectedUtil > 75 ? "#d97706" : "#16a34a";

  return (
    <div style={{ padding: "10px 14px", borderRadius: 7, border: `1px solid ${credit.onHold ? "#fecaca" : "#e5e7eb"}`, background: credit.onHold ? "#fef2f2" : "oklch(var(--bg-2))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: credit.onHold ? "#dc2626" : "oklch(var(--ink-2))" }}>
          {credit.onHold ? `⚠ Customer has ${credit.unpaidCount} unpaid receipts` : "Account standing"}
        </span>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "oklch(var(--ink-3))" }}>
          {credit.unpaidCount} unpaid receipt{credit.unpaidCount === 1 ? "" : "s"}
        </span>
      </div>
      {credit.creditLimit > 0 && (
        <>
          <div style={{ height: 6, borderRadius: 3, background: "oklch(var(--line))", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${projectedUtil}%`, background: barColor, borderRadius: 3, transition: "width 0.3s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "oklch(var(--ink-3))" }}>
            <span>Outstanding AR: {peso(credit.outstanding)}</span>
            <span>Available: {peso(Math.max(0, credit.available))}</span>
          </div>
        </>
      )}
      {credit.onHold && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626", fontWeight: 500 }}>
          This order will still submit, but requires a Finance/Admin override to be approved.
        </div>
      )}
    </div>
  );
}

/**
 * Lot picker for one order line.
 *
 * Opens pre-filled with the FIFO selection — the default the business wants — and lets
 * the salesperson redistribute across layers when there is a reason to (a nearer pallet,
 * a customer who wants a specific delivery). Deviating requires a reason, which the
 * server also insists on, so this is convenience rather than the enforcement point.
 */
function LotPicker({
  skuId,
  warehouseId,
  qty,
  plan,
  reason,
  onChange,
  onReasonChange,
}: {
  skuId: string;
  warehouseId: string;
  qty: number;
  plan: Record<string, number>;
  reason: string;
  onChange: (plan: Record<string, number>) => void;
  onReasonChange: (reason: string) => void;
}) {
  const [lots, setLots] = useState<AvailableLot[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!skuId || !warehouseId || qty < 1) return;
    setLoading(true);
    try {
      const rows = await getAvailableLots(skuId, warehouseId, qty);
      setLots(rows);
      // Seed with FIFO on first open so the default is visible, not implicit.
      if (Object.keys(plan).length === 0) {
        const fifo: Record<string, number> = {};
        rows.forEach(r => { if (r.fifoQty > 0) fifo[r.id] = r.fifoQty; });
        onChange(fifo);
      }
      setOpen(true);
    } catch {
      setLots([]);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  const selected = Object.values(plan).reduce((s, n) => s + n, 0);
  const isFifo = !lots || lots.every(r => (plan[r.id] ?? 0) === r.fifoQty);

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={!skuId || loading}>
        {loading ? "Loading…" : "Lots: FIFO"}
      </button>
    );
  }

  return (
    <div style={{ padding: "8px 10px", background: "oklch(var(--bg-2))", borderRadius: 6, border: "1px solid oklch(var(--line))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600 }}>
          Lot selection {isFifo ? "· FIFO (default)" : "· manual override"}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
      </div>

      {lots && lots.length === 0 && (
        <p style={{ fontSize: 11.5, color: "oklch(var(--ink-3))" }}>
          No costed lots on hand for this item — FIFO will apply at delivery.
        </p>
      )}

      {lots && lots.map(r => (
        <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 70px", gap: 6, alignItems: "center", padding: "3px 0" }}>
          <span style={{ fontSize: 11.5, fontFamily: "monospace" }}>{r.lotNumber}</span>
          <span style={{ fontSize: 11, color: "oklch(var(--ink-3))" }}>
            {new Date(r.receivedAt).toLocaleDateString("en-PH")}
          </span>
          <span style={{ fontSize: 11, color: "oklch(var(--ink-3))" }}>
            {peso(r.unitCost)} · {r.remainingQty} left
          </span>
          <input
            type="number" className="field-input" min={0} max={r.remainingQty} step={1}
            style={{ textAlign: "right", padding: "2px 4px", fontSize: 11.5 }}
            value={plan[r.id] ?? 0}
            onChange={e => {
              const v = parseInt(e.target.value, 10) || 0;
              const next = { ...plan };
              if (v > 0) next[r.id] = v; else delete next[r.id];
              onChange(next);
            }}
          />
        </div>
      ))}

      <div style={{ fontSize: 11.5, marginTop: 6, color: selected === qty ? "oklch(var(--ink-3))" : "oklch(var(--err))" }}>
        Selected {selected} of {qty}
      </div>

      {!isFifo && (
        <input
          className="field-input"
          style={{ marginTop: 6, fontSize: 11.5 }}
          placeholder="Reason for not using FIFO (required)"
          value={reason}
          onChange={e => onReasonChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function NewOrderForm({ customers, catalog, warehouses, fixedCustomerId, backHref = "/orders" }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [customerId, setCustomerId] = useState(fixedCustomerId ?? "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [cwt2307, setCwt2307] = useState(false);
  const [notes, setNotes] = useState("");
  const [msrCode, setMsrCode] = useState("");
  const [channel, setChannel] = useState<"RETAIL" | "WHOLESALE">("RETAIL");
  const [lines, setLines] = useState<Line[]>([{ skuId: "", qty: 1, unitPrice: 0, lotPlan: {}, lotOverrideReason: "" }]);
  const [freeLines, setFreeLines] = useState<FreeLine[]>([]);
  const [credit, setCredit] = useState<CreditStatus | null>(null);

  // Fetch credit status whenever customer changes
  useEffect(() => {
    setCredit(null);
    if (!customerId) return;
    getCustomerCredit(customerId).then(setCredit).catch(() => {});
  }, [customerId]);

  function addLine() { setLines(l => [...l, { skuId: "", qty: 1, unitPrice: 0, lotPlan: {}, lotOverrideReason: "" }]); }
  function removeLine(i: number) { setLines(l => l.filter((_, idx) => idx !== i)); }

  // Price for the active channel. The server re-resolves wholesale prices from the
  // catalog regardless — this only keeps the form's running total honest.
  function priceFor(item: CatalogItem | undefined) {
    if (!item) return 0;
    if (channel === "WHOLESALE") {
      return item.wholesalePrice === null ? 0 : Number(item.wholesalePrice);
    }
    return Number(item.unitPrice);
  }

  function updateLine(i: number, field: keyof Line, value: string | number) {
    setLines(prev => {
      const next = [...prev];
      if (field === "skuId") {
        next[i] = { ...next[i], skuId: value as string, unitPrice: priceFor(catalog.find(c => c.id === value)) };
      } else {
        next[i] = { ...next[i], [field]: Number(value) };
      }
      return next;
    });
  }

  // Switching channel reprices every line that already has a product selected.
  function switchChannel(next: "RETAIL" | "WHOLESALE") {
    setChannel(next);
    setLines(prev =>
      prev.map(l => {
        if (!l.skuId) return l;
        const item = catalog.find(c => c.id === l.skuId);
        if (!item) return l;
        const price = next === "WHOLESALE"
          ? (item.wholesalePrice === null ? 0 : Number(item.wholesalePrice))
          : Number(item.unitPrice);
        return { ...l, unitPrice: price };
      })
    );
  }

  // Items with no wholesale price cannot be sold on that channel — surfaced before
  // submission rather than as a server error.
  const unavailableWholesale = channel === "WHOLESALE"
    ? lines
        .filter(l => l.skuId)
        .map(l => catalog.find(c => c.id === l.skuId))
        .filter((c): c is CatalogItem => !!c && c.wholesalePrice === null)
    : [];

  function addFreeLine() { setFreeLines(l => [...l, { skuId: "", qty: 1 }]); }
  function removeFreeLine(i: number) { setFreeLines(l => l.filter((_, idx) => idx !== i)); }
  function updateFreeLine(i: number, field: keyof FreeLine, value: string | number) {
    setFreeLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: field === "skuId" ? value : Number(value) };
      return next;
    });
  }

  const subtotal = lines.reduce((s, l) => s + (l.qty || 0) * (l.unitPrice || 0), 0);
  const { vat, cwt, total } = orderTotal(subtotal, cwt2307);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !warehouseId) { toast("Select customer and warehouse", "error"); return; }
    if (lines.some(l => !l.skuId || l.qty < 1 || l.unitPrice <= 0)) {
      toast("Complete all line items", "error"); return;
    }
    if (freeLines.some(l => !l.skuId || l.qty < 1)) {
      toast("Complete all free items (product and quantity)", "error"); return;
    }

    startTransition(async () => {
      try {
        const id = await createOrder({
          customerId, warehouseId, cwt2307, notes, msrCode, channel,
          lines: [
            ...lines.map(l => ({
              skuId: l.skuId,
              qty: l.qty,
              unitPrice: l.unitPrice,
              isFree: false,
              // Omitted entirely when untouched, so the server applies FIFO.
              lotPlan: Object.entries(l.lotPlan)
                .filter(([, q]) => q > 0)
                .map(([lotId, qty]) => ({ lotId, qty })),
              lotOverrideReason: l.lotOverrideReason || undefined,
            })),
            ...freeLines.map(l => ({ skuId: l.skuId, qty: l.qty, unitPrice: 0, isFree: true })),
          ],
        });
        toast(`Order ${id} created`, "success");
        router.push(`/orders/${id}`);
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  const fixedCustomerName = fixedCustomerId ? customers[0]?.name : undefined;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="card">
        <div className="card-head"><span className="card-h">Order Details</span></div>
        <div className="card-body grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="field-label">Customer</label>
            {fixedCustomerName ? (
              <div className="field-input" style={{ display:"flex", alignItems:"center", background:"oklch(var(--bg-2))", color:"oklch(var(--ink))", cursor:"not-allowed" }}>
                {fixedCustomerName}
              </div>
            ) : (
              <select className="field-input" value={customerId} onChange={e => setCustomerId(e.target.value)} required>
                <option value="">Select customer…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="field-label">Warehouse</label>
            <select className="field-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          {/* Account standing */}
          {credit && (credit.creditLimit > 0 || credit.unpaidCount > 0) && (
            <div className="col-span-2">
              <CreditInfoBar credit={credit} />
            </div>
          )}

          <div>
            <label className="field-label">MSR Code</label>
            <input className="field-input" value={msrCode} onChange={e => setMsrCode(e.target.value)} placeholder="e.g. MSR-001" />
          </div>
          <div className="col-span-2">
            <label className="field-label">Notes</label>
            <textarea className="field-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions or delivery notes…" />
          </div>
          <div className="col-span-2">
            <label className="field-label">Sales Channel</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["RETAIL", "WHOLESALE"] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  className={`btn btn-sm${channel === c ? " btn-primary" : ""}`}
                  onClick={() => switchChannel(c)}
                >
                  {c === "RETAIL" ? "Retail" : "Wholesale"}
                </button>
              ))}
            </div>
            {channel === "WHOLESALE" && (
              <p style={{ fontSize: 11.5, color: "oklch(var(--ink-3))", marginTop: 6 }}>
                Wholesale pricing applies. Minimum quantities are enforced, and the order
                requires Admin approval before it is confirmed.
              </p>
            )}
            {unavailableWholesale.length > 0 && (
              <p style={{ fontSize: 11.5, color: "oklch(var(--err))", marginTop: 6 }}>
                Not available for wholesale: {unavailableWholesale.map(c => c.name).join(", ")}
              </p>
            )}
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" id="cwt" checked={cwt2307} onChange={e => setCwt2307(e.target.checked)} className="w-3.5 h-3.5" />
            <label htmlFor="cwt" className="text-[12.5px]" style={{ color:"oklch(var(--ink-2))" }}>
              Apply BIR Form 2307 — Creditable Withholding Tax (−2%)
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-h flex-1">Line Items</span>
          <button type="button" onClick={addLine} className="btn btn-sm">+ Add line</button>
        </div>
        <div className="tbl-wrap" style={{ border:0, borderRadius:0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num" style={{ width:80 }}>Qty</th>
                <th className="num" style={{ width:130 }}>Unit Price</th>
                <th className="num" style={{ width:130 }}>Line Total</th>
                <th style={{ width:40 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} style={{ cursor:"default" }}>
                  <td>
                    <select className="field-input" value={line.skuId} onChange={e => updateLine(i, "skuId", e.target.value)} required>
                      <option value="">Select product…</option>
                      {catalog.map(c => <option key={c.id} value={c.id}>{c.name} ({c.sku})</option>)}
                    </select>
                    {line.skuId && (
                      <div style={{ marginTop: 5 }}>
                        <LotPicker
                          skuId={line.skuId}
                          warehouseId={warehouseId}
                          qty={line.qty}
                          plan={line.lotPlan}
                          reason={line.lotOverrideReason}
                          onChange={p => setLines(prev => prev.map((r, j) => j === i ? { ...r, lotPlan: p } : r))}
                          onReasonChange={v => setLines(prev => prev.map((r, j) => j === i ? { ...r, lotOverrideReason: v } : r))}
                        />
                      </div>
                    )}
                  </td>
                  <td className="num">
                    <input type="number" min={1} className="field-input text-right" value={line.qty} onChange={e => updateLine(i, "qty", e.target.value)} required />
                  </td>
                  <td className="num">
                    <input type="number" min={0} step={0.01} className="field-input text-right" value={line.unitPrice} onChange={e => updateLine(i, "unitPrice", e.target.value)} required />
                  </td>
                  <td className="num">{peso(line.qty * line.unitPrice)}</td>
                  <td>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="btn btn-ghost btn-sm btn-danger">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-body border-t" style={{ borderColor:"oklch(var(--line))" }}>
          <div className="ledger">
            <div className="ledger-row"><span>Subtotal</span><span></span><span>{peso(subtotal)}</span></div>
            <div className="ledger-row"><span className="ledger-row-cr">VAT (12%)</span><span></span><span>{peso(vat)}</span></div>
            {cwt2307 && <div className="ledger-row"><span className="ledger-row-cr">CWT 2307 (−2%)</span><span></span><span>({peso(cwt)})</span></div>}
            <div className="ledger-row ledger-row-total"><span>Total</span><span></span><span>{peso(total)}</span></div>
          </div>
        </div>
      </div>

      {/* Free Items — no cost, but still deduct inventory */}
      <div className="card">
        <div className="card-head">
          <span className="card-h flex-1">Free Items</span>
          <button type="button" onClick={addFreeLine} className="btn btn-sm">+ Add free item</button>
        </div>
        <div className="tbl-wrap" style={{ border:0, borderRadius:0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num" style={{ width:80 }}>Qty</th>
                <th className="num" style={{ width:130 }}>Value</th>
                <th style={{ width:40 }}></th>
              </tr>
            </thead>
            <tbody>
              {freeLines.length === 0 && (
                <tr><td colSpan={4} className="dim" style={{ fontSize: 12.5, padding: "10px 8px" }}>No free items. These are given at no cost but still reduce inventory.</td></tr>
              )}
              {freeLines.map((line, i) => (
                <tr key={i} style={{ cursor:"default" }}>
                  <td>
                    <select className="field-input" value={line.skuId} onChange={e => updateFreeLine(i, "skuId", e.target.value)} required>
                      <option value="">Select product…</option>
                      {catalog.map(c => <option key={c.id} value={c.id}>{c.name} ({c.sku})</option>)}
                    </select>
                  </td>
                  <td className="num">
                    <input type="number" min={1} className="field-input text-right" value={line.qty} onChange={e => updateFreeLine(i, "qty", e.target.value)} required />
                  </td>
                  <td className="num" style={{ fontWeight: 600, color: "oklch(var(--ink-3))" }}>FREE</td>
                  <td>
                    <button type="button" onClick={() => removeFreeLine(i)} className="btn btn-ghost btn-sm btn-danger">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.push(backHref)} className="btn">Cancel</button>
        <button type="submit" disabled={isPending} className="btn btn-accent">
          {isPending ? "Creating…" : "Create Order"}
        </button>
      </div>
    </form>
  );
}
