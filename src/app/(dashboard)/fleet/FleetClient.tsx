"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { createVehicle, updateVehicle, getVehicleTrail } from "./actions";
import "leaflet/dist/leaflet.css";

const FleetMap = dynamic(() => import("./FleetMap"), { ssr: false });

interface VehicleRow {
  id: string;
  plateNumber: string;
  model: string | null;
  externalDeviceId: string;
  active: boolean;
  driverId: string | null;
  driverName: string | null;
  lastLat: number | null;
  lastLng: number | null;
  lastSpeedKph: number | null;
  lastPingAt: string | null;
  latestShipmentOrderId: string | null;
}
interface DriverOption { id: string; name: string }

interface Props {
  vehicles: VehicleRow[];
  drivers: DriverOption[];
  canManage: boolean;
}

const STALE_MINUTES = 15;
function isOnline(lastPingAt: string | null): boolean {
  if (!lastPingAt) return false;
  return Date.now() - new Date(lastPingAt).getTime() <= STALE_MINUTES * 60 * 1000;
}
function fmtAgo(iso: string | null): string {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function VehicleModal({ vehicle, drivers, onClose }: { vehicle: VehicleRow | null; drivers: DriverOption[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [plateNumber, setPlateNumber] = useState(vehicle?.plateNumber ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [externalDeviceId, setExternalDeviceId] = useState(vehicle?.externalDeviceId ?? "");
  const [driverId, setDriverId] = useState(vehicle?.driverId ?? "");
  const [active, setActive] = useState(vehicle?.active ?? true);
  const [err, setErr] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const payload = { plateNumber, model: model || undefined, externalDeviceId, driverId: driverId || null, active };
    start(async () => {
      try {
        if (vehicle) await updateVehicle(vehicle.id, payload);
        else await createVehicle(payload);
        router.refresh(); onClose();
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <Modal open onClose={onClose} title={vehicle ? `Edit — ${vehicle.plateNumber}` : "Add Vehicle"}>
      <div className="card-body">
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="field-label">Plate Number *</label>
            <input className="field-input" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">Model</label>
            <input className="field-input" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. Isuzu Elf" />
          </div>
          <div>
            <label className="field-label">GPS Device ID *</label>
            <input className="field-input" value={externalDeviceId} onChange={e => setExternalDeviceId(e.target.value)} required />
            <p style={{ fontSize: 11, color: "oklch(var(--ink-3))", marginTop: 3 }}>
              The device/vehicle ID used by your GPS tracking provider — must match exactly what it sends.
            </p>
          </div>
          <div>
            <label className="field-label">Driver</label>
            <select className="field-input" value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" id="veh-active" checked={active} onChange={e => setActive(e.target.checked)} style={{ width: 15, height: 15, accentColor: "oklch(var(--accent))" }} />
            <label htmlFor="veh-active" style={{ fontSize: 13 }}>Active</label>
          </div>
          {err && <p style={{ color: "oklch(var(--err))", fontSize: 12.5 }}>{err}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : vehicle ? "Save Changes" : "Add Vehicle"}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export function FleetClient({ vehicles, drivers, canManage }: Props) {
  const [modalVehicle, setModalVehicle] = useState<VehicleRow | null | "new">(null);
  const [trailVehicleId, setTrailVehicleId] = useState("");
  const [trailFrom, setTrailFrom] = useState(new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 16));
  const [trailTo, setTrailTo] = useState(new Date().toISOString().slice(0, 16));
  const [trail, setTrail] = useState<{ lat: number; lng: number }[] | null>(null);
  const [trailPending, startTrail] = useTransition();

  function loadTrail() {
    if (!trailVehicleId) return;
    startTrail(async () => {
      const points = await getVehicleTrail(trailVehicleId, new Date(trailFrom).toISOString(), new Date(trailTo).toISOString());
      setTrail(points);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h1 style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>Fleet</h1>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setModalVehicle("new")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Add Vehicle
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: 12 }}>
          <FleetMap vehicles={vehicles} trail={trail ?? undefined} />
        </div>
      </div>

      {/* Trail lookup */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><span className="card-h">View Trail</span></div>
        <div className="card-body" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label className="field-label">Vehicle</label>
            <select className="field-input" value={trailVehicleId} onChange={e => setTrailVehicleId(e.target.value)}>
              <option value="">— Select —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">From</label>
            <input type="datetime-local" className="field-input" value={trailFrom} onChange={e => setTrailFrom(e.target.value)} />
          </div>
          <div>
            <label className="field-label">To</label>
            <input type="datetime-local" className="field-input" value={trailTo} onChange={e => setTrailTo(e.target.value)} />
          </div>
          <button className="btn btn-sm" disabled={!trailVehicleId || trailPending} onClick={loadTrail}>
            {trailPending ? "Loading…" : "Show Trail"}
          </button>
          {trail && <button className="btn btn-ghost btn-sm" onClick={() => setTrail(null)}>Clear</button>}
        </div>
        {trail && trail.length === 0 && (
          <div className="card-body" style={{ paddingTop: 0, fontSize: 12.5, color: "oklch(var(--ink-3))" }}>No positions recorded in that range.</div>
        )}
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Plate</th>
              <th>Model</th>
              <th>Driver</th>
              <th>Status</th>
              <th>Speed</th>
              <th>Last Seen</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {vehicles.length === 0 && (
              <tr><td colSpan={canManage ? 7 : 6} className="empty-state" style={{ padding: "32px 0" }}>No vehicles registered yet</td></tr>
            )}
            {vehicles.map(v => {
              const online = isOnline(v.lastPingAt);
              return (
                <tr key={v.id} style={{ opacity: v.active ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 500 }}>{v.plateNumber}</td>
                  <td className="dim">{v.model ?? "—"}</td>
                  <td className="dim">{v.driverName ?? "Unassigned"}</td>
                  <td><span className={`pill ${online ? "pill-DELIVERED" : "pill-PENDING"}`}>{online ? "Online" : "Offline"}</span></td>
                  <td className="num dim">{v.lastSpeedKph != null ? `${Math.round(v.lastSpeedKph)} km/h` : "—"}</td>
                  <td className="dim" style={{ fontSize: 12 }}>{fmtAgo(v.lastPingAt)}</td>
                  {canManage && (
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setModalVehicle(v)}>Edit</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalVehicle && (
        <VehicleModal
          vehicle={modalVehicle === "new" ? null : modalVehicle}
          drivers={drivers}
          onClose={() => setModalVehicle(null)}
        />
      )}
    </div>
  );
}
