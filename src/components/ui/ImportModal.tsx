"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCSV, buildCSVFromRows } from "@/lib/csv-parse";

export type ImportColumn = {
  key: string;       // CSV header name
  label: string;     // display label
  required?: boolean;
};

interface Props {
  title: string;
  templateHref?: string;  // ?template=true export URL (optional)
  dataHref?: string;      // full data export URL (optional)
  importUrl: string;      // POST URL
  columns: ImportColumn[];
  onClose: () => void;
  onSuccess?: () => void;
  notes?: string[];       // optional guidance notes shown on the upload stage
}

type Stage = "upload" | "preview" | "result";

/**
 * A parsed CSV row plus what validation made of it.
 *
 * The cells are nested rather than spread alongside the metadata. As an intersection
 * of `Record<string, string>` with numeric and array fields the type was
 * contradictory — TypeScript resolved `rowNum` to `string & number`, i.e. `never`, so
 * no object could satisfy it and the file never compiled. Nesting also retires the
 * `__` prefixes, which existed only to avoid colliding with a CSV header called
 * "rowNum"; that collision is impossible now the cells have their own namespace.
 */
interface PreviewRow {
  cells: Record<string, string>;
  rowNum: number;
  errors: string[];
}

interface ImportResult {
  created?: number;
  updated?: number;
  adjusted?: number;
  errors: { row: number; field: string; message: string }[];
}

export function ImportModal({ title, templateHref, dataHref, importUrl, columns, onClose, onSuccess, notes }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [validRows, setValidRows] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ── Client-side validation ────────────────────────────────────────────────
  function validateRows(raw: Record<string, string>[]): PreviewRow[] {
    return raw.map((row, i) => {
      const errors: string[] = [];
      for (const col of columns) {
        if (col.required && !row[col.key]?.trim()) {
          errors.push(`${col.label} is required`);
        }
      }
      // rowNum is the spreadsheet line the user sees: 1 is the header.
      return { cells: row, rowNum: i + 2, errors };
    });
  }

  function processFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const raw = parseCSV(text);
      if (!raw.length) {
        alert("The CSV file appears to be empty or has no data rows.");
        return;
      }
      const preview = validateRows(raw);
      setPreviewRows(preview);
      setValidRows(preview.filter(r => r.errors.length === 0).map(r => r.cells));
      setStage("preview");
    };
    reader.readAsText(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith(".csv")) processFile(file);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (!validRows.length) return;
    setSubmitting(true);

    // Rebuild CSV from valid rows only
    const csv = "﻿" + buildCSVFromRows(validRows, columns.map(c => c.key));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const formData = new FormData();
    formData.append("file", blob, "import.csv");

    try {
      const res = await fetch(importUrl, { method: "POST", body: formData });
      const json: ImportResult = await res.json();
      setResult(json);
      setStage("result");
      if (onSuccess) onSuccess();
      router.refresh();
    } catch {
      alert("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Error report download ─────────────────────────────────────────────────
  function downloadErrors() {
    if (!result?.errors.length) return;
    const errorRows = result.errors.map(e => ({
      Row: String(e.row),
      Field: e.field,
      Error: e.message,
    }));
    const csv = "﻿" + buildCSVFromRows(errorRows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const errorCount = previewRows.filter(r => r.errors.length > 0).length;
  const validCount = previewRows.length - errorCount;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: "16px",
    }}>
      <div style={{
        background: "#fff", borderRadius: 10, width: "100%", maxWidth: 720,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #e5e7eb",
          background: "#1B3A5C", borderRadius: "10px 10px 0 0",
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>Import {title}</div>
            <div style={{ fontSize: 12, color: "#93C5FD", marginTop: 2 }}>
              {stage === "upload" && "Upload a CSV file to import records"}
              {stage === "preview" && `${previewRows.length} rows parsed — review before importing`}
              {stage === "result" && "Import complete"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#93C5FD", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Stage indicators */}
        <div style={{ display: "flex", padding: "12px 20px 0", gap: 8 }}>
          {(["upload", "preview", "result"] as Stage[]).map((s, idx) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: stage === s ? "#1B3A5C" : (["upload", "preview", "result"].indexOf(stage) > idx ? "#1A6634" : "#E5E7EB"),
                color: (stage === s || ["upload", "preview", "result"].indexOf(stage) > idx) ? "#fff" : "#6B7280",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
              }}>
                {["upload", "preview", "result"].indexOf(stage) > idx ? "✓" : idx + 1}
              </div>
              <span style={{ fontSize: 12, color: stage === s ? "#1B3A5C" : "#6B7280", fontWeight: stage === s ? 600 : 400, textTransform: "capitalize" }}>{s}</span>
              {idx < 2 && <span style={{ color: "#D1D5DB", fontSize: 12 }}>›</span>}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* ── Stage 1: Upload ── */}
          {stage === "upload" && (
            <div>
              {/* Download buttons */}
              {(templateHref || dataHref) && (
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  {templateHref && (
                    <a href={templateHref} download style={btnStyle("outline")}>
                      ↓ Download Template (blank)
                    </a>
                  )}
                  {dataHref && (
                    <a href={dataHref} download style={btnStyle("outline")}>
                      ↓ Download Existing Data
                    </a>
                  )}
                </div>
              )}

              {/* Columns reference */}
              <div style={{ background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6, padding: "10px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Expected columns</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
                  {columns.map(c => (
                    <span key={c.key} style={{
                      fontSize: 11, padding: "2px 7px", borderRadius: 4,
                      background: c.required ? "#DBEAFE" : "#F3F4F6",
                      color: c.required ? "#1E40AF" : "#4B5563",
                      border: c.required ? "1px solid #BFDBFE" : "1px solid #E5E7EB",
                    }}>
                      {c.key}{c.required ? " *" : ""}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 6 }}>* Required columns</div>
              </div>

              {/* Optional notes */}
              {notes && notes.length > 0 && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, padding: "10px 14px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#92400E", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Notes</div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
                    {notes.map((n, i) => (
                      <li key={i} style={{ fontSize: 12, color: "#78350F" }}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Drop zone */}
              <div
                ref={dropRef}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "#1B3A5C" : "#D1D5DB"}`,
                  borderRadius: 8, padding: "36px 20px", textAlign: "center",
                  cursor: "pointer", background: dragOver ? "#EFF6FF" : "#FAFAFA",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                <div style={{ fontWeight: 600, color: "#374151", fontSize: 14 }}>
                  {fileName || "Drop CSV here or click to browse"}
                </div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Accepts .csv files only</div>
                <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileChange} />
              </div>
            </div>
          )}

          {/* ── Stage 2: Preview ── */}
          {stage === "preview" && (
            <div>
              {/* Summary bar */}
              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                <div style={chipStyle("#DCFCE7", "#166534")}>{validCount} rows valid</div>
                {errorCount > 0 && <div style={chipStyle("#FEE2E2", "#991B1B")}>{errorCount} rows have errors — will be skipped</div>}
              </div>

              {/* Preview table */}
              <div style={{ overflowX: "auto", maxHeight: 320, border: "1px solid #E5E7EB", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#F9FAFB", position: "sticky", top: 0 }}>
                      <th style={thStyle}>Row</th>
                      {columns.slice(0, 5).map(c => <th key={c.key} style={thStyle}>{c.label}</th>)}
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.rowNum} style={{ background: row.errors.length ? "#FFF7F7" : "white", borderBottom: "1px solid #F3F4F6" }}>
                        <td style={tdStyle}>{row.rowNum}</td>
                        {columns.slice(0, 5).map(c => (
                          <td key={c.key} style={{ ...tdStyle, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.cells[c.key] || <span style={{ color: "#D1D5DB" }}>—</span>}
                          </td>
                        ))}
                        <td style={tdStyle}>
                          {row.errors.length === 0
                            ? <span style={{ color: "#166534", fontWeight: 600 }}>✅ OK</span>
                            : <span style={{ color: "#991B1B", fontSize: 11 }} title={row.errors.join("; ")}>❌ {row.errors[0]}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
                Showing first 5 columns. {previewRows.length > 50 ? `First 50 of ${previewRows.length} rows shown.` : ""}
              </div>
            </div>
          )}

          {/* ── Stage 3: Result ── */}
          {stage === "result" && result && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>
                {result.errors.length === 0 ? "🎉" : "✅"}
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, color: "#111827", marginBottom: 16 }}>
                Import Complete
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 20 }}>
                {"created" in result && result.created! > 0 &&
                  <div style={chipStyle("#DCFCE7", "#166534")}>✅ {result.created} created</div>}
                {"updated" in result && result.updated! > 0 &&
                  <div style={chipStyle("#DBEAFE", "#1E40AF")}>✅ {result.updated} updated</div>}
                {"adjusted" in result && result.adjusted! > 0 &&
                  <div style={chipStyle("#DBEAFE", "#1E40AF")}>✅ {result.adjusted} adjusted</div>}
                {result.errors.length > 0 &&
                  <div style={chipStyle("#FEE2E2", "#991B1B")}>❌ {result.errors.length} skipped</div>}
              </div>
              {result.errors.length > 0 && (
                <button onClick={downloadErrors} style={btnStyle("outline")}>
                  ↓ Download error report ({result.errors.length} rows)
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {stage === "preview" && (
            <button onClick={() => { setStage("upload"); setFileName(""); }} style={btnStyle("ghost")}>
              ← Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {stage === "upload" && (
            <button onClick={onClose} style={btnStyle("ghost")}>Cancel</button>
          )}
          {stage === "preview" && (
            <>
              <button onClick={onClose} style={{ ...btnStyle("ghost"), marginRight: 8 }}>Cancel</button>
              <button
                onClick={handleImport}
                disabled={submitting || validCount === 0}
                style={btnStyle("primary", submitting || validCount === 0)}
              >
                {submitting ? "Importing…" : `Import ${validCount} valid row${validCount !== 1 ? "s" : ""} →`}
              </button>
            </>
          )}
          {stage === "result" && (
            <button onClick={onClose} style={btnStyle("primary")}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────
function btnStyle(variant: "primary" | "outline" | "ghost", disabled = false): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "7px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer", border: "none",
    textDecoration: "none", display: "inline-block", opacity: disabled ? 0.5 : 1,
  };
  if (variant === "primary") return { ...base, background: "#1B3A5C", color: "#fff" };
  if (variant === "outline") return { ...base, background: "#fff", color: "#1B3A5C", border: "1px solid #1B3A5C" };
  return { ...base, background: "none", color: "#6B7280", border: "1px solid #E5E7EB" };
}

function chipStyle(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20 };
}

const thStyle: React.CSSProperties = {
  padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 600,
  color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.4,
  borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 10px", fontSize: 12, color: "#374151",
};
