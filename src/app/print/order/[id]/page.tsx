import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FloatingPrintButton } from "../../PrintButton";
import { PrintLetterhead } from "@/components/print/PrintLetterhead";
import { getOrgSettings } from "@/lib/org-settings";

interface Props { params: { id: string } }

function peso(n: number | string) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function PrintOrderPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const brand = await getOrgSettings();

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      agent: true,
      warehouse: true,
      lines: { include: { sku: true } },
      shipment: { include: { vehicle: { select: { plateNumber: true } } } },
    },
  });
  if (!order) notFound();

  if (session.user.role === "CUSTOMER" && order.customerId !== session.user.customerId) notFound();

  const now = new Date();

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
        body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
      `}</style>

      <FloatingPrintButton backHref={`/orders/${order.id}`} />

      {/* Document */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 48px 64px", background: "white" }}>

        <PrintLetterhead
          brand={brand}
          docTitle="Order Confirmation"
          docSub={`Printed: ${now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`}
        />
        <div style={{ borderTop: `2px solid ${brand.color}`, marginBottom: 24 }} />

        {/* Order meta */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
              Bill To
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 2 }}>{order.customer.name}</div>
            {order.customer.tin && <div style={{ fontSize: 12.5, color: "#6b7280" }}>TIN: {order.customer.tin}</div>}
            {order.customer.city && <div style={{ fontSize: 12.5, color: "#6b7280" }}>{order.customer.region ? `${order.customer.city}, ${order.customer.region}` : order.customer.city}</div>}
            {order.customer.contactEmail && <div style={{ fontSize: 12.5, color: "#6b7280" }}>{order.customer.contactEmail}</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
              Order Details
            </div>
            <table style={{ fontSize: 12.5, borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ color: "#6b7280", paddingBottom: 3, width: "45%" }}>Order #</td>
                  <td style={{ fontWeight: 600, fontFamily: "monospace" }}>{order.id}</td>
                </tr>
                <tr>
                  <td style={{ color: "#6b7280", paddingBottom: 3 }}>Status</td>
                  <td style={{ fontWeight: 600 }}>{order.state}</td>
                </tr>
                <tr>
                  <td style={{ color: "#6b7280", paddingBottom: 3 }}>Order Date</td>
                  <td>{order.createdAt.toLocaleString("en-PH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
                {order.poRef && (
                  <tr>
                    <td style={{ color: "#6b7280", paddingBottom: 3 }}>PO Reference</td>
                    <td style={{ fontFamily: "monospace" }}>{order.poRef}</td>
                  </tr>
                )}
                {order.needBy && (
                  <tr>
                    <td style={{ color: "#6b7280", paddingBottom: 3 }}>Need By</td>
                    <td>{order.needBy.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ color: "#6b7280", paddingBottom: 3 }}>Terms</td>
                  <td>{order.customer.terms}</td>
                </tr>
                {order.agent && (
                  <tr>
                    <td style={{ color: "#6b7280" }}>Sales Agent</td>
                    <td>{order.agent.name}</td>
                  </tr>
                )}
                {order.msrCode && (
                  <tr>
                    <td style={{ color: "#6b7280", paddingBottom: 3 }}>MSR Code</td>
                    <td style={{ fontFamily: "monospace" }}>{order.msrCode}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lines table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 0, fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: 11.5, color: "#374151" }}>Product</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: 11.5, color: "#374151" }}>SKU</th>
              <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: 11.5, color: "#374151" }}>Unit</th>
              <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, fontSize: 11.5, color: "#374151" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, fontSize: 11.5, color: "#374151" }}>Unit Price</th>
              <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, fontSize: 11.5, color: "#374151" }}>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line, i) => (
              <tr key={line.id} style={{ borderBottom: "1px solid #e5e7eb", background: i % 2 === 1 ? "#fafafa" : "white" }}>
                <td style={{ padding: "10px 12px", fontWeight: 500 }}>{line.name}</td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#6b7280", fontSize: 12 }}>{line.sku.sku}</td>
                <td style={{ padding: "10px 12px", color: "#6b7280" }}>{line.unit}</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>{line.qty.toLocaleString()}</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>{peso(line.unitPrice.toString())}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 500 }}>{peso(line.lineTotal.toString())}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 0 }}>
          <table style={{ fontSize: 13, borderCollapse: "collapse", minWidth: 280 }}>
            <tbody>
              <tr>
                <td style={{ padding: "6px 12px", color: "#6b7280" }}>Subtotal</td>
                <td style={{ padding: "6px 12px", textAlign: "right" }}>{peso(order.subtotal.toString())}</td>
              </tr>
              {order.discountMode && (() => {
                const gross = Number(order.subtotal);
                const net = order.lines.reduce((s, l) => s + Number(l.lineTotal), 0);
                const disc = Math.round((gross - net) * 100) / 100;
                return disc > 0 ? (
                  <tr>
                    <td style={{ padding: "6px 12px", color: "#6b7280" }}>
                      Discount{order.discountMode === "CUSTOMER" ? " (customer blanket)" : " (per-product)"}
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "right" }}>({peso(disc.toString())})</td>
                  </tr>
                ) : null;
              })()}
              <tr>
                <td style={{ padding: "6px 12px", color: "#6b7280" }}>VAT (12%)</td>
                <td style={{ padding: "6px 12px", textAlign: "right" }}>{peso(order.vat.toString())}</td>
              </tr>
              {order.cwt2307 && (
                <tr>
                  <td style={{ padding: "6px 12px", color: "#6b7280" }}>CWT 2307 (−2%)</td>
                  <td style={{ padding: "6px 12px", textAlign: "right" }}>({peso(order.cwt.toString())})</td>
                </tr>
              )}
              <tr style={{ borderTop: "2px solid #111" }}>
                <td style={{ padding: "10px 12px", fontWeight: 700, fontSize: 15 }}>Total</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, fontSize: 15 }}>{peso(order.total.toString())}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Shipment info */}
        {order.shipment && (
          <div style={{ marginTop: 28, padding: "14px 16px", background: "#f3f4f6", borderRadius: 8, fontSize: 12.5 }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: "#374151" }}>Shipment Information</div>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", color: "#6b7280" }}>
              {order.shipment.trackingNumber && <span>Tracking: <strong style={{ color: "#111" }}>{order.shipment.trackingNumber}</strong></span>}
              {order.shipment.vehicle?.plateNumber && <span>Vehicle: <strong style={{ color: "#111" }}>{order.shipment.vehicle.plateNumber}</strong></span>}
              {order.shipment.eta && <span>ETA: <strong style={{ color: "#111" }}>{new Date(order.shipment.eta).toLocaleDateString("en-PH")}</strong></span>}
              {order.shipment.podSignedBy && <span>Received by: <strong style={{ color: "#111" }}>{order.shipment.podSignedBy}</strong></span>}
            </div>
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div style={{ marginTop: 24, padding: "12px 16px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12.5, color: "#6b7280" }}>
            <strong style={{ color: "#374151" }}>Notes:</strong> {order.notes}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#9ca3af" }}>
          <span>{brand.name} · Official Order Confirmation</span>
          <span>{order.warehouse.name}</span>
        </div>
      </div>
    </>
  );
}
