"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateShipmentInfo, confirmDeliveryFromShipments } from "./actions";
import { useToast } from "@/components/ui/Toast";
import { fmtDate } from "@/lib/utils";

interface Shipment {
  id: string;
  orderId: string;
  trackingNumber: string | null;
  shippedAt: string | null;
  eta: string | null;
  podSignedBy: string | null;
  orderState: string;
  customerName: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  vehicleLastPingAt: string | null;
}
interface VehicleOption { id: string; plateNumber: string }

interface Props {
  shipments: Shipment[];
  vehicles: VehicleOption[];
  role: string;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export function ShipmentsClient({ shipments, vehicles, role }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [editTarget, setEditTarget] = useState<Shipment | null>(null);
  const [tracking, setTracking] = useState("");
  const [eta, setEta] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const [deliverTarget, setDeliverTarget] = useState<Shipment | null>(null);
  const [podSigned, setPodSigned] = useState("");

  const canEdit = ["WAREHOUSE", "ADMIN"].includes(role);
  const canDeliver = ["WAREHOUSE", "ADMIN"].includes(role);

  function openEdit(s: Shipment) {
    setEditTarget(s);
    setTracking(s.trackingNumber ?? "");
    setEta(s.eta ? s.eta.slice(0, 10) : "");
    setVehicleId(s.vehicleId ?? "");
  }

  function handleEdit() {
    if (!editTarget) return;
    startTransition(async () => {
      try {
        await updateShipmentInfo(editTarget.id, { trackingNumber: tracking, eta, vehicleId });
        toast("Shipment updated", "success");
        setEditTarget(null);
        router.refresh();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  function openDeliver(s: Shipment) {
    setDeliverTarget(s);
    setPodSigned("");
  }

  function handleDeliver() {
    if (!deliverTarget) return;
    startTransition(async () => {
      try {
        await confirmDeliveryFromShipments(deliverTarget.orderId, podSigned);
        toast(`Order ${deliverTarget.orderId} delivered`, "success");
        setDeliverTarget(null);
        router.refresh();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="id">Tracking #</th>
              <th className="id">Order</th>
              <th>Customer</th>
              <th>Vehicle</th>
              <th>Shipped</th>
              <th>ETA</th>
              <th>Status</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {shipments.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
                      </svg>
                    </div>
                    No shipments yet
                  </div>
                </td>
              </tr>
            )}
            {shipments.map((s) => (
              <tr key={s.id} style={{ cursor: "default" }}>
                <td className="id">{s.trackingNumber ?? "—"}</td>
                <td className="id">
                  <Link href={`/orders/${s.orderId}`} className="hover:underline">{s.orderId}</Link>
                </td>
                <td>{s.customerName}</td>
                <td className="dim" style={{ fontSize: 12 }}>
                  {s.vehiclePlate ? (
                    <Link href="/fleet" className="hover:underline">{s.vehiclePlate} <span style={{ color: "oklch(var(--ink-4))" }}>({fmtAgo(s.vehicleLastPingAt)})</span></Link>
                  ) : "—"}
                </td>
                <td className="dim">{s.shippedAt ? fmtDate(new Date(s.shippedAt)) : "—"}</td>
                <td className="dim">{s.eta ? fmtDate(new Date(s.eta)) : "—"}</td>
                <td>
                  {s.orderState === "DELIVERED" ? (
                    <span className="pill pill-DELIVERED">Delivered</span>
                  ) : (
                    <span className="pill pill-SHIPPED">In Transit</span>
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-1.5 justify-end">
                    <a href={`/print/delivery/${s.id}`} target="_blank" className="btn btn-ghost btn-sm" title="Print Delivery Receipt">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    </a>
                    {canEdit && s.orderState === "SHIPPED" && (
                      <button onClick={() => openEdit(s)} className="btn btn-sm btn-ghost" disabled={isPending}>
                        Edit
                      </button>
                    )}
                    {canDeliver && s.orderState === "SHIPPED" && (
                      <button onClick={() => openDeliver(s)} className="btn btn-sm" disabled={isPending}>
                        Deliver
                      </button>
                    )}
                    {s.orderState === "DELIVERED" && s.podSignedBy && (
                      <span className="text-[11px]" style={{ color: "oklch(var(--ink-3))" }}>
                        ✓ {s.podSignedBy}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editTarget && (
        <>
          <div className="scrim" onClick={() => setEditTarget(null)} />
          <div className="modal" style={{ width: "min(440px, 92vw)" }}>
            <div className="card-head">
              <span className="card-h">Edit Shipment</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(null)}>✕</button>
            </div>
            <div className="card-body flex flex-col gap-3">
              <div>
                <label className="field-label">Tracking Number</label>
                <input className="field-input" value={tracking} onChange={e => setTracking(e.target.value)} placeholder="Tracking number" />
              </div>
              <div>
                <label className="field-label">ETA</label>
                <input type="date" className="field-input" value={eta} onChange={e => setEta(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Vehicle</label>
                <select className="field-input" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                  <option value="">— None —</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn" onClick={() => setEditTarget(null)}>Cancel</button>
                <button className="btn btn-accent" onClick={handleEdit} disabled={isPending}>
                  {isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delivery confirmation modal */}
      {deliverTarget && (
        <>
          <div className="scrim" onClick={() => setDeliverTarget(null)} />
          <div className="modal" style={{ width: "min(400px, 92vw)" }}>
            <div className="card-head">
              <span className="card-h">Confirm Delivery</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeliverTarget(null)}>✕</button>
            </div>
            <div className="card-body flex flex-col gap-3">
              <p className="text-[13px]" style={{ color: "oklch(var(--ink-2))" }}>
                Order <strong>{deliverTarget.orderId}</strong> for{" "}
                <strong>{deliverTarget.customerName}</strong>
              </p>
              <div>
                <label className="field-label">Received By (POD Signature)</label>
                <input className="field-input" value={podSigned} onChange={e => setPodSigned(e.target.value)} placeholder="Recipient name" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn" onClick={() => setDeliverTarget(null)}>Cancel</button>
                <button className="btn btn-accent" onClick={handleDeliver} disabled={isPending}>
                  {isPending ? "Confirming…" : "Confirm Delivery"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
