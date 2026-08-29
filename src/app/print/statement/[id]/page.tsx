import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FloatingPrintButton } from "../../PrintButton";
import { getOrgSettings } from "@/lib/org-settings";

interface Props { params: { id: string } }

function peso(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function StatementPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!["FINANCE", "ADMIN", "AGENT"].includes(session.user.role)) redirect("/dashboard");

  const brand = await getOrgSettings();

  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: { invoices: { orderBy: { issued: "asc" } } },
  });
  if (!customer) notFound();

  const today = new Date();

  // Build statement rows: each invoice creates a debit, each non-zero payment creates a credit
  type Row = {
    date: Date;
    ref: string;
    description: string;
    debit: number;
    credit: number;
  };

  const rows: Row[] = [];
  for (const inv of customer.invoices) {
    rows.push({
      date: inv.issued,
      ref: inv.id,
      description: inv.soId ? `Invoice — SO ${inv.soId}` : "Invoice",
      debit: Number(inv.amount),
      credit: 0,
    });
    const paid = Number(inv.paid);
    if (paid > 0) {
      rows.push({
        date: inv.updatedAt ?? inv.issued,
        ref: `PMT-${inv.id}`,
        description: "Payment received",
        debit: 0,
        credit: paid,
      });
    }
  }

  // Sort by date
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Compute running balance
  let balance = 0;
  const rowsWithBalance = rows.map(r => {
    balance += r.debit - r.credit;
    return { ...r, balance };
  });

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const outstanding = totalDebit - totalCredit;

  return (
    <>
      <FloatingPrintButton backHref={`/customers`} />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px", fontFamily: "ui-serif, Georgia, serif" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, borderBottom: "2px solid #111", paddingBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: brand.color }}>{brand.name}</div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{brand.tagline}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{brand.address}</div>
            <div style={{ fontSize: 11, color: "#888" }}>{brand.phone} · {brand.email}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#374151", marginTop: 6, letterSpacing: "0.05em" }}>STATEMENT OF ACCOUNT</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: "#555" }}>
            <div>Date: {fmtDate(today)}</div>
            <div>Page 1 of 1</div>
          </div>
        </div>

        {/* Customer info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Bill To</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{customer.name}</div>
            {customer.code && <div style={{ fontSize: 12, color: "#555" }}>Code: {customer.code}</div>}
            {customer.tin && <div style={{ fontSize: 12, color: "#555" }}>TIN: {customer.tin}</div>}
            {customer.city && <div style={{ fontSize: 12, color: "#555" }}>{customer.city}{customer.region ? `, ${customer.region}` : ""}</div>}
            {customer.contactEmail && <div style={{ fontSize: 12, color: "#555" }}>{customer.contactEmail}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Account Summary</div>
            <table style={{ marginLeft: "auto", fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "2px 16px 2px 0", color: "#555" }}>Total Billed</td>
                  <td style={{ textAlign: "right", fontWeight: 500 }}>{peso(totalDebit)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "2px 16px 2px 0", color: "#555" }}>Total Payments</td>
                  <td style={{ textAlign: "right", fontWeight: 500 }}>{peso(totalCredit)}</td>
                </tr>
                <tr style={{ borderTop: "1px solid #ddd" }}>
                  <td style={{ padding: "6px 16px 2px 0", fontWeight: 700 }}>Balance Due</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: outstanding > 0 ? "#b91c1c" : "#15803d", fontSize: 15 }}>
                    {peso(outstanding)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>Payment Terms: {customer.terms}</div>
          </div>
        </div>

        {/* Transaction table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f4f4f4" }}>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, borderBottom: "2px solid #ddd" }}>Date</th>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, borderBottom: "2px solid #ddd" }}>Reference</th>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, borderBottom: "2px solid #ddd" }}>Description</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 700, borderBottom: "2px solid #ddd" }}>Debit (₱)</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 700, borderBottom: "2px solid #ddd" }}>Credit (₱)</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 700, borderBottom: "2px solid #ddd" }}>Balance (₱)</th>
            </tr>
          </thead>
          <tbody>
            {rowsWithBalance.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "24px", color: "#888" }}>No transactions on record.</td>
              </tr>
            )}
            {rowsWithBalance.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td>
                <td style={{ padding: "7px 10px", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{r.ref}</td>
                <td style={{ padding: "7px 10px" }}>{r.description}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{r.debit > 0 ? r.debit.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "—"}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{r.credit > 0 ? r.credit.toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "—"}</td>
                <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: r.balance > 0 ? "#b91c1c" : r.balance < 0 ? "#15803d" : "#555" }}>
                  {r.balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #ddd", background: "#f4f4f4" }}>
              <td colSpan={3} style={{ padding: "8px 10px", fontWeight: 700 }}>TOTALS</td>
              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{totalDebit.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{totalCredit.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: outstanding > 0 ? "#b91c1c" : "#15803d" }}>
                {outstanding.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Footer note */}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #ddd", fontSize: 11, color: "#777" }}>
          <p>This statement was generated on {fmtDate(today)} and reflects all transactions recorded up to that date.</p>
          <p>If you have any questions about this statement, please contact us at your earliest convenience.</p>
        </div>

        {/* Signature block */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, marginTop: 40 }}>
          {["Prepared by", "Received by"].map(label => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #555", paddingTop: 8, fontSize: 12, color: "#555" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
