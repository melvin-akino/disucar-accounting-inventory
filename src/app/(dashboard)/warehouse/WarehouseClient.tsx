"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startPreparing, markShipped, confirmDelivery } from "./actions";
import { useToast } from "@/components/ui/Toast";
import { peso, fmtDate } from "@/lib/utils";
import type { OrderState } from "@prisma/client";

interface Order {
  id: string;
  createdAt: string;
  total: string;
  state: OrderState;
  customer: { name: string };
  warehouse: { name: string };
}

interface VehicleOption { id: string; plateNumber: string }

interface Props {
  orders: Order[];
  role: string;
  vehicles: VehicleOption[];
}

const COL_LABEL: Record<string, string> = {
  APPROVED:  "Approved",
  PREPARING: "Preparing",
  SHIPPED:   "Shipped",
};

const COL_DOT: Record<string, string> = {
  APPROVED:  "oklch(0.55 0.15 240)",
  PREPARING: "oklch(0.55 0.15 75)",
  SHIPPED:   "oklch(0.55 0.15 285)",
};

export function WarehouseClient({ orders, role, vehicles }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const [shipModal, setShipModal] = useState<string | null>(null);
  const [tracking, setTracking] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [eta, setEta] = useState("");

  const [deliverModal, setDeliverModal] = useState<string | null>(null);
  const [podSigned, setPodSigned] = useState("");

  function byState(s: string) {
    return orders.filter((o) => o.state === s);
  }

  function act(fn: () => Promise<void>, label: string) {
    startTransition(async () => {
      try {
        await fn();
        toast(label, "success");
        router.refresh();
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setBusy(null);
      }
    });
  }

  function handlePrepare(orderId: string) {
    setBusy(orderId);
    act(() => startPreparing(orderId), "Moved to Preparing");
  }

  function openShip(orderId: string) {
    setShipModal(orderId);
    setTracking(""); setVehicleId(""); setEta("");
  }

  function handleShip() {
    if (!shipModal) return;
    const id = shipModal;
    setShipModal(null);
    setBusy(id);
    act(() => markShipped(id, tracking, vehicleId, eta), `Order ${id} shipped`);
  }

  function openDeliver(orderId: string) {
    setDeliverModal(orderId);
    setPodSigned("");
  }

  function handleDeliver() {
    if (!deliverModal) return;
    const id = deliverModal;
    setDeliverModal(null);
    setBusy(id);
    act(() => confirmDelivery(id, podSigned), `Order ${id} delivered`);
  }

  const COLS = role === "FINANCE"
    ? ["SHIPPED"]
    : ["APPROVED", "PREPARING", "SHIPPED"];

  return (
    <>
      <div className="kanban" style={{ gridTemplateColumns: `repeat(${COLS.length}, 1fr)` }}>
        {COLS.map((col) => {
          const items = byState(col);
          return (
            <div key={col} className="kcol">
              <div className="kcol-h">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: COL_DOT[col], flexShrink: 0 }} />
                {COL_LABEL[col]}
                <span className="ml-auto badge">{items.length}</span>
              </div>

              {items.length === 0 && (
                <div className="text-[11.5px] text-center py-6" style={{ color: "oklch(var(--ink-4))" }}>Empty</div>
              )}

              {items.map((order) => {
                const isBusy = busy === order.id;
                return (
                  <div key={order.id} className="kcard flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-1">
                      <Link href={`/orders/${order.id}`} className="text-[12px] font-semibold hover:underline" style={{ color: "oklch(var(--ink))" }}>
                        {order.id}
                      </Link>
                      <span className="text-[11px] font-mono" style={{ color: "oklch(var(--ink-3))" }}>
                        {peso(order.total)}
                      </span>
                    </div>
                    <div className="text-[11.5px]" style={{ color: "oklch(var(--ink-2))" }}>{order.customer.name}</div>
                    <div className="text-[11px]" style={{ color: "oklch(var(--ink-4))" }}>{order.warehouse.name} · {fmtDate(new Date(order.createdAt))}</div>

                    <div className="mt-1">
                      {col === "APPROVED" && (
                        <button
                          onClick={() => handlePrepare(order.id)}
                          disabled={isBusy || isPending}
                          className="btn btn-sm w-full"
                          style={{ justifyContent: "center" }}
                        >
                          {isBusy ? "…" : "▶ Start Preparing"}
                        </button>
                      )}
                      {col === "PREPARING" && (
                        <button
                          onClick={() => openShip(order.id)}
                          disabled={isBusy || isPending}
                          className="btn btn-sm btn-accent w-full"
                          style={{ justifyContent: "center" }}
                        >
                          {isBusy ? "…" : "🚚 Mark Shipped"}
                        </button>
                      )}
                      {col === "SHIPPED" && ["WAREHOUSE", "ADMIN"].includes(role) && (
                        <button
                          onClick={() => openDeliver(order.id)}
                          disabled={isBusy || isPending}
                          className="btn btn-sm w-full"
                          style={{ justifyContent: "center", borderColor: "oklch(var(--st-deliv-fg))", color: "oklch(var(--st-deliv-fg))" }}
                        >
                          {isBusy ? "…" : "✓ Confirm Delivery"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Ship modal */}
      {shipModal && (
        <>
          <div className="scrim" onClick={() => setShipModal(null)} />
          <div className="modal">
            <div className="card-head">
              <span className="card-h">Mark Shipped — {shipModal}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShipModal(null)}>✕</button>
            </div>
            <div className="card-body flex flex-col gap-3">
              <div>
                <label className="field-label">Tracking Number</label>
                <input className="field-input" value={tracking} onChange={e => setTracking(e.target.value)} placeholder="e.g. 1Z999AA10123456784" />
              </div>
              <div>
                <label className="field-label">Vehicle / Plate No.</label>
                <select className="field-input" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                  <option value="">— None —</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">ETA</label>
                <input type="date" className="field-input" value={eta} onChange={e => setEta(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn" onClick={() => setShipModal(null)}>Cancel</button>
                <button className="btn btn-accent" onClick={handleShip}>Confirm Ship</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Deliver modal */}
      {deliverModal && (
        <>
          <div className="scrim" onClick={() => setDeliverModal(null)} />
          <div className="modal" style={{ width: "min(400px, 92vw)" }}>
            <div className="card-head">
              <span className="card-h">Confirm Delivery — {deliverModal}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeliverModal(null)}>✕</button>
            </div>
            <div className="card-body flex flex-col gap-3">
              <div>
                <label className="field-label">Proof of Delivery — Signed By</label>
                <input className="field-input" value={podSigned} onChange={e => setPodSigned(e.target.value)} placeholder="Recipient name" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn" onClick={() => setDeliverModal(null)}>Cancel</button>
                <button className="btn btn-accent" onClick={handleDeliver}>Confirm Delivery</button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
