"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { applyOrderDiscount } from "../actions";
import { useToast } from "@/components/ui/Toast";
import { peso, orderTotal } from "@/lib/utils";

export interface EditorLine {
  id: string;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  discountPct: number | null;
  isFree: boolean;
  lots: { id: string; lotNumber: string; qtyTaken: number; expiryDate: string | null }[];
}

type Mode = "NONE" | "CUSTOMER" | "PRODUCT";

interface Props {
  orderId: string;
  lines: EditorLine[];
  cwt2307: boolean;
  blanketPct: number;
  initialMode: Mode;
  canEditDiscount: boolean;
}

export function OrderLinesEditor({ orderId, lines, cwt2307, blanketPct, initialMode, canEditDiscount }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  // Per-line chosen pct for PRODUCT mode (seeded from saved discountPct).
  const [perLine, setPerLine] = useState<Record<string, string>>(
    () => Object.fromEntries(lines.filter(l => l.discountPct).map(l => [l.id, String(l.discountPct)]))
  );

  function effectivePct(l: EditorLine): number {
    if (l.isFree) return 0;
    if (mode === "NONE") return 0;
    if (mode === "CUSTOMER") return blanketPct;
    return Number(perLine[l.id] ?? 0);
  }

  const { grossSubtotal, net, discountAmt } = useMemo(() => {
    const gross = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const n = lines.reduce((s, l) => s + Math.round(l.qty * l.unitPrice * (1 - effectivePct(l) / 100) * 100) / 100, 0);
    return { grossSubtotal: gross, net: n, discountAmt: Math.round((gross - n) * 100) / 100 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, mode, perLine, blanketPct]);

  const { vat, cwt, total } = orderTotal(net, cwt2307);

  function apply() {
    const lineDiscounts = mode === "PRODUCT"
      ? lines
          .filter(l => !l.isFree && Number(perLine[l.id] ?? 0) >= 1)
          .map(l => ({ orderLineId: l.id, discountPct: Number(perLine[l.id]) }))
      : undefined;
    startTransition(async () => {
      try {
        await applyOrderDiscount(orderId, { mode, lineDiscounts });
        toast("Discount updated", "success");
        router.refresh();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  const showDiscountCol = canEditDiscount && mode === "PRODUCT";
  const hasDiscount = discountAmt > 0;

  return (
    <div className="card">
      <div className="card-head" style={{ alignItems: "center" }}>
        <span className="card-h flex-1">Order Lines</span>
        {canEditDiscount && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "oklch(var(--ink-3))" }}>Discount</span>
            <select
              className="field-input"
              style={{ height: 30, minWidth: 190 }}
              value={mode}
              onChange={e => setMode(e.target.value as Mode)}
              disabled={isPending}
            >
              <option value="NONE">None</option>
              <option value="CUSTOMER" disabled={blanketPct <= 0}>
                Customer Blanket{blanketPct > 0 ? ` (${blanketPct}%)` : " (none set)"}
              </option>
              <option value="PRODUCT">Per-Product</option>
            </select>
            <button className="btn btn-sm btn-accent" onClick={apply} disabled={isPending}>
              {isPending ? "…" : "Apply"}
            </button>
          </div>
        )}
      </div>
      <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Product</th>
              <th className="id">SKU</th>
              <th className="num">Qty</th>
              <th className="num">Unit Price</th>
              <th className="num">Line Total</th>
              {showDiscountCol && <th className="num" style={{ width: 110 }}>Discount %</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const pct = effectivePct(line);
              const discounted = Math.round(line.qty * line.unitPrice * (1 - pct / 100) * 100) / 100;
              return (
                <tr key={line.id} style={{ cursor: "default" }}>
                  <td>
                    {line.name}{line.isFree && <span className="pill pill-DELIVERED" style={{ marginLeft: 6 }}>FREE</span>}
                    {line.lots.length > 0 && (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ fontSize: 11, color: "oklch(var(--ink-3))", cursor: "pointer" }}>{line.lots.length} lot{line.lots.length > 1 ? "s" : ""} consumed</summary>
                        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                          {line.lots.map(l => (
                            <div key={l.id} style={{ fontSize: 11.5, display: "flex", gap: 10, padding: "3px 8px", borderRadius: 5, background: "oklch(var(--bg-2))" }}>
                              <span style={{ fontWeight: 600, fontFamily: "monospace" }}>{l.lotNumber}</span>
                              <span>{l.qtyTaken.toLocaleString()} units</span>
                              {l.expiryDate && <span style={{ color: "oklch(var(--ink-3))" }}>Exp {new Date(l.expiryDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</span>}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </td>
                  <td className="id">{line.sku}</td>
                  <td className="num">{line.qty.toLocaleString()}</td>
                  <td className="num">{line.isFree ? "—" : peso(line.unitPrice)}</td>
                  <td className="num">
                    {line.isFree ? "FREE" : (
                      pct > 0 ? (
                        <span>
                          <span style={{ textDecoration: "line-through", color: "oklch(var(--ink-4))", marginRight: 6 }}>{peso(line.qty * line.unitPrice)}</span>
                          {peso(discounted)}
                        </span>
                      ) : peso(line.qty * line.unitPrice)
                    )}
                  </td>
                  {showDiscountCol && (
                    <td className="num">
                      {line.isFree ? "—" : (
                        <select
                          className="field-input text-right"
                          style={{ width: 90 }}
                          value={perLine[line.id] ?? ""}
                          onChange={e => setPerLine(p => ({ ...p, [line.id]: e.target.value }))}
                          disabled={isPending}
                        >
                          <option value="">—</option>
                          <option value="1">1%</option>
                          <option value="2">2%</option>
                          <option value="3">3%</option>
                        </select>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card-body border-t" style={{ borderColor: "oklch(var(--line))" }}>
        <div className="ledger">
          <div className="ledger-row"><span>Subtotal</span><span></span><span>{peso(grossSubtotal)}</span></div>
          {hasDiscount && (
            <div className="ledger-row"><span className="ledger-row-cr">Discount{mode === "CUSTOMER" ? ` (${blanketPct}%)` : ""}</span><span></span><span>({peso(discountAmt)})</span></div>
          )}
          <div className="ledger-row"><span className="ledger-row-cr">VAT (12%)</span><span></span><span>{peso(vat)}</span></div>
          {cwt2307 && <div className="ledger-row"><span className="ledger-row-cr">CWT 2307 (−2%)</span><span></span><span>({peso(cwt)})</span></div>}
          <div className="ledger-row ledger-row-total"><span>Total</span><span></span><span>{peso(total)}</span></div>
        </div>
      </div>
    </div>
  );
}
