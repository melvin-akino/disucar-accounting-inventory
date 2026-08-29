import type { OrgBrand } from "@/lib/org-settings";

interface Props {
  brand: OrgBrand;
  docTitle: string;
  docSub?: string;
  dark?: boolean;
}

export function PrintLetterhead({ brand, docTitle, docSub, dark = false }: Props) {
  if (dark) {
    return (
      <div style={{
        background: brand.color,
        color: "white",
        padding: "14px 20px",
        borderRadius: "6px 6px 0 0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.01em" }}>{docTitle}</div>
          {docSub && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{docSub}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{brand.name}</div>
          <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 1 }}>{brand.address}</div>
          <div style={{ fontSize: 11.5, opacity: 0.85 }}>TIN: {brand.tin} · {brand.phone}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 128, borderRadius: 8,
          background: brand.logoUrl ? "white" : brand.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          border: brand.logoUrl ? "1px solid #e5e7eb" : undefined,
          padding: brand.logoUrl ? 4 : 12,
          minHeight: brand.logoUrl ? undefined : 64,
        }}>
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.name} style={{ width: "100%", height: "auto", objectFit: "contain" }} />
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v20M2 12h20" />
            </svg>
          )}
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: brand.color, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {brand.name}
          </div>
          <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 2 }}>{brand.tagline}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3, lineHeight: 1.5 }}>
            {brand.address}<br />
            {brand.phone} · {brand.email}
          </div>
          {brand.tin && (
            <div style={{ fontSize: 11, color: "#9ca3af" }}>TIN: {brand.tin} · VAT Reg. No. {brand.tin}</div>
          )}
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{
          fontSize: 24, fontWeight: 800, color: brand.color,
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          {docTitle}
        </div>
        {docSub && (
          <div style={{ fontSize: 12.5, color: "#6b7280", marginTop: 4, fontFamily: "monospace" }}>{docSub}</div>
        )}
      </div>
    </div>
  );
}
