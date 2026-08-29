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

export default async function PrintInvoicePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN", "AGENT"].includes(session.user.role)) redirect("/orders");

  const brand = await getOrgSettings();

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      order: { include: { lines: true, warehouse: { select: { name: true, city: true } } } },
    },
  });
  if (!invoice) notFound();

  const customer = invoice.customer;
  const order = invoice.order;
  const lines = order?.lines ?? [];

  const amount = Number(invoice.amount);
  const paid = Number(invoice.paid);
  const balance = amount - paid;
  const subtotal = order ? Number(order.subtotal) : amount;
  const vat = order ? Number(order.vat) : 0;
  const cwt = order ? Number(order.cwt) : 0;

  const issued = new Date(invoice.issued).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const due = new Date(invoice.due).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  const cell: React.CSSProperties = { border: "1px solid #e5e7eb", padding: "7px 10px", fontSize: 12.5 };
  const cellR: React.CSSProperties = { ...cell, textAlign: "right", fontFamily: "monospace" };
  const hd: React.CSSProperties = { ...cell, background: "#f9fafb", fontWeight: 700, fontSize: 11.5, color: "#374151" };
  const hdR: React.CSSProperties = { ...hd, textAlign: "right" };

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", maxWidth: 760, margin: "0 auto", padding: "24px 32px", color: "#111" }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { margin: 0; } }
        @page { size: A4; margin: 12mm; }
      `}</style>

      <FloatingPrintButton backHref="/ledger" downloadHref={`/api/pdf/invoice/${invoice.id}`} />

      <PrintLetterhead brand={brand} docTitle="Invoice" docSub={invoice.id} />

      {/* Meta grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: "#9ca3af", fontWeight: 600, marginBottom: 6 }}>Bill To</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{customer.name}</div>
          {customer.tin && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>TIN: {customer.tin}</div>}
          {customer.city && <div style={{ fontSize: 12, color: "#6b7280" }}>{customer.city}</div>}
          {customer.terms && <div style={{ fontSize: 12, color: "#6b7280" }}>Terms: {customer.terms}</div>}
          {customer.contactEmail && <div style={{ fontSize: 12, color: "#6b7280" }}>{customer.contactEmail}</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignContent: "start" }}>
          {[
            ["Invoice No.", invoice.id],
            ["SO Reference", invoice.soId ?? "—"],
            ["Issue Date", issued],
            ["Due Date", due],
            ["Status", invoice.status],
            ["Warehouse", order?.warehouse.name ?? "—"],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 12.5, fontWeight: value === invoice.status ? 600 : 400, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Line items */}
      {lines.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
          <thead>
            <tr>
              <th style={hd}>Description</th>
              <th style={hd}>Unit</th>
              <th style={hdR}>Qty</th>
              <th style={hdR}>Unit Price</th>
              <th style={hdR}>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td style={cell}>{line.name}</td>
                <td style={{ ...cell, color: "#6b7280" }}>{line.unit}</td>
                <td style={cellR}>{line.qty}</td>
                <td style={cellR}>{peso(Number(line.unitPrice))}</td>
                <td style={cellR}>{peso(Number(line.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: "16px", background: "#f9fafb", borderRadius: 6, marginBottom: 20, fontSize: 13, color: "#6b7280" }}>
          Invoice amount: {peso(amount)} (no line items — standalone invoice)
        </div>
      )}

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 28 }}>
        <table style={{ borderCollapse: "collapse", minWidth: 280 }}>
          <tbody>
            {[
              ["Subtotal", subtotal],
              ["VAT (12%)", vat],
              ["CWT (2%)", -cwt],
            ].map(([label, value]) => (
              <tr key={label as string}>
                <td style={{ padding: "4px 12px 4px 0", fontSize: 13, color: "#6b7280" }}>{label}</td>
                <td style={{ padding: "4px 0", textAlign: "right", fontFamily: "monospace", fontSize: 13 }}>{peso(value as number)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} style={{ borderTop: "2px solid #111", paddingTop: 4 }} />
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 700, fontSize: 15 }}>Total Due</td>
              <td style={{ padding: "4px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 800, fontSize: 16 }}>{peso(amount)}</td>
            </tr>
            {paid > 0 && (
              <>
                <tr>
                  <td style={{ padding: "3px 12px 3px 0", fontSize: 12, color: "#6b7280" }}>Less: Payments Received</td>
                  <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace", fontSize: 12, color: "#6b7280" }}>({peso(paid)})</td>
                </tr>
                <tr>
                  <td style={{ padding: "3px 12px 3px 0", fontWeight: 700, fontSize: 14 }}>Balance Due</td>
                  <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: balance > 0 ? "#b91c1c" : "#166534" }}>{peso(balance)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Payment instructions */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Payment Instructions</div>
          <div style={{ fontSize: 11.5, color: "#6b7280", lineHeight: 1.6 }}>
            Bank: Bank of the Philippine Islands (BPI)<br />
            Account Name: Sample Company Inc.<br />
            Account No.: 1234-5678-90<br />
            Please include invoice number as reference.
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Notes</div>
          <div style={{ fontSize: 11.5, color: "#6b7280", lineHeight: 1.6 }}>
            Payment due: {due}<br />
            Terms: {customer.terms}<br />
            This is a system-generated invoice.<br />
            {invoice.status === "PAID" && <span style={{ color: "#166534", fontWeight: 600 }}>✓ FULLY PAID</span>}
          </div>
        </div>
      </div>

      {/* Signature */}
      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        {["Prepared by", "Received by / Authorized Signatory"].map((label) => (
          <div key={label}>
            <div style={{ borderBottom: "1px solid #9ca3af", marginBottom: 6, paddingBottom: 28 }} />
            <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, textAlign: "center", fontSize: 10, color: "#9ca3af" }}>
        Generated {today} · {invoice.id} · This is not an official receipt
      </div>
    </div>
  );
}
