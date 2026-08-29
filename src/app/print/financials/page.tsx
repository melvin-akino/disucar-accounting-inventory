import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeTrialBalance, COA_BY_CODE } from "@/lib/coa";
import { PrintButton } from "../PrintButton";
import { getOrgSettings } from "@/lib/org-settings";

export const dynamic = "force-dynamic";

function peso(n: number) {
  return n.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
}

function Section({ title }: { title: string }) {
  return (
    <tr>
      <td colSpan={2} style={{ paddingTop: 14, paddingBottom: 2, fontWeight: 700, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: "#555", borderBottom: "1px solid #ddd" }}>
        {title}
      </td>
    </tr>
  );
}

function Row({ label, amount, indent = false, bold = false }: { label: string; amount: number; indent?: boolean; bold?: boolean }) {
  return (
    <tr>
      <td style={{ paddingLeft: indent ? 20 : 0, paddingTop: 3, paddingBottom: 3, fontSize: 12.5, fontWeight: bold ? 700 : 400, color: bold ? "#111" : "#333" }}>
        {label}
      </td>
      <td style={{ textAlign: "right", paddingTop: 3, paddingBottom: 3, fontSize: 12.5, fontWeight: bold ? 700 : 400, fontFamily: "monospace", color: amount < 0 ? "#c00" : "#111" }}>
        {peso(Math.abs(amount))}
        {amount < 0 ? " (Dr)" : ""}
      </td>
    </tr>
  );
}

function Divider() {
  return <tr><td colSpan={2} style={{ borderTop: "1px solid #bbb", padding: 0 }} /></tr>;
}

interface Props { searchParams: { from?: string; to?: string } }

export default async function PrintFinancialsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const brand = await getOrgSettings();

  const fromDate = searchParams.from ? new Date(searchParams.from + "T00:00:00") : undefined;
  const toDate   = searchParams.to   ? new Date(searchParams.to   + "T23:59:59") : undefined;

  const journalEntries = await prisma.journalEntry.findMany({
    where: {
      ...(fromDate || toDate ? { date: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
    },
    include: { lines: true },
  });

  const allLines = journalEntries.flatMap((je) =>
    je.lines.map((l) => ({ code: l.code, dr: Number(l.dr), cr: Number(l.cr) }))
  );
  const tb = computeTrialBalance(allLines);

  // Helper: get balance sign-adjusted (positive = normal balance direction)
  function bal(code: string): number {
    const acct = COA_BY_CODE[code];
    if (!acct) return 0;
    const raw = tb[code] ?? 0;
    // DR-normal: positive raw = positive balance. CR-normal: negative raw = positive balance (credit side)
    return acct.normal === "DR" ? raw : -raw;
  }

  // Income Statement
  const salesRev = bal("4000");
  const salesReturns = bal("4900"); // normal DR, so positive = reduction
  const netSales = salesRev - salesReturns;
  const totalRevenue = netSales;

  const cogs = bal("5000");
  const grossProfit = totalRevenue - cogs;

  const salaries = bal("5100");
  const rent = bal("5200");
  const utilities = bal("5300");
  const freight = bal("5400");
  const depreciation = bal("5500");
  const badDebt = bal("5600");
  const bankCharges = bal("5700");
  const totalOpex = salaries + rent + utilities + freight + depreciation + badDebt + bankCharges;
  const netIncome = grossProfit - totalOpex;

  // Balance Sheet
  const cash = bal("1000") + bal("1010") + bal("1020");
  const ar = bal("1100") + bal("1110"); // 1110 is CR-normal (allowance), so bal() already inverts
  const cwt = bal("1150");
  const invMnl = bal("1200");
  const invCeb = bal("1210");
  const invDvo = bal("1220");
  const prepaid = bal("1300");
  const ppe = bal("1500") + bal("1510"); // 1510 is CR-normal (accum. dep)
  const totalCurrentAssets = cash + ar + cwt + invMnl + invCeb + invDvo + prepaid;
  const totalAssets = totalCurrentAssets + ppe;

  const ap = bal("2000");
  const outputVat = bal("2100");
  const inputVat = bal("2110"); // DR-normal, so positive = asset-like; included as negative liability
  const wtPayable1 = bal("2150");
  const wtPayable2 = bal("2160");
  const sss = bal("2200");
  const philhealth = bal("2210");
  const pagibig = bal("2220");
  const custDeposits = bal("2300");
  const totalLiabilities = ap + outputVat - inputVat + wtPayable1 + wtPayable2 + sss + philhealth + pagibig + custDeposits;

  const ownersCapital = bal("3000");
  const retainedEarnings = bal("3100");
  const totalEquity = ownersCapital + retainedEarnings + netIncome;
  const totalLiabEquity = totalLiabilities + totalEquity;

  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const fmt = (d: Date) => d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const periodLabel = fromDate && toDate
    ? `${fmt(fromDate)} to ${fmt(toDate)}`
    : fromDate ? `From ${fmt(fromDate)}`
    : toDate   ? `Up to ${fmt(toDate)}`
    : "All periods";

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 760, margin: "0 auto", padding: "24px 32px", color: "#111" }}>
      <style>{`@media print { .no-print { display: none !important; } body { margin: 0; } }`}</style>

      <PrintButton backHref="/ledger" backLabel="Back to Ledger" />

      {/* Company Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        {brand.logoUrl && (
          <img src={brand.logoUrl} alt={brand.name} style={{ width: 128, height: "auto", objectFit: "contain", marginBottom: 8, display: "block", margin: "0 auto 8px" }} />
        )}
        <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.5, color: brand.color }}>{brand.name}</div>
        <div style={{ fontSize: 11.5, color: "#555" }}>TIN: {brand.tin} · {brand.address}</div>
      </div>

      {/* ── INCOME STATEMENT ─────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>INCOME STATEMENT</div>
          <div style={{ fontSize: 11.5, color: "#555" }}>For the Period Ended {periodLabel}</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <Section title="Revenue" />
            <Row label="Sales Revenue" amount={salesRev} indent />
            <Row label="Less: Sales Returns & Allowances" amount={-salesReturns} indent />
            <Row label="Net Sales" amount={netSales} indent bold />
            <Divider />
            <Row label="Total Revenue" amount={totalRevenue} bold />

            <Section title="Cost of Goods Sold" />
            <Row label="Cost of Goods Sold" amount={cogs} indent />
            <Divider />
            <Row label="Gross Profit" amount={grossProfit} bold />

            <Section title="Operating Expenses" />
            <Row label="Salaries & Wages" amount={salaries} indent />
            <Row label="Rent Expense" amount={rent} indent />
            <Row label="Utilities" amount={utilities} indent />
            <Row label="Freight & Logistics" amount={freight} indent />
            <Row label="Depreciation Expense" amount={depreciation} indent />
            <Row label="Bad Debt Expense" amount={badDebt} indent />
            <Row label="Bank Charges" amount={bankCharges} indent />
            <Divider />
            <Row label="Total Operating Expenses" amount={totalOpex} bold />

            <tr><td colSpan={2} style={{ paddingTop: 8 }} /></tr>
            <tr>
              <td style={{ fontWeight: 800, fontSize: 14, paddingTop: 4, paddingBottom: 4, borderTop: "2px solid #111" }}>Net Income</td>
              <td style={{ textAlign: "right", fontWeight: 800, fontSize: 14, fontFamily: "monospace", paddingTop: 4, paddingBottom: 4, borderTop: "2px solid #111", color: netIncome < 0 ? "#c00" : "#111" }}>
                {peso(Math.abs(netIncome))}{netIncome < 0 ? " (Loss)" : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: "2px dashed #ccc", margin: "28px 0" }} />

      {/* ── BALANCE SHEET ─────────────────────────────────────── */}
      <div>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>BALANCE SHEET</div>
          <div style={{ fontSize: 11.5, color: "#555" }}>As of {toDate ? fmt(toDate) : today}</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <Section title="Assets" />
            <tr><td style={{ paddingTop: 6, fontWeight: 600, fontSize: 12 }}>Current Assets</td><td /></tr>
            <Row label="Cash on Hand" amount={bal("1000")} indent />
            <Row label="Cash in Bank — BPI Operating" amount={bal("1010")} indent />
            <Row label="Cash in Bank — Metrobank Payroll" amount={bal("1020")} indent />
            <Row label="Accounts Receivable (net)" amount={ar} indent />
            <Row label="Withholding Tax Receivable" amount={cwt} indent />
            <Row label="Inventory — MNL" amount={invMnl} indent />
            <Row label="Inventory — CEB" amount={invCeb} indent />
            <Row label="Inventory — DVO" amount={invDvo} indent />
            <Row label="Prepaid Expenses" amount={prepaid} indent />
            <Divider />
            <Row label="Total Current Assets" amount={totalCurrentAssets} bold />

            <tr><td style={{ paddingTop: 8, fontWeight: 600, fontSize: 12 }}>Non-Current Assets</td><td /></tr>
            <Row label="Property, Plant & Equipment (net)" amount={ppe} indent />
            <Divider />
            <Row label="TOTAL ASSETS" amount={totalAssets} bold />

            <Section title="Liabilities" />
            <Row label="Accounts Payable — Trade" amount={ap} indent />
            <Row label="Output VAT Payable" amount={outputVat} indent />
            <Row label="Input VAT" amount={-inputVat} indent />
            <Row label="Withholding Tax Payable (1601-EQ)" amount={wtPayable1} indent />
            <Row label="Withholding Tax Payable (1601-C)" amount={wtPayable2} indent />
            <Row label="SSS / PhilHealth / Pag-IBIG Payable" amount={sss + philhealth + pagibig} indent />
            <Row label="Customer Deposits" amount={custDeposits} indent />
            <Divider />
            <Row label="Total Liabilities" amount={totalLiabilities} bold />

            <Section title="Equity" />
            <Row label="Owner's Capital" amount={ownersCapital} indent />
            <Row label="Retained Earnings" amount={retainedEarnings} indent />
            <Row label="Current Period Net Income" amount={netIncome} indent />
            <Divider />
            <Row label="Total Equity" amount={totalEquity} bold />

            <tr><td colSpan={2} style={{ paddingTop: 8 }} /></tr>
            <tr>
              <td style={{ fontWeight: 800, fontSize: 14, paddingTop: 4, paddingBottom: 4, borderTop: "2px solid #111" }}>TOTAL LIABILITIES & EQUITY</td>
              <td style={{ textAlign: "right", fontWeight: 800, fontSize: 14, fontFamily: "monospace", paddingTop: 4, paddingBottom: 4, borderTop: "2px solid #111" }}>
                {peso(totalLiabEquity)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 40, borderTop: "1px solid #ddd", paddingTop: 12, fontSize: 10.5, color: "#888", textAlign: "center" }}>
        Generated {today} · For internal use only · Unaudited
      </div>
    </div>
  );
}
