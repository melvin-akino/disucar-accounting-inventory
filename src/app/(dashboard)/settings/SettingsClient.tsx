"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { createUser, updateUser, resetPassword, saveBranding, uploadLogo, saveExpiryThresholds, generateAgentQrToken, saveAccessSettings, createRelieverAssignment, deleteRelieverAssignment } from "./actions";
import type { Role } from "@prisma/client";
import type { OrgBrand } from "@/lib/org-settings";

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  customerId: string | null;
  qrToken: string | null;
  isOwner: boolean;
  isWarehouseHead: boolean;
  createdAt: string;
  customer: { name: string } | null;
}

interface Customer { id: string; name: string }

interface RelieverRow {
  id: string;
  originalUserName: string;
  relieverUserName: string;
  startDate: string;
  endDate: string;
  notes: string | null;
  active: boolean;
}

interface Props {
  users: UserRow[];
  customers: Customer[];
  currentUserId: string;
  branding: OrgBrand;
  expirySettings: { warnDays: number; criticalDays: number };
  appOrigin: string;
  accessSettings: { allowedOfficeIps: string };
  relievers: RelieverRow[];
  canManageRelievers: boolean;
  isAdmin: boolean;
}

const ALL_ROLES: Role[] = ["ADMIN", "AGENT", "CASHIER", "FINANCE", "WAREHOUSE", "DRIVER", "CUSTOMER"];

const ROLE_COLOR: Record<Role, string> = {
  ADMIN:      "background:oklch(0.17 0.025 255);color:oklch(0.72 0.08 255)",
  AGENT:      "background:oklch(0.94 0.03 240);color:oklch(0.35 0.10 240)",
  CASHIER:    "background:oklch(0.94 0.04 185);color:oklch(0.32 0.10 185)",
  FINANCE:    "background:oklch(0.94 0.04 145);color:oklch(0.32 0.10 145)",
  WAREHOUSE:  "background:oklch(0.94 0.04 75);color:oklch(0.32 0.10 65)",
  DRIVER:     "background:oklch(0.94 0.03 30);color:oklch(0.38 0.10 30)",
  CUSTOMER:   "background:oklch(0.96 0.02 250);color:oklch(0.40 0.05 250)",
};

// ── Modal primitives ──────────────────────────────────────────────────────────
function Backdrop({ onClose }: { onClose: () => void }) {
  return <div className="scrim" onClick={onClose} />;
}

function ModalBox({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <>
      <Backdrop onClose={onClose} />
      <div className="modal" style={{ width: "min(480px,90vw)" }}>
        <div className="card-head" style={{ justifyContent: "space-between" }}>
          <span className="card-h">{title}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {children}
        </div>
      </div>
    </>
  );
}

// ── Create user modal ─────────────────────────────────────────────────────────
function CreateModal({ customers, onClose }: {
  customers: Customer[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState("");
  const [role, setRole] = useState<Role>("AGENT");
  const [isOwner, setIsOwner] = useState(false);
  const [isWarehouseHead, setIsWarehouseHead] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLSelectElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    startTransition(async () => {
      try {
        await createUser({
          name: nameRef.current!.value.trim(),
          email: emailRef.current!.value.trim(),
          password: passwordRef.current!.value,
          role,
          customerId: role === "CUSTOMER" ? (customerRef.current?.value || undefined) : undefined,
          isOwner,
          isWarehouseHead,
        });
        router.refresh();
        onClose();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <ModalBox title="Add User" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="field-label">Full Name</label>
          <input ref={nameRef} className="field-input" placeholder="Maria Santos" required />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input ref={emailRef} type="email" className="field-input" placeholder="maria@disucarsales.ph" required />
        </div>
        <div>
          <label className="field-label">Temporary Password</label>
          <input ref={passwordRef} type="password" className="field-input" placeholder="Min 8 characters" required minLength={8} />
        </div>
        <div>
          <label className="field-label">Role</label>
          <select className="field-input" value={role} onChange={e => setRole(e.target.value as Role)}>
            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {role === "CUSTOMER" && (
          <div>
            <label className="field-label">Link to Customer</label>
            <select ref={customerRef} className="field-input">
              <option value="">— No customer —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {role === "ADMIN" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox" id="create-owner" checked={isOwner} onChange={e => setIsOwner(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: "oklch(var(--accent))" }}
            />
            <label htmlFor="create-owner" style={{ fontSize: 13 }}>Owner (exempt from location restriction)</label>
          </div>
        )}
        {role === "WAREHOUSE" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox" id="create-whhead" checked={isWarehouseHead} onChange={e => setIsWarehouseHead(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: "oklch(var(--accent))" }}
            />
            <label htmlFor="create-whhead" style={{ fontSize: 13 }}>Warehouse head (can assign relievers)</label>
          </div>
        )}
        {err && <p style={{ color: "oklch(var(--err))", fontSize: 12.5 }}>{err}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Creating…" : "Create User"}
          </button>
        </div>
      </form>
    </ModalBox>
  );
}

// ── Edit user modal ───────────────────────────────────────────────────────────
function EditModal({ user, customers, currentUserId, onClose }: {
  user: UserRow;
  customers: Customer[];
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState("");
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.active);
  const [customerId, setCustomerId] = useState(user.customerId ?? "");
  const [isOwner, setIsOwner] = useState(user.isOwner);
  const [isWarehouseHead, setIsWarehouseHead] = useState(user.isWarehouseHead);
  const [showPwReset, setShowPwReset] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [pwPending, startPwTransition] = useTransition();
  const [pwErr, setPwErr] = useState("");
  const [pwOk, setPwOk] = useState(false);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    startTransition(async () => {
      try {
        await updateUser({
          id: user.id,
          name,
          role,
          customerId: role === "CUSTOMER" ? (customerId || null) : null,
          active,
          isOwner,
          isWarehouseHead,
        });
        router.refresh();
        onClose();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function doResetPw(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(""); setPwOk(false);
    startPwTransition(async () => {
      try {
        await resetPassword(user.id, newPw);
        setPwOk(true);
        setNewPw("");
      } catch (e: unknown) {
        setPwErr(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  const isSelf = user.id === currentUserId;

  return (
    <ModalBox title={`Edit — ${user.name}`} onClose={onClose}>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="field-label">Full Name</label>
          <input className="field-input" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input className="field-input" value={user.email} disabled style={{ opacity: 0.5 }} />
        </div>
        <div>
          <label className="field-label">Role</label>
          <select className="field-input" value={role} onChange={e => setRole(e.target.value as Role)}>
            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {role === "CUSTOMER" && (
          <div>
            <label className="field-label">Linked Customer</label>
            <select className="field-input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">— None —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            id="user-active"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            disabled={isSelf}
            style={{ width: 15, height: 15, accentColor: "oklch(var(--accent))" }}
          />
          <label htmlFor="user-active" style={{ fontSize: 13, cursor: isSelf ? "not-allowed" : "pointer" }}>
            Account active {isSelf ? "(cannot deactivate yourself)" : ""}
          </label>
        </div>
        {role === "ADMIN" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox" id="edit-owner" checked={isOwner} onChange={e => setIsOwner(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: "oklch(var(--accent))" }}
            />
            <label htmlFor="edit-owner" style={{ fontSize: 13 }}>Owner (exempt from location restriction)</label>
          </div>
        )}
        {role === "WAREHOUSE" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox" id="edit-whhead" checked={isWarehouseHead} onChange={e => setIsWarehouseHead(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: "oklch(var(--accent))" }}
            />
            <label htmlFor="edit-whhead" style={{ fontSize: 13 }}>Warehouse head (can assign relievers)</label>
          </div>
        )}

        {/* Password reset section */}
        <div style={{ borderTop: "1px solid oklch(var(--line))", paddingTop: 14 }}>
          <button type="button" className="btn btn-sm" onClick={() => setShowPwReset(v => !v)}>
            {showPwReset ? "Hide" : "Reset Password"}
          </button>
          {showPwReset && (
            <form onSubmit={doResetPw} style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                type="password"
                className="field-input"
                placeholder="New password (min 8 chars)"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                minLength={8}
                style={{ flex: 1 }}
                required
              />
              <button type="submit" className="btn btn-accent btn-sm" disabled={pwPending}>
                {pwPending ? "Saving…" : "Save"}
              </button>
            </form>
          )}
          {pwErr && <p style={{ color: "oklch(var(--err))", fontSize: 12, marginTop: 6 }}>{pwErr}</p>}
          {pwOk && <p style={{ color: "oklch(0.50 0.10 155)", fontSize: 12, marginTop: 6 }}>Password updated.</p>}
        </div>

        {err && <p style={{ color: "oklch(var(--err))", fontSize: 12.5 }}>{err}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalBox>
  );
}

// ── Branding tab ──────────────────────────────────────────────────────────────
// Field must be defined OUTSIDE BrandingTab so React sees a stable component
// reference across renders. If defined inside, every keystroke creates a new
// component type, unmounts the old input, and the textbox loses focus.
function BrandingField({ label, value, type = "text", placeholder, onChange }: {
  label: string; value: string; type?: string; placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        type={type}
        className="field-input"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

function BrandingTab({ initial }: { initial: OrgBrand }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<OrgBrand>({ ...initial });

  // Logo upload state
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoErr, setLogoErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function set(key: keyof OrgBrand, value: string) {
    setForm(f => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleLogoFile(file: File) {
    setLogoErr("");
    setLogoUploading(true);
    // Optimistic local preview
    const previewUrl = URL.createObjectURL(file);
    setForm(f => ({ ...f, logoUrl: previewUrl }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadLogo(fd);
      setForm(f => ({ ...f, logoUrl: result.logoUrl }));
    } catch (e: unknown) {
      setLogoErr(e instanceof Error ? e.message : "Upload failed");
      setForm(f => ({ ...f, logoUrl: initial.logoUrl })); // revert on error
    } finally {
      setLogoUploading(false);
      URL.revokeObjectURL(previewUrl);
    }
  }

  function onLogoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleLogoFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleLogoFile(file);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setSaved(false);
    startTransition(async () => {
      try {
        await saveBranding(form);
        setSaved(true);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ fontSize: 13, color: "oklch(var(--ink-2))", margin: 0 }}>
        These values appear on all printed documents and in the sidebar. Changes take effect immediately.
      </p>

      {/* Preview strip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
        background: "oklch(var(--panel))", border: "1px solid oklch(var(--line))",
        borderRadius: 10, borderLeft: `4px solid ${form.color}`,
      }}>
        {/* Logo or fallback icon */}
        {form.logoUrl ? (
          <img
            src={form.logoUrl}
            alt="Logo preview"
            style={{ width: 36, height: 36, borderRadius: 7, objectFit: "contain", flexShrink: 0, background: "white", padding: 2 }}
          />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: 7, background: form.color,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v20M2 12h20" />
            </svg>
          </div>
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: form.color }}>{form.name || "Organisation Name"}</div>
          <div style={{ fontSize: 11.5, color: "oklch(var(--ink-3))", marginTop: 1 }}>{form.tagline || "Tagline"}</div>
        </div>
      </div>

      {/* Logo upload */}
      <div>
        <label className="field-label">Organisation Logo</label>
        <div
          role="button"
          tabIndex={0}
          onClick={() => logoInputRef.current?.click()}
          onKeyDown={e => (e.key === "Enter" || e.key === " ") && logoInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragOver ? "oklch(var(--accent))" : "oklch(var(--line))"}`,
            borderRadius: 10,
            padding: "20px 16px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            cursor: logoUploading ? "wait" : "pointer",
            background: dragOver ? "oklch(var(--accent-soft))" : "transparent",
            transition: "border-color 0.15s, background 0.15s",
          }}
        >
          {/* Current logo or placeholder */}
          {form.logoUrl ? (
            <img
              src={form.logoUrl}
              alt="Logo"
              style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 8, border: "1px solid oklch(var(--line))", background: "white", padding: 4, flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: 8,
              background: "oklch(var(--panel-2, var(--panel)))",
              border: "1px solid oklch(var(--line))",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              color: "oklch(var(--ink-3))",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(var(--ink))" }}>
              {logoUploading ? "Uploading…" : form.logoUrl ? "Click or drag to replace logo" : "Click or drag to upload logo"}
            </div>
            <div style={{ fontSize: 11.5, color: "oklch(var(--ink-3))", marginTop: 3 }}>
              PNG, JPG, WebP or SVG · max 2 MB · Recommended: 200×200 px or larger
            </div>
            {logoErr && <div style={{ fontSize: 12, color: "oklch(var(--err))", marginTop: 4 }}>{logoErr}</div>}
          </div>
          {logoUploading && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="oklch(var(--accent))" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, animation: "spin 1s linear infinite" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          style={{ display: "none" }}
          onChange={onLogoInputChange}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <BrandingField label="Organisation Name *"  value={form.name}    placeholder="Disucar Sales Inc"                    onChange={v => set("name", v)} />
        <BrandingField label="Tagline *"             value={form.tagline} placeholder="Grocery & FMCG Distribution"      onChange={v => set("tagline", v)} />
      </div>
      <BrandingField label="Registered Address *" value={form.address} placeholder="3F Tower, City, Metro Manila"        onChange={v => set("address", v)} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <BrandingField label="Phone *"   value={form.phone}   placeholder="+63 2 8123 4567"    onChange={v => set("phone", v)} />
        <BrandingField label="Email *"   value={form.email}   placeholder="info@example.ph" type="email" onChange={v => set("email", v)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <BrandingField label="TIN *"     value={form.tin}     placeholder="123-456-789-000"    onChange={v => set("tin", v)} />
        <BrandingField label="Website"   value={form.website} placeholder="www.example.ph"     onChange={v => set("website", v)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <BrandingField label="RDO Code"  value={form.rdo} placeholder="044" onChange={v => set("rdo", v)} />
        <BrandingField label="ZIP Code"  value={form.zip} placeholder="1550" onChange={v => set("zip", v)} />
        <div>
          <label className="field-label">Brand Colour *</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="color"
              value={form.color}
              onChange={e => set("color", e.target.value)}
              style={{ width: 38, height: 34, padding: 2, border: "1px solid oklch(var(--line))", borderRadius: 6, cursor: "pointer", background: "none" }}
            />
            <input
              type="text"
              className="field-input"
              value={form.color}
              onChange={e => set("color", e.target.value)}
              placeholder="#003087"
              style={{ flex: 1 }}
            />
          </div>
        </div>
      </div>

      {err && <p style={{ color: "oklch(var(--err))", fontSize: 12.5, margin: 0 }}>{err}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={pending || logoUploading}>
          {pending ? "Saving…" : "Save Branding"}
        </button>
        {saved && <span style={{ fontSize: 13, color: "oklch(0.50 0.10 155)" }}>✓ Saved — reload to see sidebar update</span>}
      </div>
    </form>
  );
}

// ── Appearance tab ────────────────────────────────────────────────────────────
const THEMES: { id: Theme; label: string; desc: string; preview: React.ReactNode }[] = [
  {
    id: "default",
    label: "Default",
    desc: "Light background, white cards, teal accent",
    preview: (
      <div style={{ display: "flex", height: 72, borderRadius: 6, overflow: "hidden", border: "1px solid #e5e7eb" }}>
        <div style={{ width: 36, background: "#f4f5f7" }} />
        <div style={{ flex: 1, background: "#f9fafb", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ height: 8, width: "60%", background: "#e2e4e9", borderRadius: 3 }} />
          <div style={{ height: 28, background: "#fff", borderRadius: 5, border: "1px solid #e5e7eb" }} />
          <div style={{ height: 8, width: "40%", background: "#e2e4e9", borderRadius: 3 }} />
        </div>
      </div>
    ),
  },
  {
    id: "dark-sidebar",
    label: "Dark Sidebar",
    desc: "Dark navigation rail, light content area",
    preview: (
      <div style={{ display: "flex", height: 72, borderRadius: 6, overflow: "hidden", border: "1px solid #e5e7eb" }}>
        <div style={{ width: 36, background: "#0d1117" }} />
        <div style={{ flex: 1, background: "#f9fafb", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ height: 8, width: "60%", background: "#e2e4e9", borderRadius: 3 }} />
          <div style={{ height: 28, background: "#fff", borderRadius: 5, border: "1px solid #e5e7eb" }} />
          <div style={{ height: 8, width: "40%", background: "#e2e4e9", borderRadius: 3 }} />
        </div>
      </div>
    ),
  },
  {
    id: "dark",
    label: "Dark",
    desc: "Full dark mode, easy on the eyes",
    preview: (
      <div style={{ display: "flex", height: 72, borderRadius: 6, overflow: "hidden", border: "1px solid #2d3748" }}>
        <div style={{ width: 36, background: "#0d1117" }} />
        <div style={{ flex: 1, background: "#161b22", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ height: 8, width: "60%", background: "#21262d", borderRadius: 3 }} />
          <div style={{ height: 28, background: "#1c2128", borderRadius: 5, border: "1px solid #30363d" }} />
          <div style={{ height: 8, width: "40%", background: "#21262d", borderRadius: 3 }} />
        </div>
      </div>
    ),
  },
];

function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ fontSize: 13, color: "oklch(var(--ink-2))", marginBottom: 20 }}>
        Choose a theme for your interface. Your preference is saved per device.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            style={{
              border: `2px solid ${theme === t.id ? "oklch(var(--accent))" : "oklch(var(--line))"}`,
              borderRadius: 10,
              padding: 12,
              background: theme === t.id ? "oklch(var(--accent-soft))" : "var(--panel)",
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <div style={{ marginBottom: 10 }}>{t.preview}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(var(--ink))", marginBottom: 3 }}>{t.label}</div>
            <div style={{ fontSize: 11.5, color: "oklch(var(--ink-3))" }}>{t.desc}</div>
            {theme === t.id && (
              <div style={{ marginTop: 8, fontSize: 11, color: "oklch(var(--accent-ink))", fontWeight: 600 }}>
                ✓ Active
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Agent QR code modal ──────────────────────────────────────────────────────
function QrModal({ user, appOrigin, onClose }: { user: UserRow; appOrigin: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qrToken, setQrToken] = useState(user.qrToken);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const url = qrToken ? `${window.location.protocol}//${appOrigin}/order/${qrToken}` : "";

  useEffect(() => {
    if (qrToken) renderQr(`${window.location.protocol}//${appOrigin}/order/${qrToken}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function renderQr(targetUrl: string) {
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(targetUrl, { width: 240, margin: 1 });
    setQrDataUrl(dataUrl);
  }

  function handleGenerate() {
    setErr("");
    start(async () => {
      try {
        const { qrToken: newToken } = await generateAgentQrToken(user.id);
        setQrToken(newToken);
        const newUrl = `${window.location.protocol}//${appOrigin}/order/${newToken}`;
        await renderQr(newUrl);
        router.refresh();
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <ModalBox title={`QR Code — ${user.name}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        {qrToken ? (
          <>
            {qrDataUrl && <img src={qrDataUrl} alt="QR code" style={{ width: 200, height: 200 }} />}
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <input className="field-input" value={url} readOnly style={{ fontSize: 11.5 }} />
              <button type="button" className="btn btn-sm" onClick={() => navigator.clipboard.writeText(url)}>Copy</button>
            </div>
            <p style={{ fontSize: 11.5, color: "oklch(var(--ink-3))", textAlign: "center" }}>
              Customers who scan this code land on a self-service order page attributed to {user.name}.
            </p>
          </>
        ) : (
          <p style={{ fontSize: 13, color: "oklch(var(--ink-3))", textAlign: "center" }}>
            No QR code has been generated for this agent yet.
          </p>
        )}
        {err && <p style={{ color: "oklch(var(--err))", fontSize: 12.5 }}>{err}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={handleGenerate}>
            {pending ? "Generating…" : qrToken ? "Regenerate (invalidates old code)" : "Generate QR Code"}
          </button>
        </div>
      </div>
    </ModalBox>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────
function UsersTab({ users, customers, currentUserId, appOrigin }: {
  users: UserRow[];
  customers: Customer[];
  currentUserId: string;
  appOrigin: string;
}) {
  const [modal, setModal] = useState<null | "create" | UserRow>(null);
  const [qrTarget, setQrTarget] = useState<UserRow | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"ALL" | Role>("ALL");

  const filtered = users.filter(u => {
    const matchRole = filterRole === "ALL" || u.role === filterRole;
    const q = search.toLowerCase();
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    return matchRole && matchSearch;
  });

  return (
    <>
      <div className="filters">
        <div className="search-box" style={{ width: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          className="field-input"
          style={{ width: 140, height: 32 }}
          value={filterRole}
          onChange={e => setFilterRole(e.target.value as "ALL" | Role)}
        >
          <option value="ALL">All roles</option>
          {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn btn-primary" onClick={() => setModal("create")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Add User
          </button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Linked To</th>
              <th>Status</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "24px 0", color: "oklch(var(--ink-3))" }}>No users found</td></tr>
            )}
            {filtered.map(u => (
              <tr key={u.id} style={{ cursor: "default", opacity: u.active ? 1 : 0.55 }}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center",
                      fontSize: 11, fontWeight: 600,
                      background: "oklch(var(--accent-soft))", color: "oklch(var(--accent-ink))",
                      flexShrink: 0,
                    }}>
                      {u.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                      <div style={{ fontSize: 11.5, color: "oklch(var(--ink-3))" }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="badge" style={{ cssText: ROLE_COLOR[u.role] } as React.CSSProperties}>
                    {u.role}
                  </span>
                </td>
                <td className="dim" style={{ fontSize: 12.5 }}>
                  {u.customer?.name ?? "—"}
                </td>
                <td>
                  <span className={`pill ${u.active ? "pill-DELIVERED" : "pill-CANCELLED"}`}>
                    {u.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="dim" style={{ fontSize: 12 }}>
                  {new Date(u.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                </td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {u.role === "AGENT" && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setQrTarget(u)}>QR Code</button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setModal(u)}>Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal === "create" && (
        <CreateModal
          customers={customers}
          onClose={() => setModal(null)}
        />
      )}
      {modal && modal !== "create" && (
        <EditModal
          user={modal as UserRow}
          customers={customers}
          currentUserId={currentUserId}
          onClose={() => setModal(null)}
        />
      )}
      {qrTarget && (
        <QrModal user={qrTarget} appOrigin={appOrigin} onClose={() => setQrTarget(null)} />
      )}
    </>
  );
}

// ── Inventory settings tab ────────────────────────────────────────────────────
function InventoryTab({ initial }: { initial: { warnDays: number; criticalDays: number } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [warnDays, setWarnDays] = useState(String(initial.warnDays));
  const [criticalDays, setCriticalDays] = useState(String(initial.criticalDays));
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setSaved(false);
    const warn = parseInt(warnDays);
    const crit = parseInt(criticalDays);
    if (isNaN(warn) || warn < 1) { setErr("Warning threshold must be at least 1 day"); return; }
    if (isNaN(crit) || crit < 1) { setErr("Critical threshold must be at least 1 day"); return; }
    if (crit >= warn) { setErr("Critical threshold must be less than warning threshold"); return; }
    start(async () => {
      try {
        await saveExpiryThresholds(warn, crit);
        setSaved(true);
        router.refresh();
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error saving settings"); }
    });
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-head"><span className="card-h">Expiry Date Thresholds</span></div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: "oklch(var(--ink-2))", marginBottom: 12 }}>
          Configure when near-expiry lots are flagged on the dashboard and Lots tab.
          The <strong>warning</strong> band turns amber; the <strong>critical</strong> band turns red.
        </p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="field-label">Warning threshold (days)</label>
              <input className="field-input" type="number" min="1" step="1" value={warnDays}
                onChange={e => { setWarnDays(e.target.value); setSaved(false); }} required />
              <p style={{ fontSize: 11, color: "oklch(var(--ink-3))", marginTop: 3 }}>
                Lots expiring within this many days appear in amber
              </p>
            </div>
            <div>
              <label className="field-label">Critical threshold (days)</label>
              <input className="field-input" type="number" min="1" step="1" value={criticalDays}
                onChange={e => { setCriticalDays(e.target.value); setSaved(false); }} required />
              <p style={{ fontSize: 11, color: "oklch(var(--ink-3))", marginTop: 3 }}>
                Lots expiring within this many days appear in red
              </p>
            </div>
          </div>

          <div style={{ padding: "10px 14px", borderRadius: 7, background: "oklch(var(--bg-2))", fontSize: 12.5, display: "flex", gap: 16 }}>
            <div>
              <span style={{ fontWeight: 600, color: "#d97706" }}>⚠ Warning</span>
              <span style={{ color: "oklch(var(--ink-3))", marginLeft: 4 }}>≤ {warnDays || "?"} days before expiry</span>
            </div>
            <div>
              <span style={{ fontWeight: 600, color: "#dc2626" }}>● Critical</span>
              <span style={{ color: "oklch(var(--ink-3))", marginLeft: 4 }}>≤ {criticalDays || "?"} days before expiry</span>
            </div>
          </div>

          {err && <p style={{ fontSize: 12.5, color: "oklch(var(--err))" }}>{err}</p>}
          {saved && <p style={{ fontSize: 12.5, color: "oklch(0.45 0.13 145)" }}>✓ Thresholds saved successfully</p>}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save Thresholds"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Security tab ──────────────────────────────────────────────────────────────
function SecurityTab({ initial }: { initial: { allowedOfficeIps: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [allowedOfficeIps, setAllowedOfficeIps] = useState(initial.allowedOfficeIps);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setSaved(false);
    start(async () => {
      try {
        await saveAccessSettings(allowedOfficeIps);
        setSaved(true);
        router.refresh();
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error saving settings"); }
    });
  }

  const isEnabled = allowedOfficeIps.trim().length > 0;

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-head"><span className="card-h">Login Restriction — Home Base Only</span></div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: "oklch(var(--ink-2))", marginBottom: 12 }}>
          Restrict login to specific office IP addresses. <strong>Agents and Drivers always bypass
          this</strong> (they log in from the field), as does any account flagged <strong>Owner</strong> in
          the Users tab. Leave blank to allow login from anywhere.
        </p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="field-label">Allowed Office IPs / CIDR Ranges</label>
            <textarea
              className="field-input" rows={3}
              placeholder="e.g. 203.0.113.5, 203.0.113.0/24"
              value={allowedOfficeIps}
              onChange={e => { setAllowedOfficeIps(e.target.value); setSaved(false); }}
            />
            <p style={{ fontSize: 11, color: "oklch(var(--ink-3))", marginTop: 3 }}>
              Comma-separated. Ask whoever manages your office internet for its public IP address.
            </p>
          </div>

          <div style={{ padding: "10px 14px", borderRadius: 7, background: "oklch(var(--bg-2))", fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: isEnabled ? "#dc2626" : "oklch(0.45 0.13 145)" }}>
              {isEnabled ? "● Restriction is ON" : "○ Restriction is OFF"}
            </span>
            <span style={{ color: "oklch(var(--ink-3))", marginLeft: 6 }}>
              {isEnabled ? "Non-exempt accounts can only log in from the listed IPs." : "Everyone can log in from anywhere."}
            </span>
          </div>

          {err && <p style={{ fontSize: 12.5, color: "oklch(var(--err))" }}>{err}</p>}
          {saved && <p style={{ fontSize: 12.5, color: "oklch(0.45 0.13 145)" }}>✓ Saved successfully</p>}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main SettingsClient ───────────────────────────────────────────────────────
export function SettingsClient({ users, customers, currentUserId, branding, expirySettings, appOrigin, accessSettings, relievers, canManageRelievers, isAdmin }: Props) {
  const [tab, setTab] = useState<"users" | "relievers" | "branding" | "inventory" | "security" | "appearance">(isAdmin ? "users" : "relievers");

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h1 style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>Settings</h1>
        <span style={{ fontSize: 12, color: "oklch(var(--ink-3))" }}>{users.length} users</span>
      </div>

      <div className="tabs">
        {isAdmin && (
          <>
            <button className="tab" aria-selected={tab === "users"} onClick={() => setTab("users")}>
              Users
              <span className="tab-count">{users.length}</span>
            </button>
            <button className="tab" aria-selected={tab === "branding"} onClick={() => setTab("branding")}>
              Branding
            </button>
            <button className="tab" aria-selected={tab === "inventory"} onClick={() => setTab("inventory")}>
              Inventory
            </button>
          </>
        )}
        {canManageRelievers && (
          <button className="tab" aria-selected={tab === "relievers"} onClick={() => setTab("relievers")}>
            Relievers
            <span className="tab-count">{relievers.filter(r => r.active).length}</span>
          </button>
        )}
        {isAdmin && (
          <>
            <button className="tab" aria-selected={tab === "security"} onClick={() => setTab("security")}>
              Security
            </button>
            <button className="tab" aria-selected={tab === "appearance"} onClick={() => setTab("appearance")}>
              Appearance
            </button>
          </>
        )}
      </div>

      {tab === "users" && isAdmin && (
        <UsersTab
          users={users}
          customers={customers}
          currentUserId={currentUserId}
          appOrigin={appOrigin}
        />
      )}
      {tab === "relievers" && canManageRelievers && <RelieversTab relievers={relievers} users={users} />}
      {tab === "branding" && isAdmin && <BrandingTab initial={branding} />}
      {tab === "inventory" && isAdmin && <InventoryTab initial={expirySettings} />}
      {tab === "security" && isAdmin && <SecurityTab initial={accessSettings} />}
      {tab === "appearance" && isAdmin && <AppearanceTab />}
    </div>
  );
}

// ── Relievers tab (item 11) ────────────────────────────────────────────────────
function RelieversTab({ relievers, users }: { relievers: RelieverRow[]; users: UserRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState("");
  const [originalUserId, setOriginalUserId] = useState("");
  const [relieverUserId, setRelieverUserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  // Warehouse staff are the people typically covered; anyone active can stand in.
  const warehouseUsers = users.filter(u => u.role === "WAREHOUSE" && u.active);
  const activeUsers = users.filter(u => u.active);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    startTransition(async () => {
      try {
        await createRelieverAssignment({ originalUserId, relieverUserId, startDate, endDate, notes: notes || undefined });
        setOriginalUserId(""); setRelieverUserId(""); setStartDate(""); setEndDate(""); setNotes("");
        router.refresh();
      } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this reliever assignment?")) return;
    startTransition(async () => {
      try { await deleteRelieverAssignment(id); router.refresh(); }
      catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card">
        <div className="card-head"><span className="card-h">Assign a Warehouse Reliever</span></div>
        <form onSubmit={submit} className="card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="field-label">Covering for (warehouse staff)</label>
            <select className="field-input" value={originalUserId} onChange={e => setOriginalUserId(e.target.value)} required>
              <option value="">— Select —</option>
              {warehouseUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Reliever (stand-in)</label>
            <select className="field-input" value={relieverUserId} onChange={e => setRelieverUserId(e.target.value)} required>
              <option value="">— Select —</option>
              {activeUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Start date</label>
            <input type="date" className="field-input" value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">End date</label>
            <input type="date" className="field-input" value={endDate} onChange={e => setEndDate(e.target.value)} required />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="field-label">Notes</label>
            <input className="field-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for coverage…" />
          </div>
          {err && <p style={{ gridColumn: "1 / -1", fontSize: 12.5, color: "oklch(var(--err))", margin: 0 }}>{err}</p>}
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Assign Reliever"}</button>
          </div>
        </form>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Covering For</th><th>Reliever</th><th>Start</th><th>End</th><th>Status</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {relievers.length === 0 && (
              <tr><td colSpan={7} className="empty-state" style={{ padding: "24px 0" }}>No reliever assignments.</td></tr>
            )}
            {relievers.map(r => (
              <tr key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
                <td>{r.originalUserName}</td>
                <td>{r.relieverUserName}</td>
                <td className="dim">{new Date(r.startDate).toLocaleDateString("en-PH")}</td>
                <td className="dim">{new Date(r.endDate).toLocaleDateString("en-PH")}</td>
                <td><span className={`pill ${r.active ? "pill-DELIVERED" : "pill-PENDING"}`}>{r.active ? "Active" : "Inactive"}</span></td>
                <td className="dim" style={{ fontSize: 12 }}>{r.notes ?? "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn btn-ghost btn-sm" style={{ color: "#dc2626" }} onClick={() => remove(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
