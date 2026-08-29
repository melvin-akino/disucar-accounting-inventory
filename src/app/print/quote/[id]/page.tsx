import { num } from "@/lib/utils";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FloatingPrintButton } from "../../PrintButton";
import { getOrgSettings } from "@/lib/org-settings";

export const dynamic = "force-dynamic";

function peso(n: number | string) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", SENT: "Sent", ACCEPTED: "Accepted",
  CONVERTED: "Converted to Order", EXPIRED: "Expired", REJECTED: "Rejected",
};

export default async function PrintQuotePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const brand = await getOrgSettings();

  const quote = await prisma.quotation.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      agent: { select: { name: true } },
      warehouse: { select: { name: true, city: true } },
      lines: { include: { sku: { select: { sku: true } } } },
    },
  });
  if (!quote) notFound();

  const subtotal = Number(quote.subtotal);
  const vat = Number(quote.vat);
  const cwt = Number(quote.cwt);
  const total = Number(quote.total);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Quotation {quote.id}</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
          .page { max-width: 800px; margin: 0 auto; padding: 32px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
          .company { font-size: 20px; font-weight: 700; color: ${brand.color}; letter-spacing: -0.5px; }
          .doc-title { text-align: right; }
          .doc-title h1 { font-size: 22px; font-weight: 700; color: ${brand.color}; }
          .doc-title .doc-no { font-size: 13px; font-family: monospace; color: #374151; margin-top: 2px; }
          .stripe { height: 5px; background: ${brand.color}; margin-bottom: 24px; border-radius: 2px; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
          .meta-block h4 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 6px; }
          .meta-block p { font-size: 12px; color: #111; line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: ${brand.color}; color: #fff; padding: 8px 10px; font-size: 11px; font-weight: 600; text-align: left; }
          th.num, td.num { text-align: right; }
          td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
          tr:last-child td { border-bottom: none; }
          tr:nth-child(even) td { background: #f9fafb; }
          .totals { margin-left: auto; width: 280px; }
          .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #374151; }
          .total-row.grand { border-top: 2px solid ${brand.color}; margin-top: 4px; padding-top: 8px; font-size: 14px; font-weight: 700; color: ${brand.color}; }
          .validity { margin: 20px 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: #f9fafb; font-size: 12px; color: #374151; }
          .notes { margin: 16px 0; font-size: 12px; color: #374151; }
          .status-pill { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #dbeafe; color: #1e40af; }
          .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
          .sig-block { border-top: 1px solid #374151; padding-top: 6px; }
          .sig-block p { font-size: 11px; color: #6b7280; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
        `}</style>
      </head>
      <body>
        <FloatingPrintButton backHref="/quotes" />
        <div className="page">
          <div className="header">
            <div>
              {brand.logoUrl && (
                <img src={brand.logoUrl} alt={brand.name} style={{ width: 128, height: "auto", objectFit: "contain", marginBottom: 8, display: "block" }} />
              )}
              <div className="company">{brand.name}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{brand.tagline}</div>
              <div style={{ fontSize: 10.5, color: "#9ca3af", marginTop: 2, lineHeight: 1.5 }}>
                {brand.address}<br />{brand.phone} · {brand.email}
              </div>
            </div>
            <div className="doc-title">
              <h1>QUOTATION</h1>
              <div className="doc-no">{quote.id}</div>
              <div style={{ marginTop: 4 }}>
                <span className="status-pill">{STATUS_LABEL[quote.status] ?? quote.status}</span>
              </div>
            </div>
          </div>
          <div className="stripe" />

          <div className="meta-grid">
            <div className="meta-block">
              <h4>Bill To</h4>
              <p>
                <strong>{quote.customer.name}</strong><br />
                {quote.customer.city && <>{quote.customer.city}<br /></>}
                {quote.customer.region && <>{quote.customer.region}<br /></>}
                {quote.customer.tin && <>TIN: {quote.customer.tin}<br /></>}
                {quote.customer.contactEmail && <>{quote.customer.contactEmail}</>}
              </p>
            </div>
            <div className="meta-block">
              <h4>Quotation Details</h4>
              <p>
                <strong>Date Issued:</strong> {new Date(quote.createdAt).toLocaleDateString("en-PH")}<br />
                <strong>Valid Until:</strong> {new Date(quote.validUntil).toLocaleDateString("en-PH")}<br />
                <strong>Warehouse:</strong> {quote.warehouse.name}{quote.warehouse.city ? `, ${quote.warehouse.city}` : ""}<br />
                {quote.agent && <><strong>Prepared by:</strong> {quote.agent.name}<br /></>}
                {quote.orderId && <><strong>Converted to:</strong> {quote.orderId}</>}
              </p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Description</th>
                <th style={{ width: 60 }}>Unit</th>
                <th className="num" style={{ width: 60 }}>Qty</th>
                <th className="num" style={{ width: 110 }}>Unit Price</th>
                <th className="num" style={{ width: 120 }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line, i) => (
                <tr key={line.id}>
                  <td style={{ color: "#6b7280" }}>{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{line.name}</div>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>SKU: {line.sku.sku}</div>
                  </td>
                  <td>{line.unit}</td>
                  <td className="num">{num(line.qty)}</td>
                  <td className="num">{peso(Number(line.unitPrice))}</td>
                  <td className="num">{peso(Number(line.lineTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals">
            <div className="total-row"><span>Subtotal</span><span>{peso(subtotal)}</span></div>
            <div className="total-row"><span>VAT (12%)</span><span>{peso(vat)}</span></div>
            {quote.cwt2307 && (
              <div className="total-row"><span>CWT 2307 (−2%)</span><span>({peso(cwt)})</span></div>
            )}
            <div className="total-row grand"><span>TOTAL DUE</span><span>{peso(total)}</span></div>
          </div>

          {quote.notes && (
            <div className="notes">
              <strong>Notes:</strong> {quote.notes}
            </div>
          )}

          <div className="validity">
            <strong>Terms & Validity:</strong> This quotation is valid until {new Date(quote.validUntil).toLocaleDateString("en-PH", { dateStyle: "long" })}.
            Prices are subject to change after validity. Payment terms: {quote.customer.terms}.
          </div>

          <div className="sigs">
            <div className="sig-block">
              <div style={{ height: 36 }} />
              <p><strong>Prepared by</strong></p>
              <p>{quote.agent?.name ?? "Sales Agent"}</p>
            </div>
            <div className="sig-block">
              <div style={{ height: 36 }} />
              <p><strong>Accepted by (Customer Signature)</strong></p>
              <p>Date: ___________________</p>
            </div>
          </div>

          <div className="footer">
            This is a computer-generated document. {brand.name} · {brand.website}
          </div>
        </div>
      </body>
    </html>
  );
}
