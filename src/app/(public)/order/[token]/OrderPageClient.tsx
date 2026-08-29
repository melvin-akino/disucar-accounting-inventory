"use client";

import { useState, useTransition, useMemo } from "react";
import { submitPublicOrder } from "./actions";

interface CatalogItem {
  id: string; sku: string; name: string; brand: string | null;
  unit: string; unitsPerCase: number | null; unitPrice: string; imageUrl: string | null; category: string;
}
interface CartLine { skuId: string; qty: number }

interface Props {
  token: string;
  agentName: string;
  catalog: CatalogItem[];
  categoryLabels: Record<string, string>;
}

function peso(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function ProductCard({ item, qty, onChange }: { item: CatalogItem; qty: number; onChange: (qty: number) => void }) {
  return (
    <div style={{ border: "1px solid oklch(var(--line))", borderRadius: 10, overflow: "hidden", background: "oklch(var(--panel))" }}>
      <div style={{ aspectRatio: "4/3", background: "oklch(var(--bg-2))", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="oklch(var(--ink-4))" strokeWidth="1.5"><path d="M20 7H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
        )}
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{item.name}</div>
        {item.brand && <div style={{ fontSize: 11.5, color: "oklch(var(--ink-3))" }}>{item.brand}</div>}
        <div style={{ fontWeight: 700, fontSize: 14, marginTop: 6 }}>{peso(Number(item.unitPrice))} <span style={{ fontWeight: 400, fontSize: 11, color: "oklch(var(--ink-3))" }}>/ {item.unit}</span></div>
        {item.unitsPerCase && item.unitsPerCase > 1 && (
          <div style={{ fontSize: 11, color: "oklch(var(--ink-3))", marginTop: 2 }}>
            ≈ {peso(Number(item.unitPrice) / item.unitsPerCase)} per piece · {item.unitsPerCase} pcs/{item.unit}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          {qty === 0 ? (
            <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={() => onChange(1)}>Add to Cart</button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "space-between" }}>
              <button className="btn btn-sm" onClick={() => onChange(Math.max(0, qty - 1))}>−</button>
              <span style={{ fontWeight: 600 }}>{qty}</span>
              <button className="btn btn-sm" onClick={() => onChange(qty + 1)}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function OrderPageClient({ token, agentName, catalog, categoryLabels }: Props) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("ALL");
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);

  // Categories present, kept in the Pareto order they first appear (busiest categories'
  // tabs sit leftmost), "All" pinned first.
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const c of catalog) if (c.category && !seen.includes(c.category)) seen.push(c.category);
    return seen;
  }, [catalog]);

  const visibleCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((c) => {
      if (activeCat !== "ALL" && c.category !== activeCat) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.brand ?? "").toLowerCase().includes(q) || c.sku.toLowerCase().includes(q);
    });
  }, [catalog, search, activeCat]);

  const lines: CartLine[] = useMemo(
    () => Object.entries(cart).filter(([, qty]) => qty > 0).map(([skuId, qty]) => ({ skuId, qty })),
    [cart]
  );
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => {
    const item = catalog.find((c) => c.id === l.skuId);
    return s + (item ? Number(item.unitPrice) * l.qty : 0);
  }, 0);

  function setQty(skuId: string, qty: number) {
    setCart((c) => ({ ...c, [skuId]: qty }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    start(async () => {
      try {
        const id = await submitPublicOrder({ token, name, phone, email, address, honeypot, lines });
        setOrderId(id);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      }
    });
  }

  if (orderId) {
    return (
      <div style={{ maxWidth: 480, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="oklch(0.55 0.16 155)" strokeWidth="1.75" style={{ margin: "0 auto 16px" }}>
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Order received</h1>
        <p style={{ fontSize: 14, color: "oklch(var(--ink-3))", marginBottom: 4 }}>
          Your order <strong>{orderId}</strong> has been submitted.
        </p>
        <p style={{ fontSize: 13.5, color: "oklch(var(--ink-3))" }}>
          {agentName} will contact you shortly to confirm the details.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 100px" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 17, fontWeight: 600 }}>Order from {agentName}</h1>
        <p style={{ fontSize: 12.5, color: "oklch(var(--ink-3))" }}>Browse products and add what you'd like to order.</p>
      </div>

      {catalog.length > 0 && (
        <input
          type="search"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid oklch(var(--line))", background: "oklch(var(--panel))", fontSize: 14, marginBottom: 12 }}
        />
      )}

      {categories.length > 1 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
          {["ALL", ...categories].map((cat) => {
            const active = activeCat === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                style={{
                  flexShrink: 0, padding: "6px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                  whiteSpace: "nowrap", border: "1px solid oklch(var(--line))",
                  background: active ? "oklch(var(--accent))" : "oklch(var(--panel))",
                  color: active ? "white" : "oklch(var(--ink-2))",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {cat === "ALL" ? "All" : categoryLabels[cat] ?? cat}
              </button>
            );
          })}
        </div>
      )}

      {catalog.length === 0 ? (
        <p className="empty-state" style={{ padding: "40px 0" }}>No products are available right now.</p>
      ) : visibleCatalog.length === 0 ? (
        <p className="empty-state" style={{ padding: "40px 0" }}>
          {search.trim() ? <>No products match &ldquo;{search}&rdquo;{activeCat !== "ALL" ? ` in ${categoryLabels[activeCat] ?? activeCat}` : ""}.</> : "No products in this category."}
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {visibleCatalog.map((item) => (
            <ProductCard key={item.id} item={item} qty={cart[item.id] ?? 0} onChange={(qty) => setQty(item.id, qty)} />
          ))}
        </div>
      )}

      {itemCount > 0 && !checkoutOpen && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px",
          background: "oklch(var(--panel))", borderTop: "1px solid oklch(var(--line))",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ fontSize: 13 }}>
            <strong>{itemCount}</strong> item{itemCount === 1 ? "" : "s"} · {peso(subtotal)}
          </div>
          <button className="btn btn-primary" onClick={() => setCheckoutOpen(true)}>Checkout →</button>
        </div>
      )}

      {checkoutOpen && (
        <>
          <div className="scrim" onClick={() => setCheckoutOpen(false)} />
          <div className="modal" style={{ width: "min(440px, 92vw)" }}>
            <div className="card-head">
              <span className="card-h">Your Details</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setCheckoutOpen(false)}>✕</button>
            </div>
            <div className="card-body">
              {/* Cart summary */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  Your Cart ({itemCount} item{itemCount === 1 ? "" : "s"})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                  {lines.map((l) => {
                    const item = catalog.find((c) => c.id === l.skuId);
                    if (!item) return null;
                    return (
                      <div key={l.skuId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                          <div style={{ fontSize: 11.5, color: "oklch(var(--ink-3))" }}>{l.qty} × {peso(Number(item.unitPrice))}</div>
                        </div>
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{peso(Number(item.unitPrice) * l.qty)}</div>
                        <button
                          type="button"
                          onClick={() => setQty(l.skuId, 0)}
                          aria-label="Remove item"
                          style={{ border: "none", background: "none", color: "oklch(var(--ink-3))", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
                        >×</button>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid oklch(var(--line))", marginTop: 8, paddingTop: 8, fontWeight: 600 }}>
                  <span>Total</span>
                  <span>{peso(subtotal)}</span>
                </div>
              </div>

              <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label className="field-label">Full Name *</label>
                  <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div>
                  <label className="field-label">Phone Number *</label>
                  <input className="field-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
                <div>
                  <label className="field-label">Email (optional)</label>
                  <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Delivery Address *</label>
                  <textarea className="field-input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} required />
                </div>
                {/* Honeypot — hidden from real users, catches basic bots */}
                <div style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
                  <label>Leave this field empty</label>
                  <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
                </div>
                {err && <p style={{ color: "oklch(var(--err))", fontSize: 12.5 }}>{err}</p>}
                {itemCount === 0 && <p style={{ color: "oklch(var(--ink-3))", fontSize: 12.5 }}>Your cart is empty — add a product to order.</p>}
                <button type="submit" className="btn btn-primary" disabled={pending || itemCount === 0}>{pending ? "Submitting…" : "Submit Order"}</button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
