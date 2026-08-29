"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { ImportModal } from "@/components/ui/ImportModal";
import { peso } from "@/lib/utils";
import { volumeFromDimensions } from "@/lib/bulk";
import { createCatalogItem, updateCatalogItem, uploadCatalogImage, createCategory, updateCategory, deleteCategory } from "./actions";

const IMPORT_COLUMNS = [
  { key: "SKU",        label: "SKU",        required: true  },
  { key: "Name",       label: "Name",       required: true  },
  { key: "Category",   label: "Category",   required: true  },
  { key: "Unit",       label: "Unit",       required: true  },
  { key: "Units Per Case", label: "Units Per Case", required: false },
  { key: "Unit Price", label: "Unit Price", required: true  },
  { key: "Brand",      label: "Brand",      required: false },
  { key: "Active",     label: "Active",     required: false },
];

export interface CategoryRow {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface CatalogRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitsPerCase: number | null;
  unitPrice: string;
  wholesalePrice: string | null;
  wholesaleMinQty: number | null;
  itemKind: "PACKAGED" | "BULK" | "BULK_VESSEL";
  bulkSourceId: string | null;
  bulkVolumeM3: number | null;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  brand: string | null;
  imageUrl: string | null;
  active: boolean;
  supplierId: string | null;
  parentId: string | null;
  parentSku: string | null;
}

interface Supplier { id: string; name: string }

interface FormState {
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitsPerCase: string;
  unitPrice: string;
  wholesalePrice: string;
  wholesaleMinQty: string;
  itemKind: "PACKAGED" | "BULK" | "BULK_VESSEL";
  bulkSourceId: string;
  bulkVolumeM3: string;
  lengthM: string;
  widthM: string;
  heightM: string;
  brand: string;
  imageUrl: string;
  supplierId: string;
  parentId: string;
  active: boolean;
}

function emptyForm(): FormState {
  return { sku: "", name: "", category: "OTHER", unit: "case", unitsPerCase: "", unitPrice: "", wholesalePrice: "", wholesaleMinQty: "", itemKind: "PACKAGED", bulkSourceId: "", bulkVolumeM3: "", lengthM: "", widthM: "", heightM: "", brand: "", imageUrl: "", supplierId: "", parentId: "", active: true };
}

function rowToForm(r: CatalogRow): FormState {
  return {
    sku: r.sku,
    name: r.name,
    category: r.category,
    unit: r.unit,
    unitsPerCase: r.unitsPerCase != null ? String(r.unitsPerCase) : "",
    unitPrice: r.unitPrice,
    wholesalePrice: r.wholesalePrice ?? "",
    wholesaleMinQty: r.wholesaleMinQty?.toString() ?? "",
    itemKind: r.itemKind,
    bulkSourceId: r.bulkSourceId ?? "",
    bulkVolumeM3: r.bulkVolumeM3?.toString() ?? "",
    lengthM: r.lengthM?.toString() ?? "",
    widthM: r.widthM?.toString() ?? "",
    heightM: r.heightM?.toString() ?? "",
    brand: r.brand ?? "",
    imageUrl: r.imageUrl ?? "",
    supplierId: r.supplierId ?? "",
    parentId: r.parentId ?? "",
    active: r.active,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function CatalogForm({
  form,
  setForm,
  suppliers,
  categories,
  caseItems,
  bulkItems,
  editingId,
  err,
  pending,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  suppliers: Supplier[];
  categories: CategoryRow[];
  caseItems: CatalogRow[];
  bulkItems: CatalogRow[];
  editingId: string | null;
  err: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
}) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const [uploading, setUploading] = useState(false);

  async function handleImageFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const { imageUrl } = await uploadCatalogImage(fd);
      setForm({ ...form, imageUrl });
    } catch {
      // leave existing imageUrl unchanged on failure
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="SKU *">
          <input className="field-input" value={form.sku} onChange={set("sku")} placeholder="MED-001" required />
        </Field>
        <Field label="Category *">
          <select className="field-input" value={form.category} onChange={set("category")}>
            {categories.filter(c => c.active || c.code === form.category).map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Product Name *">
        <input className="field-input" value={form.name} onChange={set("name")} placeholder="Lucky Me! Pancit Canton Original 60g" required />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        <Field label="Price per Unit (₱) *">
          <input className="field-input" type="number" min="0.01" step="0.01" value={form.unitPrice} onChange={set("unitPrice")} placeholder="0.00" required />
        </Field>
        <Field label="Unit">
          <input className="field-input" value={form.unit} onChange={set("unit")} placeholder="case" />
        </Field>
        <Field label="Pieces per Unit">
          <input className="field-input" type="number" min="1" step="1" value={form.unitsPerCase} onChange={set("unitsPerCase")} placeholder="e.g. 48" />
        </Field>
        <Field label="Brand">
          <input className="field-input" value={form.brand} onChange={set("brand")} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Item Type *">
        <select
          className="field-input"
          value={form.itemKind}
          onChange={e => setForm({ ...form, itemKind: e.target.value as FormState["itemKind"] })}
        >
          <option value="PACKAGED">Packaged — sold in discrete units (bags, lengths, sheets)</option>
          <option value="BULK">Stockpile — measured by volume in m³ (sand, gravel, crush)</option>
          <option value="BULK_VESSEL">Truck size — sold by the load, drawn from a stockpile</option>
        </select>
      </Field>

      {form.itemKind === "BULK_VESSEL" && (
        <div style={{ padding: "10px 12px", borderRadius: 6, background: "oklch(var(--bg-2))", border: "1px solid oklch(var(--line))" }}>
          <p style={{ fontSize: 11.5, color: "oklch(var(--ink-3))", marginBottom: 10 }}>
            A truck size holds no stock of its own — each one sold draws its volume from the
            stockpile below. Selling 3 of these is one line of qty 3.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
            <Field label="Draws from stockpile *">
              <select className="field-input" value={form.bulkSourceId} onChange={set("bulkSourceId")}>
                <option value="">— Select material —</option>
                {bulkItems.map(b => <option key={b.id} value={b.id}>{b.sku} — {b.name}</option>)}
              </select>
            </Field>
            <Field label="Capacity (m³) *">
              <input className="field-input" type="number" min="0.001" step="0.001" value={form.bulkVolumeM3} onChange={set("bulkVolumeM3")} placeholder="e.g. 2.5" />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Length (m)">
              <input className="field-input" type="number" min="0" step="0.001" value={form.lengthM} onChange={set("lengthM")} placeholder="2.00" />
            </Field>
            <Field label="Width (m)">
              <input className="field-input" type="number" min="0" step="0.001" value={form.widthM} onChange={set("widthM")} placeholder="1.50" />
            </Field>
            <Field label="Height (m)">
              <input className="field-input" type="number" min="0" step="0.001" value={form.heightM} onChange={set("heightM")} placeholder="0.833" />
            </Field>
          </div>
          {form.lengthM && form.widthM && form.heightM && (
            <p style={{ fontSize: 11.5, color: "oklch(var(--ink-3))", marginTop: 8 }}>
              L × W × H = {volumeFromDimensions({
                lengthM: parseFloat(form.lengthM) || 0,
                widthM: parseFloat(form.widthM) || 0,
                heightM: parseFloat(form.heightM) || 0,
              })} m³
              {form.bulkVolumeM3 && ` · billed capacity ${form.bulkVolumeM3} m³`}
            </p>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Wholesale Price (₱)">
          <input className="field-input" type="number" min="0.01" step="0.01" value={form.wholesalePrice} onChange={set("wholesalePrice")} placeholder="Leave blank — not sold wholesale" />
        </Field>
        <Field label="Wholesale Min. Qty per Line">
          <input className="field-input" type="number" min="1" step="1" value={form.wholesaleMinQty} onChange={set("wholesaleMinQty")} placeholder="Blank — use org default" />
        </Field>
      </div>
      <Field label="Product Photo (shown on the public order page)">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {form.imageUrl && (
            <img src={form.imageUrl} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid oklch(var(--line))" }} />
          )}
          <label className="btn btn-sm" style={{ cursor: "pointer" }}>
            {uploading ? "Uploading…" : form.imageUrl ? "Replace photo" : "Upload photo"}
            <input
              type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
            />
          </label>
          {form.imageUrl && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, imageUrl: "" })}>Remove</button>
          )}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Supplier">
          <select className="field-input" value={form.supplierId} onChange={set("supplierId")}>
            <option value="">— None —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Piece variant of (case SKU)">
          <select className="field-input" value={form.parentId} onChange={set("parentId")}>
            <option value="">— Standalone —</option>
            {caseItems.filter(c => c.id !== editingId).map(c => (
              <option key={c.id} value={c.id}>{c.sku} — {c.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          id="cat-active"
          checked={form.active}
          onChange={e => setForm({ ...form, active: e.target.checked })}
          style={{ width: 15, height: 15, accentColor: "oklch(var(--accent))" }}
        />
        <label htmlFor="cat-active" style={{ fontSize: 13 }}>Active (visible in order forms)</label>
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

export function CatalogClient({ items, suppliers, categories }: { items: CatalogRow[]; suppliers: Supplier[]; categories: CategoryRow[] }) {
  const router = useRouter();
  // Case-level SKUs (not piece variants themselves) are the valid parents for a piece SKU.
  const caseItems = items.filter(i => i.unit !== "pc");
  // Only stockpile materials can back a truck size.
  const bulkItems = items.filter(i => i.itemKind === "BULK");
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm());
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("ALL");
  const [filterActive, setFilterActive] = useState("ALL");
  const categoryName = (code: string) => categories.find(c => c.code === code)?.name ?? code;

  const filtered = items.filter(i => {
    if (filterCat !== "ALL" && i.category !== filterCat) return false;
    if (filterActive === "ACTIVE" && !i.active) return false;
    if (filterActive === "INACTIVE" && i.active) return false;
    const q = search.toLowerCase();
    return !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.brand ?? "").toLowerCase().includes(q);
  });

  function openCreate() { setCreateForm(emptyForm()); setErr(""); setCreateOpen(true); }
  function openEdit(row: CatalogRow) { setEditItem(row); setEditForm(rowToForm(row)); setErr(""); }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    startTransition(async () => {
      try {
        await createCatalogItem({
          sku: createForm.sku,
          name: createForm.name,
          category: createForm.category,
          unit: createForm.unit,
          unitsPerCase: createForm.unitsPerCase ? parseInt(createForm.unitsPerCase, 10) : null,
          unitPrice: parseFloat(createForm.unitPrice),
          wholesalePrice: createForm.wholesalePrice ? parseFloat(createForm.wholesalePrice) : null,
          wholesaleMinQty: createForm.wholesaleMinQty ? parseFloat(createForm.wholesaleMinQty) : null,
          itemKind: createForm.itemKind,
          bulkSourceId: createForm.bulkSourceId || null,
          bulkVolumeM3: createForm.bulkVolumeM3 ? parseFloat(createForm.bulkVolumeM3) : null,
          lengthM: createForm.lengthM ? parseFloat(createForm.lengthM) : null,
          widthM: createForm.widthM ? parseFloat(createForm.widthM) : null,
          heightM: createForm.heightM ? parseFloat(createForm.heightM) : null,
          brand: createForm.brand || undefined,
          imageUrl: createForm.imageUrl || null,
          supplierId: createForm.supplierId || null,
          parentId: createForm.parentId || null,
          active: createForm.active,
        });
        router.refresh(); setCreateOpen(false);
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    startTransition(async () => {
      try {
        await updateCatalogItem(editItem!.id, {
          sku: editForm.sku,
          name: editForm.name,
          category: editForm.category,
          unit: editForm.unit,
          unitsPerCase: editForm.unitsPerCase ? parseInt(editForm.unitsPerCase, 10) : null,
          unitPrice: parseFloat(editForm.unitPrice),
          wholesalePrice: editForm.wholesalePrice ? parseFloat(editForm.wholesalePrice) : null,
          wholesaleMinQty: editForm.wholesaleMinQty ? parseFloat(editForm.wholesaleMinQty) : null,
          itemKind: editForm.itemKind,
          bulkSourceId: editForm.bulkSourceId || null,
          bulkVolumeM3: editForm.bulkVolumeM3 ? parseFloat(editForm.bulkVolumeM3) : null,
          lengthM: editForm.lengthM ? parseFloat(editForm.lengthM) : null,
          widthM: editForm.widthM ? parseFloat(editForm.widthM) : null,
          heightM: editForm.heightM ? parseFloat(editForm.heightM) : null,
          brand: editForm.brand || undefined,
          imageUrl: editForm.imageUrl || null,
          supplierId: editForm.supplierId || null,
          parentId: editForm.parentId || null,
          active: editForm.active,
        });
        router.refresh(); setEditItem(null);
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  // Cycles through the existing status-pill palette so any number of categories gets a
  // color without hardcoding one per category code.
  const PILL_PALETTE = ["pill-APPROVED", "pill-PREPARING", "pill-SHIPPED", "pill-DELIVERED", "pill-PENDING", "pill-CANCELLED"];
  const pillFor = (code: string) => {
    const idx = categories.findIndex(c => c.code === code);
    return PILL_PALETTE[(idx < 0 ? 0 : idx) % PILL_PALETTE.length];
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h1 style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>Catalog</h1>
        <span style={{ fontSize: 12, color: "oklch(var(--ink-3))" }}>{items.length} items</span>
        <a href="/api/export/products" className="btn" style={{ fontSize: 12 }}>↓ Export CSV</a>
        <button className="btn" style={{ fontSize: 12 }} onClick={() => setImportOpen(true)}>↑ Import CSV</button>
        <button className="btn" style={{ fontSize: 12 }} onClick={() => setCategoriesOpen(true)}>Categories</button>
        <button className="btn btn-primary" onClick={openCreate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          New Item
        </button>
      </div>

      <div className="filters">
        <div className="search-box" style={{ width: 240 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input placeholder="Search SKU, name, brand…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="field-input" style={{ width: 150, height: 32 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="ALL">All categories</option>
          {categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <select className="field-input" style={{ width: 120, height: 32 }} value={filterActive} onChange={e => setFilterActive(e.target.value)}>
          <option value="ALL">All status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="id">SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th>Brand</th>
              <th className="num">Unit Price</th>
              <th>Unit</th>
              <th className="num">Pcs/Unit</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="empty-state" style={{ padding: "32px 0" }}>No items found</td></tr>
            )}
            {filtered.map(item => (
              <tr key={item.id} style={{ opacity: item.active ? 1 : 0.55 }}>
                <td className="id">
                  {item.sku}
                  {item.parentSku && <div style={{ fontSize: 10.5, color: "oklch(var(--ink-3))" }}>piece of {item.parentSku}</div>}
                </td>
                <td style={{ fontWeight: 500 }}>{item.name}</td>
                <td><span className={`pill ${pillFor(item.category)}`}>{categoryName(item.category)}</span></td>
                <td className="dim">{item.brand ?? "—"}</td>
                <td className="num">{peso(item.unitPrice)}</td>
                <td className="dim">{item.unit}</td>
                <td className="num dim">{item.unitsPerCase ?? "—"}</td>
                <td>
                  <span className={`pill ${item.active ? "pill-DELIVERED" : "pill-CANCELLED"}`}>
                    {item.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Catalog Item">
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <CatalogForm form={createForm} setForm={setCreateForm} suppliers={suppliers} categories={categories} caseItems={caseItems} bulkItems={bulkItems} editingId={null} err={err} pending={pending} onCancel={() => setCreateOpen(false)} onSubmit={submitCreate} submitLabel="Create Item" />
        </div>
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={editItem ? `Edit — ${editItem.name}` : "Edit"}>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <CatalogForm form={editForm} setForm={setEditForm} suppliers={suppliers} categories={categories} caseItems={caseItems} bulkItems={bulkItems} editingId={editItem?.id ?? null} err={err} pending={pending} onCancel={() => setEditItem(null)} onSubmit={submitEdit} submitLabel="Save Changes" />
        </div>
      </Modal>

      {categoriesOpen && (
        <CategoriesModal categories={categories} itemCounts={items.reduce<Record<string, number>>((m, i) => { m[i.category] = (m[i.category] ?? 0) + 1; return m; }, {})} onClose={() => setCategoriesOpen(false)} />
      )}

      {importOpen && (
        <ImportModal
          title="Products"
          templateHref="/api/export/products?template=true"
          dataHref="/api/export/products"
          importUrl="/api/import/products"
          columns={IMPORT_COLUMNS}
          onClose={() => setImportOpen(false)}
          onSuccess={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

interface CategoryFormState { code: string; name: string; sortOrder: string; active: boolean }
function emptyCategoryForm(): CategoryFormState { return { code: "", name: "", sortOrder: "0", active: true }; }

function CategoriesModal({
  categories,
  itemCounts,
  onClose,
}: {
  categories: CategoryRow[];
  itemCounts: Record<string, number>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryFormState>(emptyCategoryForm());
  const [addingNew, setAddingNew] = useState(false);
  const [err, setErr] = useState("");

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  function startEdit(c: CategoryRow) {
    setEditingId(c.id);
    setAddingNew(false);
    setForm({ code: c.code, name: c.name, sortOrder: String(c.sortOrder), active: c.active });
    setErr("");
  }

  function startAdd() {
    setEditingId(null);
    setAddingNew(true);
    setForm(emptyCategoryForm());
    setErr("");
  }

  function cancel() {
    setEditingId(null);
    setAddingNew(false);
    setErr("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    startTransition(async () => {
      try {
        const data = {
          code: form.code.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_"),
          name: form.name.trim(),
          sortOrder: parseInt(form.sortOrder, 10) || 0,
          active: form.active,
        };
        if (editingId) await updateCategory(editingId, data);
        else await createCategory(data);
        router.refresh();
        cancel();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Error");
      }
    });
  }

  function remove(c: CategoryRow) {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    setErr("");
    startTransition(async () => {
      try {
        await deleteCategory(c.id);
        router.refresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Manage Categories">
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 12.5, color: "oklch(var(--ink-3))" }}>
          Used for Catalog filtering and product grouping on the QR order page. Drives that page's category tabs too.
        </p>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th className="num">Order</th><th>Status</th><th className="num">Products</th><th></th></tr></thead>
            <tbody>
              {sorted.map(c => (
                editingId === c.id ? (
                  <tr key={c.id}>
                    <td colSpan={5}>
                      <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                        <input className="field-input" style={{ width: 90 }} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="CODE" required />
                        <input className="field-input" style={{ flex: 1 }} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Display name" required />
                        <input className="field-input" type="number" style={{ width: 60 }} value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} />
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
                          Active
                        </label>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>Save</button>
                        <button type="button" className="btn btn-sm" onClick={cancel}>Cancel</button>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} style={{ opacity: c.active ? 1 : 0.55 }}>
                    <td style={{ fontWeight: 500 }}>{c.name} <span className="dim" style={{ fontSize: 11 }}>({c.code})</span></td>
                    <td className="num dim">{c.sortOrder}</td>
                    <td><span className={`pill ${c.active ? "pill-DELIVERED" : "pill-CANCELLED"}`}>{c.active ? "Active" : "Inactive"}</span></td>
                    <td className="num dim">{itemCounts[c.code] ?? 0}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(c)} disabled={pending}>Delete</button>
                    </td>
                  </tr>
                )
              ))}
              {addingNew && (
                <tr>
                  <td colSpan={5}>
                    <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                      <input className="field-input" style={{ width: 90 }} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="CODE" required autoFocus />
                      <input className="field-input" style={{ flex: 1 }} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Display name" required />
                      <input className="field-input" type="number" style={{ width: 60 }} value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} />
                      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>Add</button>
                      <button type="button" className="btn btn-sm" onClick={cancel}>Cancel</button>
                    </form>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {err && <p style={{ fontSize: 12.5, color: "oklch(var(--err))" }}>{err}</p>}

        {!addingNew && !editingId && (
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={startAdd}>+ Add category</button>
        )}
      </div>
    </Modal>
  );
}
