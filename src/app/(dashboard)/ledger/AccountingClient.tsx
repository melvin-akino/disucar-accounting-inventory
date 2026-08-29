"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { COA, COA_BY_CODE, computeTrialBalance } from "@/lib/coa";
import { HelpButton } from "@/components/HelpButton";
import { peso, shortPeso, fmtDate, fmtRel } from "@/lib/utils";
import type { JeSource, InvoiceStatus, BillStatus, BirStatus } from "@prisma/client";
import {
  createJournalEntry,
  recordInvoicePayment,
  recordBillPayment,
  markBirFiled,
  createBirFiling,
} from "./actions";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JournalLine { code: string; dr: number; cr: number }
interface JournalEntryData {
  id: string; date: string; source: JeSource; ref: string | null;
  memo: string; by: string; lines: JournalLine[];
}
interface InvoiceData {
  id: string; customerName: string; soId: string | null;
  issued: string; due: string; amount: number; paid: number; status: InvoiceStatus;
}
interface BillData {
  id: string; vendorName: string; ref: string | null; note: string | null;
  issued: string; due: string; amount: number; paid: number; status: BillStatus;
}
interface BirFilingData {
  id: string; form: string; period: string; desc: string;
  due: string; amount: number; status: BirStatus;
}

interface Props {
  journalEntries: JournalEntryData[];
  invoices: InvoiceData[];
  bills: BillData[];
  birFilings: BirFilingData[];
  trialBalance: Record<string, number>;
  coaLength: number;
  userRole: string;
}

type ModalState =
  | null
  | { type: "JE" }
  | { type: "PAY_INV"; invoice: InvoiceData }
  | { type: "PAY_BILL"; bill: BillData }
  | { type: "BIR"; filing: BirFilingData }
  | { type: "PRINT_FINANCIALS" }
  | { type: "CREATE_BIR" };

// ── Source chip ───────────────────────────────────────────────────────────────

const SOURCE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  AR:      { label: "AR",      bg: "oklch(0.95 0.03 145)", fg: "oklch(0.32 0.10 145)" },
  AP:      { label: "AP",      bg: "oklch(0.95 0.03 25)",  fg: "oklch(0.40 0.12 25)"  },
  BANK:    { label: "Bank",    bg: "oklch(0.95 0.03 240)", fg: "oklch(0.35 0.10 240)" },
  PAYROLL: { label: "Payroll", bg: "oklch(0.94 0.04 290)", fg: "oklch(0.36 0.12 290)" },
  INV:     { label: "Inv",     bg: "oklch(0.94 0.04 80)",  fg: "oklch(0.32 0.10 80)"  },
  GL:      { label: "GL",      bg: "oklch(0.94 0.01 250)", fg: "oklch(0.40 0.02 250)" },
  OPENING: { label: "Opening", bg: "oklch(0.94 0.01 250)", fg: "oklch(0.40 0.02 250)" },
};

function SourceChip({ source }: { source: string }) {
  const s = SOURCE_STYLE[source] ?? { label: source, bg: "oklch(var(--bg-2))", fg: "oklch(var(--ink-2))" };
  return (
    <span style={{ padding: "2px 7px", borderRadius: 3, fontSize: 11, background: s.bg, color: s.fg, fontWeight: 500, fontFamily: "var(--font-geist-mono, monospace)" }}>
      {s.label}
    </span>
  );
}

const INV_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  DRAFT:   { label: "Draft",   bg: "oklch(0.94 0.01 250)", fg: "oklch(0.40 0.02 250)" },
  OPEN:    { label: "Open",    bg: "oklch(0.95 0.03 240)", fg: "oklch(0.35 0.10 240)" },
  PARTIAL: { label: "Partial", bg: "oklch(0.94 0.04 80)",  fg: "oklch(0.32 0.10 80)"  },
  OVERDUE: { label: "Overdue", bg: "oklch(0.94 0.05 25)",  fg: "oklch(0.40 0.12 25)"  },
  PAID:    { label: "Paid",    bg: "oklch(0.94 0.04 145)", fg: "oklch(0.32 0.10 145)" },
};
const BILL_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  OPEN:    { label: "Open",     bg: "oklch(0.95 0.03 240)", fg: "oklch(0.35 0.10 240)" },
  DUE:     { label: "Due soon", bg: "oklch(0.94 0.04 80)",  fg: "oklch(0.32 0.10 80)"  },
  PARTIAL: { label: "Partial",  bg: "oklch(0.94 0.04 80)",  fg: "oklch(0.32 0.10 80)"  },
  OVERDUE: { label: "Overdue",  bg: "oklch(0.94 0.05 25)",  fg: "oklch(0.40 0.12 25)"  },
  PAID:    { label: "Paid",     bg: "oklch(0.94 0.04 145)", fg: "oklch(0.32 0.10 145)" },
};
const BIR_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  DUE:     { label: "Due",     bg: "oklch(0.94 0.05 25)",  fg: "oklch(0.40 0.12 25)"  },
  PENDING: { label: "Pending", bg: "oklch(0.94 0.04 80)",  fg: "oklch(0.32 0.10 80)"  },
  FILED:   { label: "Filed",   bg: "oklch(0.94 0.04 145)", fg: "oklch(0.32 0.10 145)" },
};

function StatusPill({ map, status }: { map: Record<string, { label: string; bg: string; fg: string }>; status: string }) {
  const s = map[status] ?? { label: status, bg: "oklch(var(--bg-2))", fg: "oklch(var(--ink-2))" };
  return (
    <span style={{ padding: "3px 9px", borderRadius: 4, fontSize: 11.5, background: s.bg, color: s.fg, fontWeight: 500 }}>
      {s.label}
    </span>
  );
}

// ── Modal primitives ──────────────────────────────────────────────────────────

function ModalBackdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}

function ModalBox({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ background: "oklch(var(--bg))", border: "1px solid oklch(var(--line))", borderRadius: 10, width: "min(720px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px oklch(0 0 0 / 0.25)" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid oklch(var(--line))", flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
        <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: 4, color: "oklch(var(--ink-3))" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>{children}</div>
    </div>
  );
}

// ── Journal Entry modal ───────────────────────────────────────────────────────

interface JeLine { code: string; dr: string; cr: string }

function NewJeModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<JeSource>("GL");
  const [ref, setRef]       = useState("");
  const [memo, setMemo]     = useState("");
  const [lines, setLines]   = useState<JeLine[]>([
    { code: "", dr: "", cr: "" },
    { code: "", dr: "", cr: "" },
  ]);
  const [error, setError] = useState<string | null>(null);

  const totalDr = lines.reduce((s, l) => s + (parseFloat(l.dr) || 0), 0);
  const totalCr = lines.reduce((s, l) => s + (parseFloat(l.cr) || 0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0;

  function setLine(i: number, key: keyof JeLine, val: string) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l));
  }

  function addLine()    { setLines((p) => [...p, { code: "", dr: "", cr: "" }]); }
  function removeLine(i: number) { setLines((p) => p.filter((_, idx) => idx !== i)); }

  function submit() {
    setError(null);
    const filled = lines.filter((l) => l.code && (parseFloat(l.dr) || 0) + (parseFloat(l.cr) || 0) > 0);
    startTransition(async () => {
      const res = await createJournalEntry({
        date,
        source,
        ref: ref || undefined,
        memo,
        lines: filled.map((l) => ({ code: l.code, dr: parseFloat(l.dr) || 0, cr: parseFloat(l.cr) || 0 })),
      });
      if (res.error) { setError(res.error); return; }
      router.refresh();
      onClose();
    });
  }

  const inp: React.CSSProperties = { border: "1px solid oklch(var(--line))", borderRadius: 5, padding: "6px 10px", fontSize: 13, background: "oklch(var(--bg))", color: "oklch(var(--ink))", width: "100%" };

  return (
    <ModalBox title="New journal entry" onClose={onClose}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={{ padding: "10px 14px", borderRadius: 6, background: "oklch(0.95 0.05 25)", color: "oklch(0.40 0.14 25)", fontSize: 13 }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            <div style={{ fontSize: 12, marginBottom: 4, color: "oklch(var(--ink-3))" }}>Date</div>
            <input type="date" style={inp} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            <div style={{ fontSize: 12, marginBottom: 4, color: "oklch(var(--ink-3))" }}>Source</div>
            <select style={inp} value={source} onChange={(e) => setSource(e.target.value as JeSource)}>
              {["AR", "AP", "BANK", "PAYROLL", "INV", "GL"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            <div style={{ fontSize: 12, marginBottom: 4, color: "oklch(var(--ink-3))" }}>Reference (optional)</div>
            <input style={inp} placeholder="SO#, invoice#, etc." value={ref} onChange={(e) => setRef(e.target.value)} />
          </label>
          <label>
            <div style={{ fontSize: 12, marginBottom: 4, color: "oklch(var(--ink-3))" }}>Memo</div>
            <input style={inp} placeholder="Description" value={memo} onChange={(e) => setMemo(e.target.value)} required />
          </label>
        </div>

        <div>
          <div style={{ fontSize: 12, marginBottom: 8, color: "oklch(var(--ink-3))" }}>Journal lines</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ fontSize: 11, color: "oklch(var(--ink-3))" }}>
                <th style={{ textAlign: "left", padding: "0 8px 6px 0", width: "40%" }}>Account</th>
                <th style={{ textAlign: "right", padding: "0 8px 6px", width: "25%" }}>Debit</th>
                <th style={{ textAlign: "right", padding: "0 8px 6px", width: "25%" }}>Credit</th>
                <th style={{ width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderTop: "1px solid oklch(var(--line))" }}>
                  <td style={{ padding: "4px 8px 4px 0" }}>
                    <select style={{ ...inp, fontSize: 12 }} value={l.code} onChange={(e) => setLine(i, "code", e.target.value)}>
                      <option value="">— select —</option>
                      {["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map((type) => (
                        <optgroup key={type} label={type}>
                          {COA.filter((a) => a.type === type).map((a) => (
                            <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "4px 8px" }}>
                    <input style={{ ...inp, textAlign: "right" }} placeholder="0.00" type="number" min="0" step="0.01" value={l.dr} onChange={(e) => { setLine(i, "dr", e.target.value); if (e.target.value) setLine(i, "cr", ""); }} />
                  </td>
                  <td style={{ padding: "4px 8px" }}>
                    <input style={{ ...inp, textAlign: "right" }} placeholder="0.00" type="number" min="0" step="0.01" value={l.cr} onChange={(e) => { setLine(i, "cr", e.target.value); if (e.target.value) setLine(i, "dr", ""); }} />
                  </td>
                  <td style={{ padding: "4px 0 4px 4px" }}>
                    {lines.length > 2 && (
                      <button onClick={() => removeLine(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--ink-3))", padding: 4 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: "1.5px solid oklch(var(--ink))" }}>
                <td style={{ padding: "8px 8px 4px 0", fontSize: 12, fontWeight: 600 }}>Totals</td>
                <td style={{ padding: "8px 8px 4px", textAlign: "right", fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>{peso(totalDr)}</td>
                <td style={{ padding: "8px 8px 4px", textAlign: "right", fontSize: 13, fontWeight: 600, fontFamily: "monospace" }}>{peso(totalCr)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} style={{ padding: "4px 0 0", fontSize: 12 }}>
                  {balanced
                    ? <span style={{ color: "oklch(0.45 0.12 145)" }}>✓ Balanced</span>
                    : totalDr > 0 && <span style={{ color: "oklch(0.40 0.14 25)" }}>Difference: {peso(Math.abs(totalDr - totalCr))}</span>
                  }
                </td>
              </tr>
            </tbody>
          </table>
          <button onClick={addLine} style={{ marginTop: 8, background: "none", border: "1px dashed oklch(var(--line))", borderRadius: 5, padding: "6px 14px", fontSize: 12, cursor: "pointer", color: "oklch(var(--ink-3))", width: "100%" }}>
            + Add line
          </button>
        </div>
      </div>

      <div style={{ padding: "14px 20px", borderTop: "1px solid oklch(var(--line))", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={!balanced || !memo || isPending}>
          {isPending ? "Posting…" : "Post journal entry"}
        </button>
      </div>
    </ModalBox>
  );
}

// ── Payment modal ─────────────────────────────────────────────────────────────

const PAYMENT_TYPES = ["CASH", "CHECK", "BANK_TRANSFER", "GCASH", "OTHER"] as const;

function PayModal({ title, balance, id, type, onClose }: { title: string; balance: number; id: string; type: "INV" | "BILL"; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [paymentType, setPaymentType] = useState<typeof PAYMENT_TYPES[number]>("CASH");
  const [bankName, setBankName] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const needsBankDetails = paymentType === "BANK_TRANSFER" || paymentType === "CHECK";

  function submit() {
    setError(null);
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    if (amt > balance + 0.01) { setError(`Amount exceeds outstanding balance of ${peso(balance)}.`); return; }
    const details = {
      paymentType,
      bankName: bankName || undefined,
      transferDate: transferDate || undefined,
      referenceNo: referenceNo || undefined,
    };
    startTransition(async () => {
      const res = type === "INV" ? await recordInvoicePayment(id, amt, details) : await recordBillPayment(id, amt, details);
      if (res.error) { setError(res.error); return; }
      router.refresh();
      onClose();
    });
  }

  const inp: React.CSSProperties = { border: "1px solid oklch(var(--line))", borderRadius: 5, padding: "8px 12px", fontSize: 14, background: "oklch(var(--bg))", color: "oklch(var(--ink))", width: "100%" };

  return (
    <ModalBox title={title} onClose={onClose}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={{ padding: "10px 14px", borderRadius: 6, background: "oklch(0.95 0.05 25)", color: "oklch(0.40 0.14 25)", fontSize: 13 }}>{error}</div>}
        <div style={{ padding: "12px 16px", borderRadius: 6, background: "oklch(var(--bg-2))", fontSize: 13 }}>
          Outstanding balance: <strong style={{ fontFamily: "monospace" }}>{peso(balance)}</strong>
        </div>
        <label>
          <div style={{ fontSize: 12, marginBottom: 6, color: "oklch(var(--ink-3))" }}>Payment amount (PHP)</div>
          <input type="number" style={inp} min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          <div style={{ fontSize: 12, marginBottom: 6, color: "oklch(var(--ink-3))" }}>Payment type</div>
          <select style={inp} value={paymentType} onChange={(e) => setPaymentType(e.target.value as typeof PAYMENT_TYPES[number])}>
            {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </label>
        {needsBankDetails && (
          <>
            <label>
              <div style={{ fontSize: 12, marginBottom: 6, color: "oklch(var(--ink-3))" }}>Bank</div>
              <input style={inp} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. BPI, BDO, Metrobank" />
            </label>
            <label>
              <div style={{ fontSize: 12, marginBottom: 6, color: "oklch(var(--ink-3))" }}>Date of transfer</div>
              <input type="date" style={inp} value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: 12, marginBottom: 6, color: "oklch(var(--ink-3))" }}>Reference / Check no.</div>
              <input style={inp} value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Optional" />
            </label>
          </>
        )}
        <p style={{ fontSize: 12, color: "oklch(var(--ink-3))", margin: 0 }}>
          A bank journal entry (Dr {type === "INV" ? "Cash in Bank / Cr AR" : "AP / Cr Cash in Bank"}) will be posted automatically.
        </p>
      </div>
      <div style={{ padding: "14px 20px", borderTop: "1px solid oklch(var(--line))", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={isPending}>{isPending ? "Recording…" : "Record payment"}</button>
      </div>
    </ModalBox>
  );
}

// ── BIR filing modal ──────────────────────────────────────────────────────────

function BirModal({ filing, onClose }: { filing: BirFilingData; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [refNo, setRefNo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    startTransition(async () => {
      const res = await markBirFiled(filing.id, refNo);
      if (res.error) { setError(res.error); return; }
      router.refresh();
      onClose();
    });
  }

  const inp: React.CSSProperties = { border: "1px solid oklch(var(--line))", borderRadius: 5, padding: "8px 12px", fontSize: 14, background: "oklch(var(--bg))", color: "oklch(var(--ink))", width: "100%" };

  return (
    <ModalBox title={`Mark filed — ${filing.form}`} onClose={onClose}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div style={{ padding: "10px 14px", borderRadius: 6, background: "oklch(0.95 0.05 25)", color: "oklch(0.40 0.14 25)", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div><div style={{ fontSize: 11, color: "oklch(var(--ink-3))" }}>Form</div><div style={{ fontWeight: 500, marginTop: 2 }}>{filing.form}</div></div>
          <div><div style={{ fontSize: 11, color: "oklch(var(--ink-3))" }}>Period</div><div style={{ fontWeight: 500, marginTop: 2 }}>{filing.period}</div></div>
          <div><div style={{ fontSize: 11, color: "oklch(var(--ink-3))" }}>Tax due</div><div style={{ fontWeight: 500, marginTop: 2, fontFamily: "monospace" }}>{peso(filing.amount)}</div></div>
        </div>
        <label>
          <div style={{ fontSize: 12, marginBottom: 6, color: "oklch(var(--ink-3))" }}>eFPS confirmation / reference number (optional)</div>
          <input style={inp} placeholder="e.g. 202504-0619E-00123" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
        </label>
      </div>
      <div style={{ padding: "14px 20px", borderTop: "1px solid oklch(var(--line))", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={isPending}>{isPending ? "Saving…" : "Mark as filed"}</button>
      </div>
    </ModalBox>
  );
}

// ── Print Financials date-picker modal ───────────────────────────────────────

function PrintFinancialsModal({ onClose }: { onClose: () => void }) {
  const thisYear = new Date().getFullYear();
  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to,   setTo  ] = useState(new Date().toISOString().slice(0, 10));

  const inp: React.CSSProperties = { border: "1px solid oklch(var(--line))", borderRadius: 5, padding: "8px 10px", fontSize: 13, background: "oklch(var(--bg))", color: "oklch(var(--ink))", width: "100%" };

  return (
    <ModalBox title="Print Financial Statements" onClose={onClose}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 13, color: "oklch(var(--ink-2))", margin: 0 }}>
          Select the date range for the Income Statement and Balance Sheet. Leave as-is for year-to-date.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, marginBottom: 5, color: "oklch(var(--ink-3))" }}>From</div>
            <input type="date" style={inp} value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, marginBottom: 5, color: "oklch(var(--ink-3))" }}>To</div>
            <input type="date" style={inp} value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
      </div>
      <div style={{ padding: "14px 20px", borderTop: "1px solid oklch(var(--line))", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <a
          href={`/print/financials?from=${from}&to=${to}`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-primary"
          onClick={onClose}
        >
          Open PDF ↗
        </a>
      </div>
    </ModalBox>
  );
}

// ── Create BIR Filing modal ───────────────────────────────────────────────────

const BIR_FORM_OPTS = [
  { value: "2550M",  label: "2550M — Monthly VAT Declaration" },
  { value: "2550Q",  label: "2550Q — Quarterly VAT Return" },
  { value: "1601C",  label: "1601-C — Monthly Withholding (Compensation)" },
  { value: "1601EQ", label: "1601-EQ — Quarterly Withholding (Expanded)" },
  { value: "1702RT", label: "1702-RT — Annual Corporate Income Tax" },
];

function CreateBirModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form,   setForm  ] = useState("2550M");
  const [from,   setFrom  ] = useState("");
  const [to,     setTo    ] = useState("");
  const [amount, setAmount] = useState("");
  const [err,    setErr   ] = useState("");

  const inp: React.CSSProperties = { border: "1px solid oklch(var(--line))", borderRadius: 5, padding: "8px 10px", fontSize: 13, background: "oklch(var(--bg))", color: "oklch(var(--ink))", width: "100%" };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!from || !to) { setErr("Period dates are required."); return; }
    startTransition(async () => {
      const res = await createBirFiling({
        form,
        periodFrom: from,
        periodTo:   to,
        amount:     amount ? parseFloat(amount) : 0,
      });
      if (res.error) { setErr(res.error); return; }
      router.refresh();
      onClose();
    });
  }

  return (
    <ModalBox title="Schedule BIR Filing" onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 13, color: "oklch(var(--ink-2))", margin: 0 }}>
            Tax amount will be auto-computed from journal entries in the period if left blank.
          </p>
          <div>
            <div style={{ fontSize: 11.5, marginBottom: 5, color: "oklch(var(--ink-3))" }}>Form type *</div>
            <select style={inp} value={form} onChange={e => setForm(e.target.value)}>
              {BIR_FORM_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11.5, marginBottom: 5, color: "oklch(var(--ink-3))" }}>Period from *</div>
              <input type="date" style={inp} value={from} onChange={e => setFrom(e.target.value)} required />
            </div>
            <div>
              <div style={{ fontSize: 11.5, marginBottom: 5, color: "oklch(var(--ink-3))" }}>Period to *</div>
              <input type="date" style={inp} value={to} onChange={e => setTo(e.target.value)} required />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, marginBottom: 5, color: "oklch(var(--ink-3))" }}>Tax amount (leave blank to auto-compute)</div>
            <input type="number" step="0.01" min="0" style={inp} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 12500.00" />
          </div>
          {err && <div style={{ padding: "10px 14px", borderRadius: 6, background: "oklch(0.95 0.05 25)", color: "oklch(0.40 0.14 25)", fontSize: 13 }}>{err}</div>}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid oklch(var(--line))", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Scheduling…" : "Schedule Filing"}
          </button>
        </div>
      </form>
    </ModalBox>
  );
}

// ── Main client ───────────────────────────────────────────────────────────────

const TABS = [
  ["OVERVIEW",   "Overview"],
  ["JOURNAL",    "Journal"],
  ["LEDGER",     "General ledger"],
  ["AR",         "Receivables"],
  ["AP",         "Payables"],
  ["TRIAL",      "Trial balance"],
  ["STATEMENTS", "Statements"],
  ["BIR",        "BIR filings"],
] as const;

export function AccountingClient({ journalEntries, invoices, bills, birFilings, trialBalance, coaLength, userRole }: Props) {
  const [tab, setTab]     = useState<typeof TABS[number][0]>("OVERVIEW");
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <div>
      {modal?.type === "JE" && (
        <ModalBackdrop onClose={() => setModal(null)}>
          <NewJeModal onClose={() => setModal(null)} />
        </ModalBackdrop>
      )}
      {modal?.type === "PAY_INV" && (
        <ModalBackdrop onClose={() => setModal(null)}>
          <PayModal
            title={`Record payment — ${modal.invoice.id}`}
            balance={modal.invoice.amount - modal.invoice.paid}
            id={modal.invoice.id}
            type="INV"
            onClose={() => setModal(null)}
          />
        </ModalBackdrop>
      )}
      {modal?.type === "PAY_BILL" && (
        <ModalBackdrop onClose={() => setModal(null)}>
          <PayModal
            title={`Pay bill — ${modal.bill.id}`}
            balance={modal.bill.amount - modal.bill.paid}
            id={modal.bill.id}
            type="BILL"
            onClose={() => setModal(null)}
          />
        </ModalBackdrop>
      )}
      {modal?.type === "BIR" && (
        <ModalBackdrop onClose={() => setModal(null)}>
          <BirModal filing={modal.filing} onClose={() => setModal(null)} />
        </ModalBackdrop>
      )}
      {modal?.type === "PRINT_FINANCIALS" && (
        <ModalBackdrop onClose={() => setModal(null)}>
          <PrintFinancialsModal onClose={() => setModal(null)} />
        </ModalBackdrop>
      )}
      {modal?.type === "CREATE_BIR" && (
        <ModalBackdrop onClose={() => setModal(null)}>
          <CreateBirModal onClose={() => setModal(null)} />
        </ModalBackdrop>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] font-semibold">Accounting</h1>
            <HelpButton slug="accounting" label="Help: Accounting" />
          </div>
          <p className="text-[12px]" style={{ color: "oklch(var(--ink-3))" }}>
            General ledger · AR / AP · BIR compliance · {coaLength} accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/export/journal" className="btn btn-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export GL
          </a>
          <button className="btn btn-sm" onClick={() => setModal({ type: "PRINT_FINANCIALS" })}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print Financials
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: "JE" })}>+ New journal entry</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "OVERVIEW"   && <OverviewTab je={journalEntries} invoices={invoices} bills={bills} bir={birFilings} tb={trialBalance} />}
      {tab === "JOURNAL"    && <JournalTab je={journalEntries} onNewJe={() => setModal({ type: "JE" })} />}
      {tab === "LEDGER"     && <GeneralLedgerTab je={journalEntries} tb={trialBalance} />}
      {tab === "AR"         && <ReceivablesTab invoices={invoices} onPayInv={(inv) => setModal({ type: "PAY_INV", invoice: inv })} />}
      {tab === "AP"         && <PayablesTab bills={bills} onPayBill={(b) => setModal({ type: "PAY_BILL", bill: b })} />}
      {tab === "TRIAL"      && <TrialBalanceTab tb={trialBalance} userRole={userRole} />}
      {tab === "STATEMENTS" && <StatementsTab tb={trialBalance} />}
      {tab === "BIR"        && <BirTab filings={birFilings} onFile={(f) => setModal({ type: "BIR", filing: f })} onSchedule={() => setModal({ type: "CREATE_BIR" })} />}
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab({ je, invoices, bills, bir, tb }: { je: JournalEntryData[]; invoices: InvoiceData[]; bills: BillData[]; bir: BirFilingData[]; tb: Record<string, number> }) {
  const cash = (tb["1000"] ?? 0) + (tb["1010"] ?? 0) + (tb["1020"] ?? 0);
  const ar = tb["1100"] ?? 0;
  const ap = -(tb["2000"] ?? 0);
  const revenue = -(tb["4000"] ?? 0);
  const cogs = tb["5000"] ?? 0;
  const opex = (tb["5100"] ?? 0) + (tb["5200"] ?? 0) + (tb["5300"] ?? 0) + (tb["5400"] ?? 0) + (tb["5500"] ?? 0) + (tb["5600"] ?? 0) + (tb["5700"] ?? 0);
  const gm = revenue - cogs;
  const ni = gm - opex;

  const arOverdue = invoices.filter((i) => i.status === "OVERDUE").reduce((s, i) => s + (i.amount - i.paid), 0);
  const apOverdue = bills.filter((b) => b.status === "OVERDUE").reduce((s, b) => s + (b.amount - b.paid), 0);
  const birDue = bir.filter((b) => b.status === "DUE").length;

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Cash position"       value={shortPeso(cash)} trend="3 bank accounts" />
        <StatCard label="Net income (YTD)"    value={shortPeso(ni)}   trend={`${revenue > 0 ? (ni / revenue * 100).toFixed(1) : 0}% margin`} />
        <StatCard label="Accounts receivable" value={shortPeso(ar)}   trend={arOverdue > 0 ? `${shortPeso(arOverdue)} overdue` : "All current"} warn={arOverdue > 0} />
        <StatCard label="Accounts payable"    value={shortPeso(ap)}   trend={apOverdue > 0 ? `${shortPeso(apOverdue)} overdue` : "All current"} warn={apOverdue > 0} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <span className="card-h">P&amp;L summary · YTD</span>
            <span className="text-[12px] ml-auto" style={{ color: "oklch(var(--ink-3))" }}>Through {fmtDate(new Date().toISOString())}</span>
          </div>
          <div className="card-body">
            <PLBar label="Revenue"             value={revenue} max={revenue} color="oklch(0.55 0.13 145)" />
            <PLBar label="Cost of goods sold"  value={cogs}    max={revenue} sign="-" color="oklch(0.55 0.14 25)" />
            <div className="divider" />
            <PLBar label="Gross margin"        value={gm}      max={revenue} color="oklch(var(--ink))" bold />
            <PLBar label="Operating expenses"  value={opex}    max={revenue} sign="-" color="oklch(0.55 0.10 80)" />
            <div style={{ borderTop: "1.5px solid oklch(var(--ink))", marginTop: 8, paddingTop: 8 }}>
              <PLBar label="Net income" value={ni} max={revenue} color="oklch(var(--ink))" bold />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-h">Action items</span></div>
          <div style={{ padding: 0 }}>
            <ActionItem tone="warn" title={`${invoices.filter((i) => i.status === "OVERDUE").length} overdue invoices`}  sub={`${shortPeso(arOverdue)} past due — collections needed`} />
            <ActionItem tone="info" title={`${birDue} BIR filings due this period`}                                      sub="Review and e-file via eFPS" />
            <ActionItem tone="warn" title={`${bills.filter((b) => b.status === "OVERDUE").length} bills past due`}        sub={`${shortPeso(apOverdue)} — supplier follow-up`} />
            <ActionItem tone="ok"   title="Month-end entries posted"                                                     sub="All journals posted · awaiting review" last />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-h">Recent journal activity</span></div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0, borderTop: "1px solid oklch(var(--line))" }}>
          <table className="tbl">
            <thead><tr>
              <th className="id">JE #</th><th>When</th><th>Source</th>
              <th>Memo</th><th>Reference</th>
              <th className="num">Amount</th>
            </tr></thead>
            <tbody>
              {je.slice(0, 6).map((j) => {
                const sumDr = j.lines.reduce((s, l) => s + l.dr, 0);
                return (
                  <tr key={j.id} style={{ cursor: "default" }}>
                    <td className="id">{j.id}</td>
                    <td className="dim">{fmtRel(j.date)}</td>
                    <td><SourceChip source={j.source} /></td>
                    <td>{j.memo}</td>
                    <td className="dim" style={{ fontSize: 11.5 }}>{j.ref ?? "—"}</td>
                    <td className="num">{peso(sumDr)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, trend, warn }: { label: string; value: string; trend: string; warn?: boolean }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-trend" style={warn ? { color: "oklch(0.50 0.14 25)" } : undefined}>{trend}</div>
    </div>
  );
}

function PLBar({ label, value, max, sign = "+", color, bold }: { label: string; value: number; max: number; sign?: string; color: string; bold?: boolean }) {
  const pct = max > 0 ? Math.min(Math.abs(value) / max, 1) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="flex justify-between mb-1">
        <span style={{ fontSize: 13, fontWeight: bold ? 500 : 400 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: bold ? 600 : 500, fontFamily: "var(--font-geist-mono, monospace)" }}>
          {sign === "-" ? "(" : ""}{peso(value)}{sign === "-" ? ")" : ""}
        </span>
      </div>
      <div className="pl-bar-track" style={{ height: bold ? 6 : 4 }}>
        <div className="pl-bar-fill" style={{ width: `${pct * 100}%`, background: color, opacity: bold ? 1 : 0.7 }} />
      </div>
    </div>
  );
}

function ActionItem({ tone, title, sub, last }: { tone: "warn" | "info" | "ok"; title: string; sub: string; last?: boolean }) {
  const fg = { warn: "oklch(0.55 0.14 25)", info: "oklch(0.55 0.14 240)", ok: "oklch(0.45 0.12 145)" }[tone];
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: last ? "none" : "1px solid oklch(var(--line))" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: fg, marginTop: 5, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12, color: "oklch(var(--ink-3))", marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

// ── Journal ───────────────────────────────────────────────────────────────────

function JournalTab({ je, onNewJe }: { je: JournalEntryData[]; onNewJe: () => void }) {
  const [search, setSearch] = useState("");
  const [src, setSrc]       = useState("ALL");
  const [openId, setOpenId] = useState<string | null>(null);

  const sources = ["ALL", "AR", "AP", "BANK", "PAYROLL", "INV", "GL"];
  const filtered = je.filter((j) => {
    if (src !== "ALL" && j.source !== src) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return j.id.toLowerCase().includes(s) || j.memo.toLowerCase().includes(s) || (j.ref ?? "").toLowerCase().includes(s);
  });

  return (
    <div>
      <div className="filters">
        <div className="search-box" style={{ width: 320 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input placeholder="JE #, memo, or reference…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {sources.map((s) => (
          <button key={s} className="chip" aria-pressed={src === s} onClick={() => setSrc(s)}>
            {s === "ALL" ? "All sources" : s}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "oklch(var(--ink-3))" }}>{filtered.length} entries</span>
          <button className="btn btn-primary btn-sm" onClick={onNewJe}>+ New entry</button>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((j) => {
          const sumDr = j.lines.reduce((s, l) => s + l.dr, 0);
          const isOpen = openId === j.id;
          return (
            <div key={j.id} className="je-card">
              <button className="je-head" onClick={() => setOpenId(isOpen ? null : j.id)}>
                <span className="id text-[12px]" style={{ fontFamily: "var(--font-geist-mono, monospace)" }}>{j.id}</span>
                <SourceChip source={j.source} />
                <span style={{ fontWeight: 500, fontSize: 13 }}>{j.memo}</span>
                <span className="dim" style={{ fontSize: 11.5 }}>{j.ref ?? ""}</span>
                <span className="ml-auto flex items-center gap-4">
                  <span className="text-[12px]" style={{ color: "oklch(var(--ink-3))" }}>{fmtRel(j.date)}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "var(--font-geist-mono, monospace)" }}>{peso(sumDr)}</span>
                  <svg className="je-chevron" data-open={isOpen ? "1" : "0"} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                </span>
              </button>
              {isOpen && (
                <div className="je-body">
                  <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}>
                    <table className="tbl je-lines">
                      <thead><tr>
                        <th className="id">Account</th><th>Name</th>
                        <th className="num">Debit</th><th className="num">Credit</th>
                      </tr></thead>
                      <tbody>
                        {j.lines.map((l, i) => {
                          const a = COA_BY_CODE[l.code];
                          return (
                            <tr key={i} style={{ cursor: "default" }}>
                              <td className="id">{l.code}</td>
                              <td>{a?.name ?? l.code}</td>
                              <td className="num" style={{ color: l.dr ? "oklch(var(--ink))" : "oklch(var(--ink-4))" }}>{l.dr ? peso(l.dr) : "—"}</td>
                              <td className="num" style={{ color: l.cr ? "oklch(var(--ink))" : "oklch(var(--ink-4))" }}>{l.cr ? peso(l.cr) : "—"}</td>
                            </tr>
                          );
                        })}
                        <tr style={{ borderTop: "1.5px solid oklch(var(--ink))", cursor: "default" }}>
                          <td colSpan={2} style={{ fontWeight: 500 }}>Totals</td>
                          <td className="num" style={{ fontWeight: 600 }}>{peso(sumDr)}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{peso(sumDr)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="je-foot">
                    <span className="text-[12px]" style={{ color: "oklch(var(--ink-3))" }}>Posted by {j.by} · {fmtDate(j.date)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            No journal entries found
          </div>
        )}
      </div>
    </div>
  );
}

// ── General Ledger ────────────────────────────────────────────────────────────

function GeneralLedgerTab({ je, tb }: { je: JournalEntryData[]; tb: Record<string, number> }) {
  const [acct, setAcct]           = useState("1100");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const types = ["ALL", "ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
  const visibleAccts = COA.filter((a) => typeFilter === "ALL" || a.type === typeFilter);
  const a = COA_BY_CODE[acct];

  const movements: (JournalEntryData & { dr: number; cr: number })[] = [];
  [...je].reverse().forEach((j) => {
    j.lines.forEach((l) => { if (l.code === acct) movements.push({ ...j, dr: l.dr, cr: l.cr }); });
  });

  const periodMoved = movements.reduce((s, m) => s + m.dr - m.cr, 0);
  const openingBal = (tb[acct] ?? 0) - periodMoved;
  let running = openingBal;
  const rows = movements.map((m) => { running += m.dr - m.cr; return { ...m, running }; });
  const ending = tb[acct] ?? 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
      <div className="card" style={{ padding: 0, maxHeight: 640, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid oklch(var(--line))" }}>
          <div className="card-h mb-2">Chart of accounts</div>
          <div className="flex flex-wrap gap-1">
            {types.map((t) => (
              <button key={t} className="chip" style={{ fontSize: 10 }} aria-pressed={typeFilter === t} onClick={() => setTypeFilter(t)}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {visibleAccts.map((x) => (
            <button key={x.code} className="coa-row" data-active={x.code === acct ? "1" : "0"} onClick={() => setAcct(x.code)}>
              <span style={{ fontSize: 12, fontFamily: "var(--font-geist-mono, monospace)" }}>{x.code}</span>
              <span style={{ fontSize: 12.5, flex: 1 }}>{x.name}</span>
              <span style={{ fontSize: 11, fontFamily: "var(--font-geist-mono, monospace)", color: "oklch(var(--ink-3))" }}>{peso(tb[x.code] ?? 0)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-h">{a?.code} · {a?.name}</div>
            <div style={{ fontSize: 12, color: "oklch(var(--ink-3))", marginTop: 2 }}>{a?.type} · normal balance: {a?.normal}</div>
          </div>
          <div className="ml-auto text-right">
            <div style={{ fontSize: 11, color: "oklch(var(--ink-3))" }}>Ending balance</div>
            <div style={{ fontSize: 18, fontWeight: 500, fontFamily: "var(--font-geist-mono, monospace)" }}>{peso(ending)}</div>
          </div>
        </div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0, borderTop: "1px solid oklch(var(--line))" }}>
          <table className="tbl">
            <thead><tr>
              <th>Date</th><th className="id">JE #</th><th>Memo</th>
              <th className="num">Debit</th><th className="num">Credit</th><th className="num">Running</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6}><div className="empty-state">No activity in period.</div></td></tr>}
              {rows.map((m, i) => (
                <tr key={m.id + "-" + i} style={{ cursor: "default" }}>
                  <td>{fmtDate(m.date)}</td>
                  <td className="id">{m.id}</td>
                  <td>{m.memo}</td>
                  <td className="num" style={{ color: m.dr ? "oklch(var(--ink))" : "oklch(var(--ink-4))" }}>{m.dr ? peso(m.dr) : "—"}</td>
                  <td className="num" style={{ color: m.cr ? "oklch(var(--ink))" : "oklch(var(--ink-4))" }}>{m.cr ? peso(m.cr) : "—"}</td>
                  <td className="num" style={{ fontWeight: 500 }}>{peso(m.running)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Receivables ───────────────────────────────────────────────────────────────

function ReceivablesTab({ invoices, onPayInv }: { invoices: InvoiceData[]; onPayInv: (i: InvoiceData) => void }) {
  const [sub, setSub]       = useState("OPEN");
  const [search, setSearch] = useState("");
  const today = new Date();

  const counts = {
    ALL:     invoices.length,
    OPEN:    invoices.filter((i) => ["OPEN", "PARTIAL", "OVERDUE", "DRAFT"].includes(i.status)).length,
    OVERDUE: invoices.filter((i) => i.status === "OVERDUE").length,
    PAID:    invoices.filter((i) => i.status === "PAID").length,
  };
  const filtered = invoices.filter((i) => {
    if (sub === "OPEN"    && !["OPEN", "PARTIAL", "OVERDUE", "DRAFT"].includes(i.status)) return false;
    if (sub === "OVERDUE" && i.status !== "OVERDUE") return false;
    if (sub === "PAID"    && i.status !== "PAID") return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return i.id.toLowerCase().includes(s) || i.customerName.toLowerCase().includes(s) || (i.soId ?? "").toLowerCase().includes(s);
  });

  const buckets = { current: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
  invoices.forEach((i) => {
    if (i.status === "PAID") return;
    const bal = i.amount - i.paid;
    const days = Math.floor((today.getTime() - new Date(i.due).getTime()) / 86400000);
    if (days <= 0) buckets.current += bal;
    else if (days <= 30) buckets.b1 += bal;
    else if (days <= 60) buckets.b2 += bal;
    else if (days <= 90) buckets.b3 += bal;
    else buckets.b4 += bal;
  });
  const totalOpen = Object.values(buckets).reduce((s, v) => s + v, 0);

  return (
    <div>
      <div className="card mb-4">
        <div className="card-head">
          <span className="card-h">AR aging</span>
          <span className="text-[12px] ml-auto" style={{ color: "oklch(var(--ink-3))" }}>As of {fmtDate(new Date().toISOString())}</span>
        </div>
        <div className="card-body" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {[
            { label: "Current",    val: buckets.current, color: "oklch(0.55 0.13 145)" },
            { label: "1–30 days",  val: buckets.b1,      color: "oklch(0.62 0.10 80)"  },
            { label: "31–60 days", val: buckets.b2,      color: "oklch(0.55 0.13 50)"  },
            { label: "61–90 days", val: buckets.b3,      color: "oklch(0.55 0.14 25)"  },
            { label: "90+ days",   val: buckets.b4,      color: "oklch(0.45 0.16 25)"  },
          ].map((b) => (
            <div key={b.label} style={{ borderLeft: `3px solid ${b.color}`, paddingLeft: 12 }}>
              <div style={{ fontSize: 11.5, color: "oklch(var(--ink-3))" }}>{b.label}</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginTop: 2, fontFamily: "var(--font-geist-mono, monospace)" }}>{peso(b.val)}</div>
              <div style={{ fontSize: 11, marginTop: 1, color: "oklch(var(--ink-3))" }}>{totalOpen > 0 ? Math.round(b.val / totalOpen * 100) : 0}% of open</div>
            </div>
          ))}
        </div>
      </div>

      <div className="tabs">
        {[["OPEN", "Open", counts.OPEN], ["OVERDUE", "Overdue", counts.OVERDUE], ["PAID", "Paid", counts.PAID], ["ALL", "All", counts.ALL]].map(([k, l, n]) => (
          <button key={k} className="tab" aria-selected={sub === k} onClick={() => setSub(k as string)}>{l} <span className="tab-count">{n}</span></button>
        ))}
      </div>

      <div className="filters">
        <div className="search-box" style={{ width: 320 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input placeholder="Invoice, customer, or SO…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <a href="/api/export/receivables" className="btn btn-sm ml-auto">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </a>
      </div>

      <div className="tbl-wrap" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr>
            <th className="id">Invoice</th><th>Customer</th><th className="id">SO</th>
            <th>Issued</th><th>Due</th>
            <th className="num">Amount</th><th className="num">Paid</th><th className="num">Balance</th>
            <th>Status</th><th style={{ minWidth: 160 }}></th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10}><div className="empty-state">No invoices</div></td></tr>}
            {filtered.map((i) => {
              const balance = i.amount - i.paid;
              const days = Math.floor((today.getTime() - new Date(i.due).getTime()) / 86400000);
              const overdue = i.status === "OVERDUE";
              return (
                <tr key={i.id} style={{ cursor: "default" }}>
                  <td className="id">{i.id}</td>
                  <td>{i.customerName}</td>
                  <td className="id">{i.soId ?? "—"}</td>
                  <td className="dim">{fmtDate(i.issued)}</td>
                  <td style={overdue ? { color: "var(--st-cancel-fg)", fontWeight: 500 } : {}}>
                    {fmtDate(i.due)}{overdue && days > 0 && <span className="ml-1 text-[11px] opacity-70">{days}d late</span>}
                  </td>
                  <td className="num">{peso(i.amount)}</td>
                  <td className="num dim">{i.paid > 0 ? peso(i.paid) : "—"}</td>
                  <td className="num" style={{ fontWeight: 500, color: balance > 0 && overdue ? "var(--st-cancel-fg)" : undefined }}>{peso(balance)}</td>
                  <td><StatusPill map={INV_STATUS} status={i.status} /></td>
                  <td className="text-right pr-3">
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <a href={`/print/invoice/${i.id}`} target="_blank" className="btn btn-ghost btn-sm" title="Print Invoice">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </a>
                      {i.status !== "PAID" && (
                        <button className="btn btn-sm btn-accent" onClick={() => onPayInv(i)}>Record payment</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Payables ──────────────────────────────────────────────────────────────────

function PayablesTab({ bills, onPayBill }: { bills: BillData[]; onPayBill: (b: BillData) => void }) {
  const [sub, setSub] = useState("OPEN");
  const today = new Date();

  const counts = {
    OPEN:    bills.filter((b) => ["OPEN", "DUE", "OVERDUE", "PARTIAL"].includes(b.status)).length,
    OVERDUE: bills.filter((b) => b.status === "OVERDUE").length,
    PAID:    bills.filter((b) => b.status === "PAID").length,
    ALL:     bills.length,
  };
  const filtered = bills.filter((b) => {
    if (sub === "OPEN")    return ["OPEN", "DUE", "OVERDUE", "PARTIAL"].includes(b.status);
    if (sub === "OVERDUE") return b.status === "OVERDUE";
    if (sub === "PAID")    return b.status === "PAID";
    return true;
  });

  const totalOpen = bills.filter((b) => b.status !== "PAID").reduce((s, b) => s + b.amount - b.paid, 0);
  const due7      = bills.filter((b) => b.status !== "PAID" && new Date(b.due) <= new Date(today.getTime() + 7 * 86400000)).reduce((s, b) => s + b.amount - b.paid, 0);
  const due30     = bills.filter((b) => b.status !== "PAID" && new Date(b.due) <= new Date(today.getTime() + 30 * 86400000)).reduce((s, b) => s + b.amount - b.paid, 0);
  const overdue   = bills.filter((b) => b.status === "OVERDUE").reduce((s, b) => s + b.amount - b.paid, 0);

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Total payable"      value={shortPeso(totalOpen)} trend={`${counts.OPEN} open bills`} />
        <StatCard label="Due within 7 days"  value={shortPeso(due7)}      trend="Cash-out priority"  warn={due7 > 500000} />
        <StatCard label="Due within 30 days" value={shortPeso(due30)}     trend="Forecast outflow" />
        <StatCard label="Overdue"            value={shortPeso(overdue)}   trend={overdue > 0 ? "Late · pay now" : "All current"} warn={overdue > 0} />
      </div>

      <div className="tabs">
        {[["OPEN", "Open", counts.OPEN], ["OVERDUE", "Overdue", counts.OVERDUE], ["PAID", "Paid", counts.PAID], ["ALL", "All", counts.ALL]].map(([k, l, n]) => (
          <button key={k} className="tab" aria-selected={sub === k} onClick={() => setSub(k as string)}>{l} <span className="tab-count">{n}</span></button>
        ))}
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th className="id">Bill</th><th>Vendor</th><th>Reference</th>
            <th>Issued</th><th>Due</th>
            <th className="num">Amount</th><th className="num">Balance</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9}><div className="empty-state">No bills</div></td></tr>}
            {filtered.map((b) => {
              const balance = b.amount - b.paid;
              const days = Math.floor((today.getTime() - new Date(b.due).getTime()) / 86400000);
              const isOverdue = b.status === "OVERDUE";
              return (
                <tr key={b.id} style={{ cursor: "default" }}>
                  <td className="id">{b.id}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{b.vendorName}</div>
                    {b.note && <div style={{ fontSize: 11.5, color: "oklch(var(--ink-3))", marginTop: 1 }}>{b.note}</div>}
                  </td>
                  <td className="dim">{b.ref ?? "—"}</td>
                  <td className="dim">{fmtDate(b.issued)}</td>
                  <td style={isOverdue ? { color: "var(--st-cancel-fg)", fontWeight: 500 } : {}}>
                    {fmtDate(b.due)}{isOverdue && days > 0 && <span className="ml-1 text-[11px] opacity-70">{days}d late</span>}
                  </td>
                  <td className="num">{peso(b.amount)}</td>
                  <td className="num" style={{ fontWeight: 500 }}>{peso(balance)}</td>
                  <td><StatusPill map={BILL_STATUS} status={b.status} /></td>
                  <td className="text-right pr-3">
                    {b.status !== "PAID" && (
                      <button className="btn btn-sm" onClick={() => onPayBill(b)}>Pay bill</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Trial Balance ─────────────────────────────────────────────────────────────

// Acquisition-cost accounts hidden from Finance (visible to Admin only)
const FINANCE_HIDDEN_CODES = new Set(["1200", "1210", "1220", "5000"]);

function TrialBalanceTab({ tb, userRole }: { tb: Record<string, number>; userRole: string }) {
  const isFinance = userRole === "FINANCE";
  let totalDr = 0, totalCr = 0;
  const rows = COA
    .filter((a) => !(isFinance && FINANCE_HIDDEN_CODES.has(a.code)))
    .map((a) => {
      const v = tb[a.code] ?? 0;
      const dr = v > 0 ? v : 0;
      const cr = v < 0 ? -v : 0;
      totalDr += dr; totalCr += cr;
      return { ...a, dr, cr };
    });

  const groups: Record<string, typeof rows> = {};
  rows.forEach((r) => { (groups[r.type] = groups[r.type] || []).push(r); });
  const order = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

  return (
    <div>
      {isFinance && (
        <div style={{ marginBottom: 12, padding: "8px 14px", borderRadius: 7, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12.5, color: "#92400e" }}>
          Acquisition cost accounts (Inventory 1200–1220 · COGS 5000) are hidden for Finance. Contact your Administrator for the full trial balance.
        </div>
      )}
      <div className="filters">
        <span style={{ fontSize: 13, color: "oklch(var(--ink-3))" }}>Trial balance · as of {fmtDate(new Date().toISOString())}</span>
        <button className="btn btn-sm ml-auto">↓ Export to Excel</button>
        <button className="btn btn-sm">🖨 Print</button>
      </div>

      <div className="card">
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="tbl">
            <thead><tr>
              <th style={{ width: 80 }}>Code</th><th>Account</th><th>Type</th>
              <th className="num">Debit</th><th className="num">Credit</th>
            </tr></thead>
            <tbody>
              {order.flatMap((typ) => [
                <tr key={`grp-${typ}`} className="tb-group"><td colSpan={5}>{typ}</td></tr>,
                ...(groups[typ] ?? []).map((r) => (
                  <tr key={r.code} style={{ cursor: "default" }}>
                    <td className="id">{r.code}</td>
                    <td>{r.name}</td>
                    <td className="dim" style={{ fontSize: 11.5 }}>{r.normal}</td>
                    <td className="num" style={{ color: r.dr ? "oklch(var(--ink))" : "oklch(var(--ink-4))" }}>{r.dr ? peso(r.dr) : "—"}</td>
                    <td className="num" style={{ color: r.cr ? "oklch(var(--ink))" : "oklch(var(--ink-4))" }}>{r.cr ? peso(r.cr) : "—"}</td>
                  </tr>
                )),
              ])}
              <tr style={{ borderTop: "2px solid oklch(var(--ink))", cursor: "default" }}>
                <td colSpan={3} style={{ fontWeight: 600, paddingTop: 10 }}>TOTALS</td>
                <td className="num" style={{ fontWeight: 600, paddingTop: 10 }}>{peso(totalDr)}</td>
                <td className="num" style={{ fontWeight: 600, paddingTop: 10 }}>{peso(totalCr)}</td>
              </tr>
              <tr style={{ cursor: "default" }}>
                <td colSpan={3} className="dim" style={{ fontSize: 12 }}>Difference</td>
                <td colSpan={2} className="num" style={{ color: Math.abs(totalDr - totalCr) < 1 ? "oklch(0.45 0.12 145)" : "var(--st-cancel-fg)", fontWeight: 500 }}>
                  {Math.abs(totalDr - totalCr) < 1 ? "✓ In balance" : peso(totalDr - totalCr)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Statements ────────────────────────────────────────────────────────────────

function StatementsTab({ tb }: { tb: Record<string, number> }) {
  const [report, setReport] = useState("PL");

  return (
    <div>
      <div className="filters">
        <button className="chip" aria-pressed={report === "PL"} onClick={() => setReport("PL")}>Income statement</button>
        <button className="chip" aria-pressed={report === "BS"} onClick={() => setReport("BS")}>Balance sheet</button>
        <button className="chip" aria-pressed={report === "CF"} onClick={() => setReport("CF")}>Cash flow</button>
        <span className="ml-auto text-[12px]" style={{ color: "oklch(var(--ink-3))" }}>YTD · accrual basis</span>
        <button className="btn btn-sm">↓ PDF</button>
      </div>
      {report === "PL" && <IncomeStatement tb={tb} />}
      {report === "BS" && <BalanceSheet    tb={tb} />}
      {report === "CF" && <CashFlow />}
    </div>
  );
}

function IncomeStatement({ tb }: { tb: Record<string, number> }) {
  const v = (c: string) => Math.abs(tb[c] ?? 0);
  const sales = v("4000"), returns = v("4900");
  const revenue = sales - returns;
  const cogs    = v("5000");
  const gm      = revenue - cogs;
  const opex    = v("5100") + v("5200") + v("5300") + v("5400") + v("5500") + v("5600") + v("5700");
  const ni      = gm - opex;

  return (
    <div className="card statement">
      <div style={{ padding: "20px 24px", borderBottom: "1px solid oklch(var(--line))", textAlign: "center" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "oklch(var(--ink-3))" }}>{process.env.NEXT_PUBLIC_ORG ?? "Disucar Sales Inc"} — FMCG Distribution</div>
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>Statement of Comprehensive Income</div>
        <div style={{ fontSize: 12, marginTop: 2, color: "oklch(var(--ink-3))" }}>For the period ended {fmtDate(new Date().toISOString())}</div>
      </div>
      <div className="card-body" style={{ paddingLeft: 32, paddingRight: 32 }}>
        <StmtRow label="Sales revenue"             value={sales} />
        <StmtRow label="Less: returns and allowances" value={-returns} indent />
        <StmtRow label="Net revenue"               value={revenue}  subtotal />
        <StmtRow label="Cost of goods sold"        value={-cogs}    indent />
        <StmtRow label="Gross profit"              value={gm}       subtotal />
        <div style={{ fontSize: 11, marginTop: 14, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em", color: "oklch(var(--ink-3))" }}>Operating expenses</div>
        <StmtRow label="Salaries and wages"    value={-v("5100")} indent />
        <StmtRow label="Rent"                  value={-v("5200")} indent />
        <StmtRow label="Utilities"             value={-v("5300")} indent />
        <StmtRow label="Freight and logistics" value={-v("5400")} indent />
        <StmtRow label="Depreciation"          value={-v("5500")} indent />
        <StmtRow label="Bad debt"              value={-v("5600")} indent />
        <StmtRow label="Bank charges"          value={-v("5700")} indent />
        <StmtRow label="Total operating expenses" value={-opex} subtotal />
        <StmtRow label="Net income before tax"    value={ni}    total />
      </div>
    </div>
  );
}

function BalanceSheet({ tb }: { tb: Record<string, number> }) {
  const v = (c: string) => tb[c] ?? 0;
  const cash = v("1000") + v("1010") + v("1020");
  const ar   = v("1100") + v("1110");
  const cwt  = v("1150");
  const inv  = v("1200") + v("1210") + v("1220");
  const prep = v("1300");
  const ppe  = v("1500") + v("1510");
  const totalAssets = cash + ar + cwt + inv + prep + ppe;
  const ap         = -v("2000");
  const vatNet     = -(v("2100") + v("2110"));
  const wtPay      = -(v("2150") + v("2160"));
  const govContrib = -(v("2200") + v("2210") + v("2220"));
  const deposits   = -v("2300");
  const totalLiab  = ap + vatNet + wtPay + govContrib + deposits;
  const capital    = -v("3000");
  const re         = -v("3100");
  const niForEq    = -(v("4000") - v("4900")) - (v("5000") + v("5100") + v("5200") + v("5300") + v("5400") + v("5500") + v("5600") + v("5700"));
  const totalEq    = capital + re + (-niForEq);

  return (
    <div className="card statement">
      <div style={{ padding: "20px 24px", borderBottom: "1px solid oklch(var(--line))", textAlign: "center" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "oklch(var(--ink-3))" }}>{process.env.NEXT_PUBLIC_ORG ?? "Disucar Sales Inc"} — FMCG Distribution</div>
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>Statement of Financial Position</div>
        <div style={{ fontSize: 12, marginTop: 2, color: "oklch(var(--ink-3))" }}>As of {fmtDate(new Date().toISOString())}</div>
      </div>
      <div className="card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, paddingLeft: 32, paddingRight: 32 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6, color: "oklch(var(--ink-3))" }}>Assets</div>
          <StmtRow label="Cash and cash equivalents" value={cash} />
          <StmtRow label="Accounts receivable, net"  value={ar} />
          <StmtRow label="CWT receivable"            value={cwt} />
          <StmtRow label="Inventory"                 value={inv} />
          <StmtRow label="Prepaid expenses"          value={prep} />
          <StmtRow label="PP&E, net of depreciation" value={ppe} />
          <StmtRow label="Total assets"              value={totalAssets} total />
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6, color: "oklch(var(--ink-3))" }}>Liabilities & Equity</div>
          <StmtRow label="Accounts payable"         value={ap} />
          <StmtRow label="VAT payable, net"         value={vatNet} />
          <StmtRow label="Withholding tax payable"  value={wtPay} />
          <StmtRow label="Statutory contributions"  value={govContrib} />
          <StmtRow label="Customer deposits"        value={deposits} />
          <StmtRow label="Total liabilities"        value={totalLiab} subtotal />
          <StmtRow label="Owner's capital"          value={capital} />
          <StmtRow label="Retained earnings"        value={re} />
          <StmtRow label="Net income (period)"      value={-niForEq} />
          <StmtRow label="Total equity"             value={totalEq} subtotal />
          <StmtRow label="Total liabilities & equity" value={totalLiab + totalEq} total />
        </div>
      </div>
    </div>
  );
}

function CashFlow() {
  const opIn = 18_420_000, opOut = 14_600_000, investOut = 1_850_000, finOut = 320_000;
  const net = opIn - opOut - investOut - finOut;
  return (
    <div className="card statement">
      <div style={{ padding: "20px 24px", borderBottom: "1px solid oklch(var(--line))", textAlign: "center" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "oklch(var(--ink-3))" }}>{process.env.NEXT_PUBLIC_ORG ?? "Disucar Sales Inc"} — FMCG Distribution</div>
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>Statement of Cash Flows</div>
        <div style={{ fontSize: 12, marginTop: 2, color: "oklch(var(--ink-3))" }}>YTD · indirect method</div>
      </div>
      <div className="card-body" style={{ paddingLeft: 32, paddingRight: 32 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, color: "oklch(var(--ink-3))" }}>Operating activities</div>
        <StmtRow label="Cash collected from customers"        value={opIn}         indent />
        <StmtRow label="Cash paid to suppliers and employees" value={-opOut}        indent />
        <StmtRow label="Net cash from operations"            value={opIn - opOut} subtotal />
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 14, marginBottom: 4, color: "oklch(var(--ink-3))" }}>Investing activities</div>
        <StmtRow label="Equipment purchases (PPE)"           value={-investOut}   indent />
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 14, marginBottom: 4, color: "oklch(var(--ink-3))" }}>Financing activities</div>
        <StmtRow label="Loan principal repayments"           value={-finOut}      indent />
        <StmtRow label="Net change in cash"                  value={net}          total />
        <StmtRow label="Cash, beginning"                     value={9_560_000}    indent />
        <StmtRow label="Cash, ending"                        value={9_560_000 + net} subtotal />
      </div>
    </div>
  );
}

function StmtRow({ label, value, indent, subtotal, total }: { label: string; value: number; indent?: boolean; subtotal?: boolean; total?: boolean }) {
  return (
    <div style={{
      display: "flex", padding: `${subtotal || total ? "8px" : "5px"} 0 ${total ? "10px" : "5px"}`,
      paddingLeft: indent ? 22 : 0,
      borderTop: subtotal || total ? "1px solid oklch(var(--line))" : "none",
      borderBottom: total ? "2px double oklch(var(--ink))" : "none",
      marginTop: subtotal ? 4 : total ? 8 : 0,
    }}>
      <span style={{ fontSize: 13, fontWeight: total || subtotal ? 600 : 400 }}>{label}</span>
      <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: total || subtotal ? 600 : 400, fontFamily: "var(--font-geist-mono, monospace)" }}>
        {value < 0 ? `(${peso(-value)})` : peso(value)}
      </span>
    </div>
  );
}

// ── BIR Filings ───────────────────────────────────────────────────────────────

function BirTab({ filings, onFile, onSchedule }: { filings: BirFilingData[]; onFile: (f: BirFilingData) => void; onSchedule: () => void }) {
  const birDue = filings.filter((f) => f.status === "DUE");

  return (
    <div>
      <div className="filters mb-4">
        <span style={{ fontSize: 13, color: "oklch(var(--ink-2))" }}>{filings.length} filing{filings.length !== 1 ? "s" : ""}</span>
        <div className="ml-auto flex gap-2">
          <a className="btn btn-sm" href="https://efps.bir.gov.ph" target="_blank" rel="noreferrer">Open eFPS ↗</a>
          <button className="btn btn-primary btn-sm" onClick={onSchedule}>+ Schedule Filing</button>
        </div>
      </div>
      {birDue.length > 0 && (
        <div className="callout mb-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{birDue.length} BIR filing{birDue.length > 1 ? "s" : ""} need attention this period</div>
            <div style={{ fontSize: 12, marginTop: 1, opacity: 0.8 }}>Returns are prepared from posted entries — review and e-file via eFPS.</div>
          </div>
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>Form</th><th className="id">Filing ID</th><th>Period</th>
            <th>Description</th><th>Due date</th>
            <th className="num">Tax due</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {filings.length === 0 && <tr><td colSpan={8}><div className="empty-state">No BIR filings</div></td></tr>}
            {filings.map((f) => {
              const overdue = f.status === "DUE" && new Date(f.due) < new Date();
              return (
                <tr key={f.id} style={{ cursor: "default" }}>
                  <td><span className="bir-form">{f.form}</span></td>
                  <td className="id">{f.id}</td>
                  <td>{f.period}</td>
                  <td>{f.desc}</td>
                  <td style={overdue ? { color: "var(--st-cancel-fg)", fontWeight: 500 } : {}}>{fmtDate(f.due)}</td>
                  <td className="num">{f.amount > 0 ? peso(f.amount) : "—"}</td>
                  <td><StatusPill map={BIR_STATUS} status={f.status} /></td>
                  <td className="text-right pr-3">
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <a href={`/print/bir/${f.id}`} target="_blank" className="btn btn-ghost btn-sm" title="Print form">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                      </a>
                      {f.status === "DUE"     && <button className="btn btn-sm btn-accent" onClick={() => onFile(f)}>Mark filed</button>}
                      {f.status === "FILED"   && <span className="btn btn-ghost btn-sm" style={{ opacity: 0.5 }}>Filed</span>}
                      {f.status === "PENDING" && <button className="btn btn-sm" onClick={() => onFile(f)}>Prepare</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
