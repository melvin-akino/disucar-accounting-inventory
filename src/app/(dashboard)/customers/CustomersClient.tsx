"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { ImportModal } from "@/components/ui/ImportModal";
import { HelpButton } from "@/components/HelpButton";
import { peso } from "@/lib/utils";
import {
  createCustomer, updateCustomer, createQuota, updateQuota, deleteQuota,
} from "./actions";

const IMPORT_COLUMNS = [
  { key: "Code",         label: "Code",         required: false },
  { key: "Name",         label: "Name",         required: true  },
  { key: "Type",         label: "Type",         required: true  },
  { key: "TIN",          label: "TIN",          required: false },
  { key: "Region",       label: "Region",       required: false },
  { key: "City",         label: "City",         required: false },
  { key: "Terms",        label: "Terms",        required: false },
  { key: "Credit Limit", label: "Credit Limit", required: false },
  { key: "Email",        label: "Email",        required: false },
  { key: "Phone",        label: "Phone",        required: false },
];

const CUSTOMER_TYPES = ["SUPERMARKET", "GROCERY", "SARI_SARI_STORE", "WHOLESALER", "GOVERNMENT", "OTHER"] as const;

export interface QuotaRow {
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  targetAmount: string;
  active: boolean;
  notes: string | null;
}

export interface CustomerRow {
  id: string;
  code: string | null;
  name: string;
  type: string;
  tin: string | null;
  region: string | null;
  city: string | null;
  terms: string;
  creditLimit: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  assignedAgentId: string | null;
  blanketDiscountPct: string | null;
  unpaidCount: number;
  onHold: boolean;
  quotas: QuotaRow[];
}

export interface AgentOption { id: string; name: string }

// ── Quota Management Modal ────────────────────────────────────────────────────

const blankQuota = { label: "", periodStart: "", periodEnd: "", targetAmount: "", notes: "", active: true };

const QUOTA_IMPORT_COLUMNS = [
  { key: "Customer Code",  label: "Customer Code",  required: false },
  { key: "Customer Name",  label: "Customer Name",  required: false },
  { key: "Label",          label: "Label",          required: true  },
  { key: "Period Start",   label: "Period Start",   required: true  },
  { key: "Period End",     label: "Period End",     required: true  },
  { key: "Target Amount",  label: "Target Amount",  required: true  },
  { key: "Notes",          label: "Notes",          required: false },
  { key: "Active",         label: "Active",         required: false },
];

function QuotaModal({ customer, onClose }: { customer: CustomerRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(blankQuota);
  const [editId, setEditId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  const peso = (v: string) => Number(v).toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0 });
  const isActive = (q: QuotaRow) => {
    const now = new Date();
    return q.active && new Date(q.periodStart) <= now && new Date(q.periodEnd) >= now;
  };

  function openAdd() {
    setEditId(null);
    setForm(blankQuota);
    setErr("");
  }
  function openEdit(q: QuotaRow) {
    setEditId(q.id);
    setForm({
      label:        q.label,
      periodStart:  q.periodStart.slice(0, 10),
      periodEnd:    q.periodEnd.slice(0, 10),
      targetAmount: q.targetAmount,
      notes:        q.notes ?? "",
      active:       q.active,
    });
    setErr("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    startTransition(async () => {
      try {
        if (editId) {
          await updateQuota(editId, {
            label:        form.label,
            periodStart:  form.periodStart,
            periodEnd:    form.periodEnd,
            targetAmount: parseFloat(form.targetAmount),
            notes:        form.notes,
            active:       form.active,
          });
        } else {
          await createQuota({
            customerId:   customer.id,
            label:        form.label,
            periodStart:  form.periodStart,
            periodEnd:    form.periodEnd,
            targetAmount: parseFloat(form.targetAmount),
            notes:        form.notes,
            active:       form.active,
          });
        }
        router.refresh();
        setForm(blankQuota);
        setEditId(null);
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this quota period?")) return;
    startTransition(async () => {
      try {
        await deleteQuota(id);
        router.refresh();
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "oklch(var(--bg))", borderRadius: 10, width: "min(640px, 95vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid oklch(var(--line))", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Purchase Quotas</div>
            <div style={{ fontSize: 12, color: "oklch(var(--ink-3))", marginTop: 1 }}>{customer.name}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="btn btn-sm" onClick={() => setImportOpen(true)}>↑ Import CSV</button>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
          </div>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Existing quotas */}
          {customer.quotas.length > 0 ? (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Quota Periods</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {customer.quotas.map(q => {
                  const active = isActive(q);
                  return (
                    <div key={q.id} style={{
                      padding: "12px 14px", borderRadius: 8,
                      border: `1px solid ${active ? "#bfdbfe" : "oklch(var(--line))"}`,
                      background: active ? "#eff6ff" : "oklch(var(--bg-2))",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{q.label}</span>
                            {active && <span style={{ fontSize: 10, fontWeight: 700, color: "#2563eb", background: "#dbeafe", padding: "1px 6px", borderRadius: 3, textTransform: "uppercase" }}>Active</span>}
                            {!q.active && <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", background: "#f3f4f6", padding: "1px 6px", borderRadius: 3, textTransform: "uppercase" }}>Inactive</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "oklch(var(--ink-2))" }}>
                            {fmt(q.periodStart)} → {fmt(q.periodEnd)}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                            Target: {peso(q.targetAmount)}
                          </div>
                          {q.notes && <div style={{ fontSize: 12, color: "oklch(var(--ink-3))", marginTop: 2 }}>{q.notes}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(q)}>Edit</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: "#dc2626" }} onClick={() => handleDelete(q.id)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "16px 0", fontSize: 13, color: "oklch(var(--ink-3))" }}>
              No quota periods defined for this customer.
            </div>
          )}

          {/* Add / Edit form */}
          <div style={{ borderTop: "1px solid oklch(var(--line))", paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(var(--ink-3))", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              {editId ? "Edit Quota Period" : "Add Quota Period"}
            </div>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="field-label">Label *</label>
                  <input className="field-input" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. FY 2025 Q1 Contract" required />
                </div>
                <div>
                  <label className="field-label">Period Start *</label>
                  <input type="date" className="field-input" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} required />
                </div>
                <div>
                  <label className="field-label">Period End *</label>
                  <input type="date" className="field-input" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} required />
                </div>
                <div>
                  <label className="field-label">Target Amount (₱) *</label>
                  <input type="number" min="1" step="0.01" className="field-input" value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))} placeholder="500000" required />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2, gap: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                    Active
                  </label>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="field-label">Notes</label>
                  <input className="field-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Contract reference, renewal notes…" />
                </div>
              </div>
              {err && <p style={{ fontSize: 12.5, color: "oklch(var(--err))", margin: 0 }}>{err}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                {editId && (
                  <button type="button" className="btn" onClick={openAdd}>New Period</button>
                )}
                <button type="submit" className="btn btn-accent" disabled={pending} style={{ marginLeft: "auto" }}>
                  {pending ? "Saving…" : editId ? "Save Changes" : "Add Period"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      {importOpen && (
        <ImportModal
          title="Import Quota Periods"
          importUrl="/api/import/quotas"
          columns={QUOTA_IMPORT_COLUMNS}
          onClose={() => setImportOpen(false)}
          onSuccess={() => { setImportOpen(false); router.refresh(); }}
          notes={[
            "Match customers by Customer Code first, then Customer Name as fallback.",
            "Period Start and Period End must be in YYYY-MM-DD format.",
            "Target Amount must be a positive number (no currency symbol).",
            "Active column accepts TRUE/FALSE (defaults to TRUE if omitted).",
            "Existing rows matched by Customer + Label + Period Start will be updated.",
          ]}
        />
      )}
    </div>
  );
}

interface FormState {
  code: string;
  name: string;
  type: string;
  tin: string;
  region: string;
  city: string;
  terms: string;
  creditLimit: string;
  contactEmail: string;
  contactPhone: string;
  assignedAgentId: string;
  blanketDiscountPct: string;
}

function emptyForm(): FormState {
  return { code: "", name: "", type: "SUPERMARKET", tin: "", region: "", city: "", terms: "Net 30", creditLimit: "0", contactEmail: "", contactPhone: "", assignedAgentId: "", blanketDiscountPct: "" };
}

function rowToForm(r: CustomerRow): FormState {
  return {
    code: r.code ?? "",
    name: r.name,
    type: r.type,
    tin: r.tin ?? "",
    region: r.region ?? "",
    city: r.city ?? "",
    terms: r.terms,
    creditLimit: r.creditLimit,
    contactEmail: r.contactEmail ?? "",
    contactPhone: r.contactPhone ?? "",
    assignedAgentId: r.assignedAgentId ?? "",
    blanketDiscountPct: r.blanketDiscountPct ?? "",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="field-label">{label}</label>{children}</div>;
}

function CustomerForm({ form, setForm, err, pending, onCancel, onSubmit, submitLabel, agents }: {
  form: FormState; setForm: (f: FormState) => void;
  err: string; pending: boolean;
  onCancel: () => void; onSubmit: (e: React.FormEvent) => void; submitLabel: string;
  agents: AgentOption[];
}) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Customer Name *">
          <input className="field-input" value={form.name} onChange={set("name")} placeholder="Metro City Supermarket" required />
        </Field>
        <Field label="Type">
          <select className="field-input" value={form.type} onChange={set("type")}>
            {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Code">
          <input className="field-input" value={form.code} onChange={set("code")} placeholder="CUST-001 (optional)" />
        </Field>
        <Field label="TIN">
          <input className="field-input" value={form.tin} onChange={set("tin")} placeholder="000-000-000-000" />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="City">
          <input className="field-input" value={form.city} onChange={set("city")} placeholder="Quezon City" />
        </Field>
        <Field label="Region">
          <input className="field-input" value={form.region} onChange={set("region")} placeholder="NCR" />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Payment Terms">
          <input className="field-input" value={form.terms} onChange={set("terms")} placeholder="Net 30" />
        </Field>
        <Field label="Credit Limit (₱)">
          <input className="field-input" type="number" min="0" step="0.01" value={form.creditLimit} onChange={set("creditLimit")} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Contact Email">
          <input className="field-input" type="email" value={form.contactEmail} onChange={set("contactEmail")} placeholder="billing@retailer.ph" />
        </Field>
        <Field label="Contact Phone">
          <input className="field-input" value={form.contactPhone} onChange={set("contactPhone")} placeholder="+63 2 8xxx xxxx" />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Assigned Sales Agent">
          <select className="field-input" value={form.assignedAgentId} onChange={set("assignedAgentId")}>
            <option value="">— Unassigned —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Blanket Discount %">
          <input className="field-input" type="number" min="0" max="100" step="0.01" value={form.blanketDiscountPct} onChange={set("blanketDiscountPct")} placeholder="e.g. 5" />
        </Field>
      </div>
      {err && <p style={{ fontSize: 12.5, color: "oklch(var(--err))" }}>{err}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function CustomersClient({ customers, agents }: { customers: CustomerRow[]; agents: AgentOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<CustomerRow | null>(null);
  const [quotaRow, setQuotaRow] = useState<CustomerRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm());
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL");

  const filtered = customers.filter(c => {
    if (filterType !== "ALL" && c.type !== filterType) return false;
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.code ?? "").toLowerCase().includes(q) || (c.city ?? "").toLowerCase().includes(q);
  });

  function openCreate() { setCreateForm(emptyForm()); setErr(""); setCreateOpen(true); }
  function openEdit(row: CustomerRow) { setEditRow(row); setEditForm(rowToForm(row)); setErr(""); }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    startTransition(async () => {
      try {
        await createCustomer({
          code: createForm.code || undefined,
          name: createForm.name,
          type: createForm.type,
          tin: createForm.tin || undefined,
          region: createForm.region || undefined,
          city: createForm.city || undefined,
          terms: createForm.terms,
          creditLimit: parseFloat(createForm.creditLimit) || 0,
          contactEmail: createForm.contactEmail || undefined,
          contactPhone: createForm.contactPhone || undefined,
          assignedAgentId: createForm.assignedAgentId || null,
          blanketDiscountPct: createForm.blanketDiscountPct ? parseFloat(createForm.blanketDiscountPct) : null,
        });
        router.refresh(); setCreateOpen(false);
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    startTransition(async () => {
      try {
        await updateCustomer(editRow!.id, {
          code: editForm.code || undefined,
          name: editForm.name,
          type: editForm.type,
          tin: editForm.tin || undefined,
          region: editForm.region || undefined,
          city: editForm.city || undefined,
          terms: editForm.terms,
          creditLimit: parseFloat(editForm.creditLimit) || 0,
          contactEmail: editForm.contactEmail || undefined,
          contactPhone: editForm.contactPhone || undefined,
          assignedAgentId: editForm.assignedAgentId || null,
          blanketDiscountPct: editForm.blanketDiscountPct ? parseFloat(editForm.blanketDiscountPct) : null,
        });
        router.refresh(); setEditRow(null);
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2" style={{ flex: 1 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600 }}>Customers</h1>
          <HelpButton slug="customers-suppliers" label="Help: Customers" />
        </div>
        <span style={{ fontSize: 12, color: "oklch(var(--ink-3))" }}>{customers.length} customers</span>
        <a href="/api/export/customers" className="btn btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </a>
        <button className="btn" style={{ fontSize: 12 }} onClick={() => setImportOpen(true)}>↑ Import CSV</button>
        <button className="btn btn-primary" onClick={openCreate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          New Customer
        </button>
      </div>

      <div className="filters">
        <div className="search-box" style={{ width: 240 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input placeholder="Search name, code, city…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="field-input" style={{ width: 150, height: 32 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="ALL">All types</option>
          {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th className="id">Code</th>
              <th>City</th>
              <th>Terms</th>
              <th className="num">Credit Limit</th>
              <th className="num">Unpaid Receipts</th>
              <th>Contact</th>
              <th style={{ minWidth: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="empty-state" style={{ padding: "32px 0" }}>No customers found</td></tr>
            )}
            {filtered.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 500 }}>
                  {c.name}
                  {c.onHold && <span className="pill pill-CANCELLED" style={{ marginLeft: 6 }}>ON HOLD</span>}
                </td>
                <td><span className="badge">{c.type}</span></td>
                <td className="id">{c.code ?? "—"}</td>
                <td className="dim">{c.city ?? "—"}</td>
                <td className="dim">{c.terms}</td>
                <td className="num">{peso(c.creditLimit)}</td>
                <td className="num" style={{ color: c.onHold ? "oklch(0.45 0.12 25)" : undefined, fontWeight: c.onHold ? 600 : undefined }}>{c.unpaidCount}</td>
                <td className="dim" style={{ fontSize: 12 }}>{c.contactEmail ?? c.contactPhone ?? "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                    <Link href={`/print/statement/${c.id}`} target="_blank" className="btn btn-ghost btn-sm" title="Statement of Account">
                      Statement
                    </Link>
                    <button className="btn btn-ghost btn-sm" onClick={() => setQuotaRow(c)} title="Manage quota periods">
                      Quotas{c.quotas.length > 0 ? ` (${c.quotas.length})` : ""}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {quotaRow && <QuotaModal customer={quotaRow} onClose={() => setQuotaRow(null)} />}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Customer">
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <CustomerForm form={createForm} setForm={setCreateForm} err={err} pending={pending} onCancel={() => setCreateOpen(false)} onSubmit={submitCreate} submitLabel="Create Customer" agents={agents} />
        </div>
      </Modal>

      <Modal open={!!editRow} onClose={() => setEditRow(null)} title={editRow ? `Edit — ${editRow.name}` : "Edit"}>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <CustomerForm form={editForm} setForm={setEditForm} err={err} pending={pending} onCancel={() => setEditRow(null)} onSubmit={submitEdit} submitLabel="Save Changes" agents={agents} />
        </div>
      </Modal>

      {importOpen && (
        <ImportModal
          title="Customers"
          templateHref="/api/export/customers?template=true"
          dataHref="/api/export/customers"
          importUrl="/api/import/customers"
          columns={IMPORT_COLUMNS}
          onClose={() => setImportOpen(false)}
          onSuccess={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
