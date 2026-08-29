"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { peso, orderTotal } from "@/lib/utils";
import { createQuote, updateQuote, sendQuote, convertToOrder } from "./actions";
import type { Customer, CatalogItem, Warehouse } from "@prisma/client";

type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "CONVERTED" | "EXPIRED" | "REJECTED";

interface QuoteLine {
  id: string;
  skuId: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number | string;
  lineTotal: number | string;
}

interface Quote {
  id: string;
  status: QuoteStatus;
  validUntil: Date | string;
  notes: string | null;
  subtotal: number | string;
  vat: number | string;
  cwt: number | string;
  cwt2307: boolean;
  total: number | string;
  orderId: string | null;
  createdAt: Date | string;
  customer: { id: string; name: string };
  agent: { id: string; name: string } | null;
  warehouse: { id: string; name: string };
  lines: QuoteLine[];
}

interface Props {
  quotes: Quote[];
  customers: Customer[];
  catalog: CatalogItem[];
  warehouses: Warehouse[];
  canCreate: boolean;
}

const STATUS_COLOR: Record<QuoteStatus, string> = {
  DRAFT: "#6b7280", SENT: "#2563eb", ACCEPTED: "#16a34a",
  CONVERTED: "#7c3aed", EXPIRED: "#d97706", REJECTED: "#dc2626",
};

function StatusPill({ status }: { status: QuoteStatus }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      fontSize: 11, fontWeight: 600,
      background: STATUS_COLOR[status] + "22", color: STATUS_COLOR[status],
    }}>{status}</span>
  );
}

interface FormLine { skuId: string; qty: number; unitPrice: number }

function QuoteFormModal({
  open, onClose, customers, catalog, warehouses, initial,
}: {
  open: boolean; onClose: () => void;
  customers: Customer[]; catalog: CatalogItem[]; warehouses: Warehouse[];
  initial?: Quote;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [customerId, setCustomerId] = useState(initial?.customer.id ?? "");
  const [warehouseId, setWarehouseId] = useState(initial?.warehouse.id ?? warehouses[0]?.id ?? "");
  const [validUntil, setValidUntil] = useState(
    initial ? new Date(initial.validUntil).toISOString().slice(0, 10) :
      new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );
  const [cwt2307, setCwt2307] = useState(initial?.cwt2307 ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<FormLine[]>(
    initial?.lines.map(l => ({ skuId: l.skuId, qty: l.qty, unitPrice: Number(l.unitPrice) })) ??
    [{ skuId: "", qty: 1, unitPrice: 0 }]
  );

  if (!open) return null;

  function addLine() { setLines(l => [...l, { skuId: "", qty: 1, unitPrice: 0 }]); }
  function removeLine(i: number) { setLines(l => l.filter((_, idx) => idx !== i)); }
  function updateLine(i: number, field: keyof FormLine, value: string | number) {
    setLines(prev => {
      const next = [...prev];
      if (field === "skuId") {
        const item = catalog.find(c => c.id === value);
        next[i] = { ...next[i], skuId: value as string, unitPrice: item ? Number(item.unitPrice) : 0 };
      } else {
        next[i] = { ...next[i], [field]: Number(value) };
      }
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
    startTransition(async () => {
      try {
        const payload = { customerId, warehouseId, validUntil, cwt2307, notes, lines };
        if (initial) {
          await updateQuote(initial.id, payload);
          toast(`Quotation ${initial.id} updated`, "success");
        } else {
          const id = await createQuote(payload);
          toast(`Quotation ${id} created`, "success");
        }
        router.refresh();
        onClose();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "oklch(var(--bg))", borderRadius: 10, width: "min(860px, 95vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid oklch(var(--line))", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{initial ? `Edit ${initial.id}` : "New Quotation"}</span>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
          </div>
          <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="field-label">Customer</label>
              <select className="field-input" value={customerId} onChange={e => setCustomerId(e.target.value)} required>
                <option value="">Select customer…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Warehouse</label>
              <select className="field-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Valid Until</label>
              <input type="date" className="field-input" value={validUntil} onChange={e => setValidUntil(e.target.value)} required />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20 }}>
              <input type="checkbox" id="cwt-q" checked={cwt2307} onChange={e => setCwt2307(e.target.checked)} className="w-3.5 h-3.5" />
              <label htmlFor="cwt-q" className="text-[12.5px]" style={{ color: "oklch(var(--ink-2))" }}>Apply BIR Form 2307 (−2% CWT)</label>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label className="field-label">Notes</label>
              <textarea className="field-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Terms, delivery conditions…" />
            </div>
          </div>

          <div style={{ margin: "0 20px", border: "1px solid oklch(var(--line))", borderRadius: 7, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", background: "oklch(var(--bg-2))", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Line Items</span>
              <button type="button" onClick={addLine} className="btn btn-sm">+ Add line</button>
            </div>
            <table className="tbl" style={{ borderRadius: 0 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num" style={{ width: 80 }}>Qty</th>
                  <th className="num" style={{ width: 130 }}>Unit Price</th>
                  <th className="num" style={{ width: 130 }}>Line Total</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td>
                      <select className="field-input" value={line.skuId} onChange={e => updateLine(i, "skuId", e.target.value)} required>
                        <option value="">Select product…</option>
                        {catalog.map(c => <option key={c.id} value={c.id}>{c.name} ({c.sku})</option>)}
                      </select>
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
            <div style={{ padding: "12px 16px", borderTop: "1px solid oklch(var(--line))" }}>
              <div className="ledger">
                <div className="ledger-row"><span>Subtotal</span><span></span><span>{peso(subtotal)}</span></div>
                <div className="ledger-row"><span className="ledger-row-cr">VAT (12%)</span><span></span><span>{peso(vat)}</span></div>
                {cwt2307 && <div className="ledger-row"><span className="ledger-row-cr">CWT 2307 (−2%)</span><span></span><span>({peso(cwt)})</span></div>}
                <div className="ledger-row ledger-row-total"><span>Total</span><span></span><span>{peso(total)}</span></div>
              </div>
            </div>
          </div>

          <div style={{ padding: "16px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="submit" disabled={isPending} className="btn btn-accent">
              {isPending ? "Saving…" : initial ? "Update Quotation" : "Create Quotation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function QuotesClient({ quotes, customers, catalog, warehouses, canCreate }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editQuote, setEditQuote] = useState<Quote | undefined>();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  function handleSend(id: string) {
    startTransition(async () => {
      try {
        await sendQuote(id);
        toast(`Quotation ${id} sent`, "success");
        router.refresh();
      } catch (e) { toast((e as Error).message, "error"); }
    });
  }

  function handleConvert(id: string) {
    startTransition(async () => {
      try {
        const orderId = await convertToOrder(id);
        toast(`Order ${orderId} created from ${id}`, "success");
        router.push(`/orders/${orderId}`);
      } catch (e) { toast((e as Error).message, "error"); }
    });
  }

  const filtered = quotes.filter(q => {
    const matchStatus = statusFilter === "ALL" || q.status === statusFilter;
    const matchSearch = !search || q.id.toLowerCase().includes(search.toLowerCase()) ||
      q.customer.name.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <>
      <QuoteFormModal
        open={showForm || !!editQuote}
        onClose={() => { setShowForm(false); setEditQuote(undefined); }}
        customers={customers}
        catalog={catalog}
        warehouses={warehouses}
        initial={editQuote}
      />

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            className="field-input" style={{ width: 240 }}
            placeholder="Search quotations…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <select className="field-input" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All Statuses</option>
            {["DRAFT", "SENT", "ACCEPTED", "CONVERTED", "EXPIRED", "REJECTED"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span style={{ flex: 1 }} />
          {canCreate && (
            <button className="btn btn-accent" onClick={() => setShowForm(true)}>+ New Quotation</button>
          )}
        </div>

        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Quote #</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="num">Total</th>
                  <th>Valid Until</th>
                  <th>Agent</th>
                  <th style={{ width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: "32px 0", color: "oklch(var(--ink-3))", fontSize: 13 }}>No quotations found</td></tr>
                )}
                {filtered.map(q => (
                  <tr key={q.id}>
                    <td>
                      <a href={`/print/quote/${q.id}`} target="_blank" style={{ fontFamily: "monospace", fontSize: 12, color: "oklch(var(--accent))", textDecoration: "none", fontWeight: 600 }}>
                        {q.id}
                      </a>
                    </td>
                    <td>{q.customer.name}</td>
                    <td><StatusPill status={q.status} /></td>
                    <td className="num">{peso(Number(q.total))}</td>
                    <td style={{ fontSize: 12 }}>{new Date(q.validUntil).toLocaleDateString("en-PH")}</td>
                    <td style={{ fontSize: 12 }}>{q.agent?.name ?? "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {q.status === "DRAFT" && canCreate && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditQuote(q)}>Edit</button>
                        )}
                        {q.status === "DRAFT" && canCreate && (
                          <button className="btn btn-sm" onClick={() => handleSend(q.id)} disabled={isPending}>Send</button>
                        )}
                        {["SENT", "ACCEPTED"].includes(q.status) && canCreate && (
                          <button className="btn btn-accent btn-sm" onClick={() => handleConvert(q.id)} disabled={isPending}>→ Order</button>
                        )}
                        <a href={`/print/quote/${q.id}`} target="_blank" className="btn btn-ghost btn-sm">Print</a>
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
