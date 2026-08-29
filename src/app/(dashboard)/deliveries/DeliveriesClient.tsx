"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createDeliveryRun, recordStopOutcome, setDeliveryRunCheckedBy } from "./actions";
import { useToast } from "@/components/ui/Toast";
import { peso, fmtDate } from "@/lib/utils";

interface EligibleOrder { id: string; customerName: string; city: string | null; total: string }
interface Stop {
  id: string; orderId: string; customerName: string; city: string | null;
  invoiceId: string | null; invoiceAmount: string;
  remark: "DELIVERED" | "STORE_CLOSED" | "CANCELLED" | null;
  amountCollected: string | null; note: string | null;
}
interface Run {
  id: string; runNumber: string; runDate: string;
  driverName: string | null; plateNumber: string | null; helpers: string | null;
  checkedByName: string | null;
  stops: Stop[];
}

interface Props {
  drivers: { id: string; name: string }[];
  vehicles: { id: string; plateNumber: string; model: string | null }[];
  eligibleOrders: EligibleOrder[];
  runs: Run[];
  currentRole: string;
}

const REMARK_LABEL: Record<string, string> = {
  DELIVERED: "Delivered",
  STORE_CLOSED: "Store Closed",
  CANCELLED: "Cancelled",
};

function StopRow({ runId, stop }: { runId: string; stop: Stop }) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [remark, setRemark] = useState(stop.remark ?? "");
  const [collected, setCollected] = useState(stop.amountCollected ?? "");
  const [note, setNote] = useState(stop.note ?? "");

  const alreadyRecorded = !!stop.remark;

  function save() {
    if (!remark) { toast("Select a remark first", "error"); return; }
    startTransition(async () => {
      try {
        await recordStopOutcome(stop.id, {
          remark: remark as "DELIVERED" | "STORE_CLOSED" | "CANCELLED",
          amountCollected: collected ? Number(collected) : undefined,
          note: note || undefined,
        });
        toast(`${stop.orderId} updated`, "success");
        router.refresh();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  return (
    <tr>
      <td className="id">
        <Link href={`/orders/${stop.orderId}`} className="hover:underline">{stop.orderId}</Link>
      </td>
      <td>{stop.customerName}<div className="dim" style={{ fontSize: 11 }}>{stop.city ?? "—"}</div></td>
      <td className="num">{peso(stop.invoiceAmount)}</td>
      <td>
        <select className="field-input" style={{ minWidth: 130 }} value={remark} onChange={e => setRemark(e.target.value)} disabled={alreadyRecorded}>
          <option value="">— Select —</option>
          <option value="DELIVERED">Delivered</option>
          <option value="STORE_CLOSED">Store Closed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </td>
      <td className="num">
        <input type="number" min={0} step={0.01} className="field-input text-right" style={{ width: 100 }}
          value={collected} onChange={e => setCollected(e.target.value)} disabled={alreadyRecorded} placeholder="0.00" />
      </td>
      <td>
        <input className="field-input" value={note} onChange={e => setNote(e.target.value)} disabled={alreadyRecorded} placeholder="Notes" />
      </td>
      <td>
        {alreadyRecorded ? (
          <span className="pill pill-DELIVERED">{REMARK_LABEL[stop.remark!]}</span>
        ) : (
          <button className="btn btn-sm btn-accent" disabled={isPending} onClick={save}>
            {isPending ? "…" : "Save"}
          </button>
        )}
      </td>
    </tr>
  );
}

function CreateRunForm({ drivers, vehicles, eligibleOrders }: { drivers: Props["drivers"]; vehicles: Props["vehicles"]; eligibleOrders: EligibleOrder[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [helpers, setHelpers] = useState("");
  const [runDate, setRunDate] = useState(new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  function submit() {
    if (selected.length === 0) { toast("Select at least one order for this run", "error"); return; }
    startTransition(async () => {
      try {
        await createDeliveryRun({ driverId: driverId || undefined, vehicleId: vehicleId || undefined, helpers: helpers || undefined, runDate, orderIds: selected });
        toast("Delivery run created", "success");
        setSelected([]);
        router.refresh();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head"><span className="card-h">New Delivery Run</span></div>
      <div className="card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        <div>
          <label className="field-label">Driver</label>
          <select className="field-input" value={driverId} onChange={e => setDriverId(e.target.value)}>
            <option value="">— None —</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Vehicle</label>
          <select className="field-input" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
            <option value="">— None —</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plateNumber}{v.model ? ` — ${v.model}` : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Helpers</label>
          <input className="field-input" value={helpers} onChange={e => setHelpers(e.target.value)} placeholder="e.g. Louige, Paolo" />
        </div>
        <div>
          <label className="field-label">Run Date</label>
          <input type="date" className="field-input" value={runDate} onChange={e => setRunDate(e.target.value)} />
        </div>
      </div>
      <div className="card-body border-t" style={{ borderColor: "oklch(var(--line))" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", marginBottom: 8 }}>
          Select shipped orders for this truck ({selected.length} selected)
        </div>
        {eligibleOrders.length === 0 ? (
          <div className="empty-state" style={{ padding: "16px 0" }}>No orders currently in SHIPPED state.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th></th><th>Order</th><th>Customer</th><th>City</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {eligibleOrders.map(o => (
                  <tr key={o.id} onClick={() => toggle(o.id)} style={{ cursor: "pointer" }}>
                    <td><input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} /></td>
                    <td className="id">{o.id}</td>
                    <td>{o.customerName}</td>
                    <td className="dim">{o.city ?? "—"}</td>
                    <td className="num">{peso(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end" style={{ marginTop: 12 }}>
          <button className="btn btn-accent" disabled={isPending} onClick={submit}>
            {isPending ? "Creating…" : "Create Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeliveriesClient({ drivers, vehicles, eligibleOrders, runs, currentRole }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();

  function markChecked(runId: string) {
    startTransition(async () => {
      try {
        await setDeliveryRunCheckedBy(runId);
        toast("Marked as checked", "success");
        router.refresh();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h1 style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>Delivery Runs</h1>
      </div>

      <CreateRunForm drivers={drivers} vehicles={vehicles} eligibleOrders={eligibleOrders} />

      {runs.map(run => (
        <div key={run.id} className="card" style={{ marginBottom: 16 }}>
          <div className="card-head" style={{ alignItems: "center" }}>
            <div className="flex-1">
              <span className="card-h">Run {run.runNumber}</span>
              <span className="dim" style={{ marginLeft: 8, fontSize: 12 }}>
                {fmtDate(new Date(run.runDate))} · {run.driverName ?? "No driver"} · {run.plateNumber ?? "No plate"}
                {run.helpers ? ` · Helpers: ${run.helpers}` : ""}
              </span>
            </div>
            <a href={`/print/delivery-run/${run.id}`} target="_blank" className="btn btn-sm" rel="noreferrer">Print Manifest</a>
            {!run.checkedByName ? (
              <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => markChecked(run.id)}>Mark Checked</button>
            ) : (
              <span className="dim" style={{ marginLeft: 8, fontSize: 12 }}>Checked by {run.checkedByName}</span>
            )}
          </div>
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th><th>Account</th><th className="num">Invoice Amount</th>
                  <th>Remark</th><th className="num">Amount Collected</th><th>Note</th><th></th>
                </tr>
              </thead>
              <tbody>
                {run.stops.map(stop => <StopRow key={stop.id} runId={run.id} stop={stop} />)}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {runs.length === 0 && (
        <div className="empty-state" style={{ padding: "32px 0" }}>No delivery runs yet.</div>
      )}
    </div>
  );
}
