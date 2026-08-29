"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ImportModal } from "@/components/ui/ImportModal";
import { HelpButton } from "@/components/HelpButton";
import { createSupplier, updateSupplier } from "./actions";

const IMPORT_COLUMNS = [
  { key: "Code",              label: "Code",              required: false },
  { key: "Name",              label: "Name",              required: true  },
  { key: "Status",            label: "Status",            required: false },
  { key: "City",              label: "City",              required: false },
  { key: "Terms",             label: "Terms",             required: false },
  { key: "Lead Time (days)",  label: "Lead Time (days)",  required: false },
  { key: "Rating",            label: "Rating",            required: false },
  { key: "Email",             label: "Email",             required: false },
  { key: "Phone",             label: "Phone",             required: false },
];

const STATUSES = ["ACTIVE", "ON_HOLD", "INACTIVE"] as const;
type Status = typeof STATUSES[number];

export interface SupplierRow {
  id: string;
  code: string | null;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  city: string | null;
  terms: string;
  leadTimeDays: number;
  rating: string;
  status: Status;
  createdAt: string;
}

interface FormState {
  code: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  terms: string;
  leadTimeDays: string;
  rating: string;
  status: Status;
}

function emptyForm(): FormState {
  return { code: "", name: "", contactEmail: "", contactPhone: "", city: "", terms: "Net 30", leadTimeDays: "7", rating: "4.5", status: "ACTIVE" };
}

function rowToForm(r: SupplierRow): FormState {
  return {
    code: r.code ?? "",
    name: r.name,
    contactEmail: r.contactEmail ?? "",
    contactPhone: r.contactPhone ?? "",
    city: r.city ?? "",
    terms: r.terms,
    leadTimeDays: String(r.leadTimeDays),
    rating: r.rating,
    status: r.status,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="field-label">{label}</label>{children}</div>;
}

const STATUS_PILL: Record<Status, string> = {
  ACTIVE: "pill-DELIVERED",
  ON_HOLD: "pill-PREPARING",
  INACTIVE: "pill-CANCELLED",
};

function StarRating({ value }: { value: number }) {
  const full = Math.floor(value);
  const partial = value - full;
  const stars = [1, 2, 3, 4, 5];
  const color = value >= 4 ? "oklch(0.78 0.18 85)" : value >= 3 ? "oklch(0.72 0.15 55)" : "oklch(0.62 0.18 25)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      {stars.map((i) => {
        const fill = i <= full ? 1 : i === full + 1 ? partial : 0;
        return (
          <svg key={i} width="12" height="12" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <defs>
              <linearGradient id={`sg-${i}-${Math.round(value * 10)}`}>
                <stop offset={`${fill * 100}%`} stopColor={color} />
                <stop offset={`${fill * 100}%`} stopColor="oklch(var(--line))" />
              </linearGradient>
            </defs>
            <polygon
              points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
              fill={fill === 1 ? color : fill === 0 ? "oklch(var(--line))" : `url(#sg-${i}-${Math.round(value * 10)})`}
              stroke={color}
              strokeWidth="1"
            />
          </svg>
        );
      })}
      <span style={{ fontSize: 11, marginLeft: 3, color: "oklch(var(--ink-3))", fontFamily: "var(--font-geist-mono, monospace)" }}>{value.toFixed(1)}</span>
    </span>
  );
}

function SupplierForm({ form, setForm, err, pending, onCancel, onSubmit, submitLabel }: {
  form: FormState; setForm: (f: FormState) => void;
  err: string; pending: boolean;
  onCancel: () => void; onSubmit: (e: React.FormEvent) => void; submitLabel: string;
}) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Supplier Name *">
          <input className="field-input" value={form.name} onChange={set("name")} placeholder="PhilMed Distributors Inc." required />
        </Field>
        <Field label="Code">
          <input className="field-input" value={form.code} onChange={set("code")} placeholder="SUP-001 (optional)" />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Contact Email">
          <input className="field-input" type="email" value={form.contactEmail} onChange={set("contactEmail")} placeholder="orders@supplier.ph" />
        </Field>
        <Field label="Contact Phone">
          <input className="field-input" value={form.contactPhone} onChange={set("contactPhone")} placeholder="+63 2 8xxx xxxx" />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="City">
          <input className="field-input" value={form.city} onChange={set("city")} placeholder="Pasig City" />
        </Field>
        <Field label="Payment Terms">
          <input className="field-input" value={form.terms} onChange={set("terms")} placeholder="Net 30" />
        </Field>
        <Field label="Lead Time (days)">
          <input className="field-input" type="number" min="0" value={form.leadTimeDays} onChange={set("leadTimeDays")} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Rating (0–5)">
          <input className="field-input" type="number" min="0" max="5" step="0.1" value={form.rating} onChange={set("rating")} />
        </Field>
        <Field label="Status">
          <select className="field-input" value={form.status} onChange={set("status")}>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
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

export function SuppliersClient({ suppliers }: { suppliers: SupplierRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<SupplierRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm());
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const filtered = suppliers.filter(s => {
    if (filterStatus !== "ALL" && s.status !== filterStatus) return false;
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || (s.code ?? "").toLowerCase().includes(q) || (s.city ?? "").toLowerCase().includes(q);
  });

  function openCreate() { setCreateForm(emptyForm()); setErr(""); setCreateOpen(true); }
  function openEdit(row: SupplierRow) { setEditRow(row); setEditForm(rowToForm(row)); setErr(""); }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    startTransition(async () => {
      try {
        await createSupplier({
          code: createForm.code || undefined,
          name: createForm.name,
          contactEmail: createForm.contactEmail || undefined,
          contactPhone: createForm.contactPhone || undefined,
          city: createForm.city || undefined,
          terms: createForm.terms,
          leadTimeDays: parseInt(createForm.leadTimeDays) || 7,
          rating: parseFloat(createForm.rating) || 4.5,
          status: createForm.status,
        });
        router.refresh(); setCreateOpen(false);
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    startTransition(async () => {
      try {
        await updateSupplier(editRow!.id, {
          code: editForm.code || undefined,
          name: editForm.name,
          contactEmail: editForm.contactEmail || undefined,
          contactPhone: editForm.contactPhone || undefined,
          city: editForm.city || undefined,
          terms: editForm.terms,
          leadTimeDays: parseInt(editForm.leadTimeDays) || 7,
          rating: parseFloat(editForm.rating) || 4.5,
          status: editForm.status,
        });
        router.refresh(); setEditRow(null);
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2" style={{ flex: 1 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600 }}>Suppliers</h1>
          <HelpButton slug="customers-suppliers" label="Help: Suppliers" />
        </div>
        <span style={{ fontSize: 12, color: "oklch(var(--ink-3))" }}>{suppliers.length} suppliers</span>
        <a href="/api/export/suppliers" className="btn btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </a>
        <button className="btn" style={{ fontSize: 12 }} onClick={() => setImportOpen(true)}>↑ Import CSV</button>
        <button className="btn btn-primary" onClick={openCreate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          New Supplier
        </button>
      </div>

      <div className="filters">
        <div className="search-box" style={{ width: 240 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input placeholder="Search name, code, city…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="field-input" style={{ width: 140, height: 32 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="ALL">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th className="id">Code</th>
              <th>City</th>
              <th>Terms</th>
              <th className="num">Lead Days</th>
              <th className="num">Rating</th>
              <th>Contact</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="empty-state" style={{ padding: "32px 0" }}>No suppliers found</td></tr>
            )}
            {filtered.map(s => (
              <tr key={s.id} style={{ opacity: s.status === "INACTIVE" ? 0.55 : 1 }}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td className="id">{s.code ?? "—"}</td>
                <td className="dim">{s.city ?? "—"}</td>
                <td className="dim">{s.terms}</td>
                <td className="num dim">{s.leadTimeDays}d</td>
                <td className="num">
                  <StarRating value={parseFloat(s.rating)} />
                </td>
                <td className="dim" style={{ fontSize: 12 }}>{s.contactEmail ?? s.contactPhone ?? "—"}</td>
                <td><span className={`pill ${STATUS_PILL[s.status]}`}>{s.status.replace("_", " ")}</span></td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Supplier">
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SupplierForm form={createForm} setForm={setCreateForm} err={err} pending={pending} onCancel={() => setCreateOpen(false)} onSubmit={submitCreate} submitLabel="Create Supplier" />
        </div>
      </Modal>

      <Modal open={!!editRow} onClose={() => setEditRow(null)} title={editRow ? `Edit — ${editRow.name}` : "Edit"}>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SupplierForm form={editForm} setForm={setEditForm} err={err} pending={pending} onCancel={() => setEditRow(null)} onSubmit={submitEdit} submitLabel="Save Changes" />
        </div>
      </Modal>

      {importOpen && (
        <ImportModal
          title="Suppliers"
          templateHref="/api/export/suppliers?template=true"
          dataHref="/api/export/suppliers"
          importUrl="/api/import/suppliers"
          columns={IMPORT_COLUMNS}
          onClose={() => setImportOpen(false)}
          onSuccess={() => { setImportOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
