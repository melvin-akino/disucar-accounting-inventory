"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { HelpButton } from "@/components/HelpButton";
import { peso, fmtDate } from "@/lib/utils";
import { recordCollection, recordRemittance, fetchAgentCollectibles } from "./actions";
import { markInvoicesPaid } from "../ledger/actions";
import { useToast } from "@/components/ui/Toast";

interface CollectionRow {
  id: string;
  employeeId: string;
  employeeName: string;
  invoiceId: string;
  customerName: string;
  amountCollected: string;
  amountRemitted: string;
  status: "PENDING" | "REMITTED" | "SHORT";
  collectedAt: string;
  remittedAt: string | null;
  notes: string | null;
  shortageNote: string | null;
}
interface InvoiceOption { id: string; customerName: string; balance: string }
interface EmployeeOption { id: string; name: string }
interface UnbalancedRow { employeeId: string; employeeName: string; totalUnremitted: number; count: number; oldestCollectedAt: string }
interface AgentOption { id: string; name: string }

interface Props {
  collections: CollectionRow[];
  employees: EmployeeOption[];
  invoices: InvoiceOption[];
  unbalanced: UnbalancedRow[];
  isFinance: boolean;
  isAdmin: boolean;
  agentsWithCustomers: AgentOption[];
  currentUserId: string;
}

const STATUS_PILL: Record<string, string> = { PENDING: "pill-PENDING", REMITTED: "pill-DELIVERED", SHORT: "pill-CANCELLED" };

interface CollectibleRow { invoiceId: string; customerName: string; city: string | null; due: string; amount: number; balance: number; status: string }

// Finance/Admin: pick an agent → list their outstanding invoices. Admin can select and
// mark them paid in bulk (reconciling a returned collectible sheet), and print the sheet.
function AgentCollectiblesPanel({ agents, isAdmin, selected, setSelected }: {
  agents: AgentOption[]; isAdmin: boolean; selected: string; setSelected: (v: string) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState<CollectibleRow[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  function pick(agentId: string) {
    setSelected(agentId);
    setChecked([]);
    setRows([]);
    if (!agentId) return;
    startLoad(async () => {
      try {
        setRows(await fetchAgentCollectibles(agentId));
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  function toggle(id: string) {
    setChecked(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  }

  function markPaid() {
    if (checked.length === 0) { toast("Select at least one invoice", "error"); return; }
    startSave(async () => {
      const res = await markInvoicesPaid(checked);
      if (res.error) { toast(res.error, "error"); return; }
      toast(`${res.count} invoice(s) marked paid`, "success");
      setChecked([]);
      if (selected) setRows(await fetchAgentCollectibles(selected));
      router.refresh();
    });
  }

  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head" style={{ alignItems: "center" }}>
        <span className="card-h flex-1">Agent Collectibles</span>
        {selected && (
          <a href={`/print/collectible/${selected}`} target="_blank" rel="noreferrer" className="btn btn-sm">Print Sheet</a>
        )}
        {isAdmin && checked.length > 0 && (
          <button className="btn btn-sm btn-accent" style={{ marginLeft: 8 }} disabled={saving} onClick={markPaid}>
            {saving ? "…" : `Mark ${checked.length} Paid`}
          </button>
        )}
      </div>
      <div className="card-body">
        <div style={{ minWidth: 240, maxWidth: 320, marginBottom: 12 }}>
          <label className="field-label">Sales Agent</label>
          <select className="field-input" value={selected} onChange={e => pick(e.target.value)}>
            <option value="">— Select agent —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {loading ? (
          <div className="dim" style={{ fontSize: 13 }}>Loading…</div>
        ) : selected && rows.length === 0 ? (
          <div className="empty-state" style={{ padding: "16px 0" }}>No outstanding invoices for this agent&apos;s customers.</div>
        ) : rows.length > 0 ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {isAdmin && <th></th>}
                  <th>Invoice</th><th>Customer</th><th>City</th><th>Due</th>
                  <th className="num">Amount</th><th className="num">Balance</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.invoiceId}>
                    {isAdmin && <td><input type="checkbox" checked={checked.includes(r.invoiceId)} onChange={() => toggle(r.invoiceId)} /></td>}
                    <td className="id">{r.invoiceId}</td>
                    <td>{r.customerName}</td>
                    <td className="dim">{r.city ?? "—"}</td>
                    <td className="dim">{fmtDate(new Date(r.due))}</td>
                    <td className="num">{peso(r.amount)}</td>
                    <td className="num">{peso(r.balance)}</td>
                    <td><span className={`pill pill-${r.status}`}>{r.status}</span></td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} style={{ fontWeight: 700 }}>Total outstanding</td>
                  <td className="num" style={{ fontWeight: 700 }}>{peso(totalBalance)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Log Collection modal ─────────────────────────────────────────────────────
function LogCollectionModal({ employees, invoices, isFinance, currentUserId, onClose }: {
  employees: EmployeeOption[]; invoices: InvoiceOption[]; isFinance: boolean; currentUserId: string; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [employeeId, setEmployeeId] = useState(isFinance ? "" : currentUserId);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");

  const selectedInvoice = invoices.find(i => i.id === invoiceId);

  function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    start(async () => {
      try {
        await recordCollection({ employeeId, invoiceId, amountCollected: amount, notes: notes || undefined });
        router.refresh(); onClose();
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <Modal open onClose={onClose} title="Log a Collection">
      <div className="card-body">
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {isFinance && (
            <div>
              <label className="field-label">Employee *</label>
              <select className="field-input" value={employeeId} onChange={e => setEmployeeId(e.target.value)} required>
                <option value="">— Select employee —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="field-label">Invoice *</label>
            <select className="field-input" value={invoiceId} onChange={e => setInvoiceId(e.target.value)} required>
              <option value="">— Select invoice —</option>
              {invoices.map(i => <option key={i.id} value={i.id}>{i.id} — {i.customerName} (balance {peso(i.balance)})</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Amount Collected *</label>
            <input type="number" className="field-input" min="0.01" step="0.01" max={selectedInvoice ? Number(selectedInvoice.balance) : undefined}
              value={amount || ""} onChange={e => setAmount(parseFloat(e.target.value) || 0)} required />
          </div>
          <div>
            <label className="field-label">Notes</label>
            <input type="text" className="field-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Cash collected on delivery" />
          </div>
          {err && <p style={{ color: "oklch(var(--err))", fontSize: 12.5 }}>{err}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Log Collection"}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

// ── Record Remittance modal ──────────────────────────────────────────────────
function RemitModal({ employee, collections, onClose }: {
  employee: UnbalancedRow; collections: CollectionRow[]; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(employee.totalUnremitted);
  const [shortageNote, setShortageNote] = useState("");
  const [err, setErr] = useState("");

  const outstanding = collections.filter(c => c.employeeId === employee.employeeId && c.status !== "REMITTED");
  const collectionIds = outstanding.map(c => c.id);
  const isShort = amount < employee.totalUnremitted - 0.01;

  function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (isShort && !shortageNote.trim()) { setErr("A shortage note is required when the amount remitted is less than expected."); return; }
    start(async () => {
      try {
        await recordRemittance({ collectionIds, amountRemitted: amount, shortageNote: isShort ? shortageNote : undefined });
        router.refresh(); onClose();
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <Modal open onClose={onClose} title={`Record Remittance — ${employee.employeeName}`}>
      <div className="card-body">
        <p style={{ fontSize: 12.5, color: "oklch(var(--ink-3))", marginBottom: 12 }}>
          {employee.count} unremitted collection{employee.count === 1 ? "" : "s"}, expected {peso(employee.totalUnremitted)}.
        </p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="field-label">Amount Received *</label>
            <input type="number" className="field-input" min="0.01" step="0.01" value={amount || ""} onChange={e => setAmount(parseFloat(e.target.value) || 0)} required />
          </div>
          {isShort && (
            <div>
              <label className="field-label">Shortage Note <span style={{ color: "oklch(var(--err))" }}>*</span></label>
              <textarea className="field-input" rows={2} value={shortageNote} onChange={e => setShortageNote(e.target.value)} placeholder="Explain the discrepancy…" />
            </div>
          )}
          {err && <p style={{ color: "oklch(var(--err))", fontSize: 12.5 }}>{err}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Record Remittance"}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function CollectionsClient({ collections, employees, invoices, unbalanced, isFinance, isAdmin, agentsWithCustomers, currentUserId }: Props) {
  const [logOpen, setLogOpen] = useState(false);
  const [remitTarget, setRemitTarget] = useState<UnbalancedRow | null>(null);
  const [worklistAgent, setWorklistAgent] = useState("");

  const myUnbalanced = unbalanced.find(u => u.employeeId === currentUserId);

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2" style={{ flex: 1 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600 }}>Collections</h1>
          <HelpButton slug="collections" label="Help: Collections" />
        </div>
        <button className="btn btn-primary" onClick={() => setLogOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Log Collection
        </button>
      </div>

      {isFinance && (
        <AgentCollectiblesPanel agents={agentsWithCustomers} isAdmin={isAdmin} selected={worklistAgent} setSelected={setWorklistAgent} />
      )}

      {!isFinance && myUnbalanced && (
        <div style={{ padding: "10px 14px", borderRadius: 7, border: "1px solid #fecaca", background: "#fef2f2", marginBottom: 16, fontSize: 13, color: "#991b1b" }}>
          ⚠ You have {peso(myUnbalanced.totalUnremitted)} across {myUnbalanced.count} unremitted collection{myUnbalanced.count === 1 ? "" : "s"}. Please remit to Finance.
        </div>
      )}

      {isFinance && unbalanced.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Unbalanced Employees
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unbalanced.map(u => (
              <div key={u.employeeId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 7, border: "1px solid #fecaca", background: "#fef2f2" }}>
                <div style={{ fontSize: 13, color: "#991b1b" }}>
                  <strong>{u.employeeName}</strong> — {peso(u.totalUnremitted)} across {u.count} receipt{u.count === 1 ? "" : "s"}, oldest {fmtDate(new Date(u.oldestCollectedAt))}
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => setRemitTarget(u)}>Record Remittance</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {isFinance && <th>Employee</th>}
              <th>Invoice</th>
              <th>Customer</th>
              <th className="num">Collected</th>
              <th className="num">Remitted</th>
              <th>Status</th>
              <th>Collected At</th>
            </tr>
          </thead>
          <tbody>
            {collections.length === 0 && (
              <tr><td colSpan={isFinance ? 7 : 6} className="empty-state" style={{ padding: "32px 0" }}>No collections logged yet</td></tr>
            )}
            {collections.map(c => (
              <tr key={c.id}>
                {isFinance && <td style={{ fontWeight: 500 }}>{c.employeeName}</td>}
                <td className="id">{c.invoiceId}</td>
                <td className="dim">{c.customerName}</td>
                <td className="num">{peso(c.amountCollected)}</td>
                <td className="num">{peso(c.amountRemitted)}</td>
                <td><span className={`pill ${STATUS_PILL[c.status]}`}>{c.status}</span></td>
                <td className="dim" style={{ fontSize: 12 }}>{fmtDate(new Date(c.collectedAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logOpen && <LogCollectionModal employees={employees} invoices={invoices} isFinance={isFinance} currentUserId={currentUserId} onClose={() => setLogOpen(false)} />}
      {remitTarget && <RemitModal employee={remitTarget} collections={collections} onClose={() => setRemitTarget(null)} />}
    </div>
  );
}
