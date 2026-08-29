import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "../../PrintButton";
import { getOrgSettings } from "@/lib/org-settings";

export const dynamic = "force-dynamic";

function peso(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function LabeledField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: wide ? 240 : 140 }}>
      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, color: "#666", fontWeight: 600 }}>{label}</span>
      <div style={{ border: "1px solid #888", padding: "4px 7px", fontSize: 12.5, minHeight: 24, background: "#fafafa" }}>{value}</div>
    </div>
  );
}

function BoxRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>{children}</div>;
}

const FORM_DETAILS: Record<string, { title: string; subtitle: string; taxType: string }> = {
  "2550M": { title: "BIR Form No. 2550M", subtitle: "Monthly Value-Added Tax Declaration", taxType: "VAT" },
  "2550Q": { title: "BIR Form No. 2550Q", subtitle: "Quarterly Value-Added Tax Return", taxType: "VAT" },
  "1601C": { title: "BIR Form No. 1601-C", subtitle: "Monthly Remittance Return of Income Taxes Withheld on Compensation", taxType: "Withholding Tax (Compensation)" },
  "1601EQ": { title: "BIR Form No. 1601-EQ", subtitle: "Quarterly Remittance Return of Creditable Income Taxes Withheld", taxType: "Expanded Withholding Tax" },
  "1702RT": { title: "BIR Form No. 1702-RT", subtitle: "Annual Income Tax Return (Corporation)", taxType: "Corporate Income Tax" },
};

export default async function PrintBirPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const brand = await getOrgSettings();

  const filing = await prisma.birFiling.findUnique({ where: { id: params.id } });
  if (!filing) notFound();

  const details = FORM_DETAILS[filing.form] ?? {
    title: `BIR Form No. ${filing.form}`,
    subtitle: filing.desc,
    taxType: "Tax",
  };

  const amount = Number(filing.amount);
  const dueDate = new Date(filing.due).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const isPaid = filing.status === "FILED";

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 720, margin: "0 auto", padding: "24px 32px", color: "#111" }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { margin: 0; } }
        @page { size: A4; margin: 12mm; }
      `}</style>

      <PrintButton backHref="/ledger" backLabel="Back to Ledger" />

      {/* BIR Header */}
      <div style={{ border: "2px solid #222", padding: 0, marginBottom: 16 }}>
        {/* Top bar */}
        <div style={{ background: "#003087", color: "#fff", padding: "8px 14px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, fontFamily: "serif" }}>BIR</div>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1, opacity: 0.85 }}>REPUBLIC OF THE PHILIPPINES</div>
            <div style={{ fontSize: 9, letterSpacing: 0.5, opacity: 0.85 }}>DEPARTMENT OF FINANCE</div>
            <div style={{ fontWeight: 700, fontSize: 10, letterSpacing: 0.5 }}>BUREAU OF INTERNAL REVENUE</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: 0.5 }}>{details.title}</div>
            <div style={{ fontSize: 10, opacity: 0.9 }}>{details.subtitle}</div>
          </div>
        </div>

        {/* Filing info */}
        <div style={{ padding: "14px 14px 10px" }}>
          <BoxRow>
            <LabeledField label="Period" value={filing.period} />
            <LabeledField label="Due Date" value={dueDate} />
            <LabeledField label="Filing Status" value={filing.status} />
            <LabeledField label="Tax Type" value={details.taxType} />
          </BoxRow>

          <div style={{ borderTop: "1px solid #ccc", margin: "10px 0" }} />

          <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: 0.4, color: "#444", marginBottom: 8, textTransform: "uppercase" }}>Taxpayer Information</div>
          <BoxRow>
            <LabeledField label="Registered Name" value={brand.name} wide />
            <LabeledField label="TIN" value={brand.tin} />
            <LabeledField label="RDO Code" value={process.env.NEXT_PUBLIC_ORG_RDO ?? "044"} />
          </BoxRow>
          <BoxRow>
            <LabeledField label="Registered Address" value={brand.address} wide />
            <LabeledField label="Zip Code" value={process.env.NEXT_PUBLIC_ORG_ZIP ?? "1550"} />
            <LabeledField label="Contact Number" value={brand.phone} />
          </BoxRow>

          <div style={{ borderTop: "1px solid #ccc", margin: "10px 0" }} />

          <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: 0.4, color: "#444", marginBottom: 8, textTransform: "uppercase" }}>Tax Computation</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <tbody>
              {[
                { label: "Description", value: filing.desc },
                { label: "Tax Base / Taxable Amount", value: `PHP ${peso(amount / 0.12)}` },
                { label: "Tax Rate", value: "12%" },
                { label: "Tax Due", value: `PHP ${peso(amount)}` },
                { label: "Less: Tax Credits / Payments", value: "PHP 0.00" },
                { label: "Penalties / Surcharges", value: "PHP 0.00" },
              ].map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#f8f8f8" : "#fff" }}>
                  <td style={{ padding: "5px 8px", border: "1px solid #ddd", color: "#555", width: "55%" }}>{r.label}</td>
                  <td style={{ padding: "5px 8px", border: "1px solid #ddd", fontFamily: "monospace", textAlign: "right" }}>{r.value}</td>
                </tr>
              ))}
              <tr style={{ background: "#003087", color: "#fff" }}>
                <td style={{ padding: "6px 8px", border: "1px solid #003087", fontWeight: 700 }}>AMOUNT STILL DUE / (OVERPAYMENT)</td>
                <td style={{ padding: "6px 8px", border: "1px solid #003087", fontFamily: "monospace", textAlign: "right", fontWeight: 700, fontSize: 14 }}>
                  PHP {peso(isPaid ? 0 : amount)}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ borderTop: "1px solid #ccc", margin: "12px 0" }} />

          {/* Signature block */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Prepared by / Taxpayer Signature</div>
              <div style={{ borderBottom: "1px solid #444", marginBottom: 4, height: 32 }} />
              <div style={{ fontSize: 9, color: "#666" }}>Signature over Printed Name / Date</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Received by (BIR)</div>
              <div style={{ borderBottom: "1px solid #444", marginBottom: 4, height: 32 }} />
              <div style={{ fontSize: 9, color: "#666" }}>Revenue Officer / Date / Stamp</div>
            </div>
          </div>
        </div>

        {/* Footer bar */}
        <div style={{ background: "#f0f0f0", borderTop: "1px solid #ccc", padding: "6px 14px", display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#555" }}>
          <span>Filing ID: {filing.id}</span>
          <span>Generated: {today}</span>
          <span>{isPaid ? "STATUS: FILED" : "STATUS: PENDING PAYMENT"}</span>
        </div>
      </div>

      <div style={{ fontSize: 10, color: "#888", textAlign: "center", marginTop: 12 }}>
        This document is a system-generated filing summary. Present at the appropriate BIR Revenue District Office together with supporting documents.
      </div>
    </div>
  );
}
