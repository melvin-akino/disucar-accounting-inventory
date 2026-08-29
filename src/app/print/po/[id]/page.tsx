import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FloatingPrintButton } from "../../PrintButton";
import { PrintLetterhead } from "@/components/print/PrintLetterhead";
import { getOrgSettings } from "@/lib/org-settings";

export const dynamic = "force-dynamic";

function peso(n: number | string) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function PrintPoPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const brand = await getOrgSettings();

  const po = await prisma.inboundPO.findUnique({
    where: { id: params.id },
    include: {
      supplier: true,
      warehouse: { select: { name: true, city: true } },
      lines: {
        include: { sku: { select: { sku: true, name: true, unit: true, unitPrice: true } } },
      },
    },
  });
  if (!po) notFound();

  const supplier = po.supplier;
  const expectedAt = new Date(po.expectedAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const createdAt = new Date(po.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  const subtotal = po.lines.reduce((s, l) => s + l.qty * Number(l.sku.unitPrice), 0);
  const vat = subtotal * 0.12;
  const grandTotal = Number(po.total);

  const cell: React.CSSProperties = { border: "1px solid #d1d5db", padding: "7px 10px", fontSize: 12.5 };
  const cellR: React.CSSProperties = { ...cell, textAlign: "right", fontFamily: "monospace" };
  const hd: React.CSSProperties = { ...cell, background: "#064e3b", color: "white", fontWeight: 700, fontSize: 11.5 };
  const hdR: React.CSSProperties = { ...hd, textAlign: "right" };

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", maxWidth: 760, margin: "0 auto", padding: "24px 32px", color: "#111" }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { margin: 0; } }
        @page { size: A4; margin: 12mm; }
      `}</style>

      <FloatingPrintButton backHref="/inbound" />

      <PrintLetterhead brand={brand} docTitle="Purchase Order" docSub={po.id} dark />

      {/* Info grid */}
      <div style={{ border: "1px solid #d1d5db", borderTop: 0, padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#9ca3af", fontWeight: 600, marginBottom: 6 }}>Vendor / Supplier</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{supplier.name}</div>
          {supplier.contactEmail && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{supplier.contactEmail}</div>}
          {supplier.contactPhone && <div style={{ fontSize: 12, color: "#6b7280" }}>{supplier.contactPhone}</div>}
          {supplier.city && <div style={{ fontSize: 12, color: "#6b7280" }}>{supplier.city}</div>}
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Terms: {supplier.terms}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignContent: "start" }}>
          {[
            ["PO Number", po.id],
            ["Issue Date", createdAt],
            ["Expected Delivery", expectedAt],
            ["Deliver To", po.warehouse.name + (po.warehouse.city ? `, ${po.warehouse.city}` : "")],
            ["Status", po.status],
            ["Lead Time", `${supplier.leadTimeDays} days`],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Line items */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
        <thead>
          <tr>
            <th style={hd}>#</th>
            <th style={hd}>SKU Code</th>
            <th style={hd}>Description</th>
            <th style={hd}>Unit</th>
            <th style={hdR}>Qty Ordered</th>
            <th style={hdR}>Unit Cost</th>
            <th style={hdR}>Line Total</th>
            <th style={hdR}>Qty Received</th>
          </tr>
        </thead>
        <tbody>
          {po.lines.map((line, i) => {
            const unitCost = Number(line.sku.unitPrice);
            const lineTotal = line.qty * unitCost;
            return (
              <tr key={line.id} style={{ background: i % 2 === 0 ? "#f9fafb" : "white" }}>
                <td style={{ ...cell, color: "#9ca3af", fontSize: 11 }}>{i + 1}</td>
                <td style={{ ...cell, fontFamily: "monospace", fontSize: 11 }}>{line.sku.sku}</td>
                <td style={cell}>{line.sku.name}</td>
                <td style={{ ...cell, textAlign: "center" }}>{line.sku.unit}</td>
                <td style={cellR}>{line.qty}</td>
                <td style={cellR}>{peso(unitCost)}</td>
                <td style={cellR}>{peso(lineTotal)}</td>
                <td style={{ ...cellR, background: "#fafafa" }}>
                  {line.accepted > 0 ? (
                    <span style={{ color: line.accepted === line.qty ? "#166534" : "#92400e" }}>
                      {line.accepted}/{line.qty}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 28 }}>
        <table style={{ borderCollapse: "collapse", minWidth: 260 }}>
          <tbody>
            {[
              ["Subtotal", subtotal],
              ["VAT (12%)", vat],
            ].map(([label, val]) => (
              <tr key={label as string}>
                <td style={{ padding: "4px 12px 4px 0", fontSize: 13, color: "#6b7280" }}>{label}</td>
                <td style={{ padding: "4px 0", textAlign: "right", fontFamily: "monospace", fontSize: 13 }}>{peso(val as number)}</td>
              </tr>
            ))}
            <tr><td colSpan={2} style={{ borderTop: "2px solid #111", paddingTop: 4 }} /></tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 700, fontSize: 15 }}>Grand Total</td>
              <td style={{ padding: "4px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 800, fontSize: 16 }}>{peso(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Terms & conditions */}
      <div style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 12, marginBottom: 24, fontSize: 11.5, color: "#6b7280", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, color: "#111", marginBottom: 4 }}>Terms & Conditions</div>
        1. Please confirm receipt of this PO within 24 hours.<br />
        2. Goods must be delivered to the specified warehouse by the expected date.<br />
        3. All items must match the specifications and quantities in this PO.<br />
        4. Discrepancies must be reported within 48 hours of delivery.<br />
        5. Payment will be processed as per agreed terms: {supplier.terms}.
      </div>

      {/* Signature block */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        {[
          { title: "Approved by (Buyer)", sub: "Purchasing / Finance Officer" },
          { title: "Acknowledged by (Supplier)", sub: "Authorized Representative" },
        ].map((s) => (
          <div key={s.title} style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 12 }}>
            <div style={{ minHeight: 48, borderBottom: "1px solid #9ca3af", marginBottom: 8 }} />
            <div style={{ fontWeight: 600, fontSize: 12 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>{s.sub} · Date: ________</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28, textAlign: "center", fontSize: 10, color: "#9ca3af" }}>
        {po.id} · Generated {today} · This PO is valid for 30 days from issue date
      </div>
    </div>
  );
}
