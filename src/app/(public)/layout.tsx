import { getOrgSettings } from "@/lib/org-settings";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const brand = await getOrgSettings();

  return (
    <div style={{ minHeight: "100vh", background: "oklch(var(--bg))" }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 10, padding: "14px 20px",
        background: brand.color, color: "white",
      }}>
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt={brand.name} style={{ height: 28, width: "auto", objectFit: "contain" }} />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2v20M2 12h20" />
          </svg>
        )}
        <span style={{ fontWeight: 700, fontSize: 15 }}>{brand.name}</span>
      </header>
      <main>{children}</main>
    </div>
  );
}
