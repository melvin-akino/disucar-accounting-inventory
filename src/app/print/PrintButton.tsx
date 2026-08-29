"use client";

export function PrintButton({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="no-print" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
      <button
        onClick={() => window.print()}
        style={{ padding: "7px 18px", background: "#1a56db", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
      >
        Print / Save PDF
      </button>
      <a href={backHref} style={{ fontSize: 13, color: "#555" }}>← {backLabel}</a>
    </div>
  );
}

export function FloatingPrintButton({ backHref, downloadHref }: { backHref: string; downloadHref?: string }) {
  return (
    <div className="no-print" style={{ position: "fixed", top: 16, right: 16, zIndex: 10, display: "flex", gap: 8 }}>
      <a
        href={backHref}
        style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid #d0d5dd", background: "white", color: "#374151", textDecoration: "none", fontSize: 13, fontWeight: 500 }}
      >
        ← Back
      </a>
      {downloadHref && (
        <a
          href={downloadHref}
          download
          style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: "#7c3aed", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}
        >
          ↓ Download PDF
        </a>
      )}
      <button
        onClick={() => window.print()}
        style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: "#0d9488", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        Print / Save PDF
      </button>
    </div>
  );
}

