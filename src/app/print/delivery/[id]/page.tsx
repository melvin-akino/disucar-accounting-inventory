import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FloatingPrintButton } from "../../PrintButton";
import { PrintLetterhead } from "@/components/print/PrintLetterhead";
import { getOrgSettings } from "@/lib/org-settings";

export const dynamic = "force-dynamic";

export default async function PrintDeliveryPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const brand = await getOrgSettings();

  const shipment = await prisma.shipment.findUnique({
    where: { id: params.id },
    include: {
      order: {
        include: {
          customer: true,
          lines: true,
          warehouse: { select: { name: true, city: true } },
          agent: { select: { name: true } },
        },
      },
      vehicle: { select: { plateNumber: true } },
    },
  });
  if (!shipment) notFound();

  const order = shipment.order;
  const customer = order.customer;
  const lines = order.lines;

  const shippedAt = shipment.shippedAt
    ? new Date(shipment.shippedAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "—";
  const eta = shipment.eta
    ? new Date(shipment.eta).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "—";
  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const drNo = `DR-${shipment.id.slice(-8).toUpperCase()}`;

  const cell: React.CSSProperties = { border: "1px solid #d1d5db", padding: "7px 10px", fontSize: 12.5 };
  const cellR: React.CSSProperties = { ...cell, textAlign: "right" };
  const cellC: React.CSSProperties = { ...cell, textAlign: "center" };
  const hd: React.CSSProperties = { ...cell, background: "#1e3a5f", color: "white", fontWeight: 700, fontSize: 11.5 };
  const hdC: React.CSSProperties = { ...hd, textAlign: "center" };
  const hdR: React.CSSProperties = { ...hd, textAlign: "right" };

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", maxWidth: 760, margin: "0 auto", padding: "24px 32px", color: "#111" }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { margin: 0; } }
        @page { size: A4; margin: 12mm; }
      `}</style>

      <FloatingPrintButton backHref={`/orders/${order.id}`} />

      <PrintLetterhead brand={brand} docTitle="Delivery Receipt" docSub="Packing List / Proof of Delivery" dark />

      {/* Info grid */}
      <div style={{ border: "1px solid #d1d5db", borderTop: 0, padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#9ca3af", fontWeight: 600, marginBottom: 6 }}>Deliver To</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{customer.name}</div>
          {customer.tin && <div style={{ fontSize: 12, color: "#6b7280" }}>TIN: {customer.tin}</div>}
          {customer.city && <div style={{ fontSize: 12, color: "#6b7280" }}>{customer.city}</div>}
          {customer.contactPhone && <div style={{ fontSize: 12, color: "#6b7280" }}>Tel: {customer.contactPhone}</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignContent: "start" }}>
          {[
            ["DR No.", drNo],
            ["SO Reference", order.id],
            ["Ship Date", shippedAt],
            ["ETA", eta],
            ["Tracking No.", shipment.trackingNumber ?? "—"],
            ["Vehicle / Plate No.", shipment.vehicle?.plateNumber ?? "—"],
            ["Shipped from", `${order.warehouse.name}${order.warehouse.city ? `, ${order.warehouse.city}` : ""}`],
            ["Sales Agent", order.agent?.name ?? "—"],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Line items */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr>
            <th style={hd}>#</th>
            <th style={hd}>Description</th>
            <th style={hdC}>Unit</th>
            <th style={hdR}>Qty Ordered</th>
            <th style={hdR}>Qty Delivered</th>
            <th style={hdC}>Condition</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={line.id} style={{ background: i % 2 === 0 ? "#f9fafb" : "white" }}>
              <td style={{ ...cell, color: "#9ca3af", fontSize: 11 }}>{i + 1}</td>
              <td style={cell}>
                <div style={{ fontWeight: 500 }}>{line.name}</div>
              </td>
              <td style={cellC}>{line.unit}</td>
              <td style={cellR}>{line.qty}</td>
              <td style={{ ...cellR, borderRight: "2px solid #d1d5db" }}>{line.qty}</td>
              <td style={{ ...cellC, background: "#fafafa" }}>
                <div style={{ width: 14, height: 14, border: "1px solid #9ca3af", display: "inline-block", borderRadius: 2 }} />
              </td>
            </tr>
          ))}
          {/* Empty rows for handwriting */}
          {Array.from({ length: Math.max(0, 3 - lines.length) }).map((_, i) => (
            <tr key={`empty-${i}`} style={{ height: 32 }}>
              <td style={{ ...cell, color: "#d1d5db" }}>{lines.length + i + 1}</td>
              <td style={cell} /><td style={cellC} /><td style={cellR} /><td style={cellR} /><td style={cellC} />
            </tr>
          ))}
        </tbody>
      </table>

      {/* Remarks */}
      <div style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 12, marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Delivery Remarks / Notes</div>
        <div style={{ minHeight: 40, fontSize: 12, color: "#6b7280" }}>
          {order.notes ?? "—"}
        </div>
      </div>

      {/* Signature block */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginTop: 12 }}>
        {[
          { title: "Released by", sub: "Warehouse / Dispatcher" },
          { title: "Checked by", sub: "Quality Control" },
          { title: "Received by", sub: "Customer Authorized Rep." },
        ].map((s) => (
          <div key={s.title} style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 12 }}>
            <div style={{ minHeight: 48, borderBottom: "1px solid #9ca3af", marginBottom: 8 }} />
            <div style={{ fontWeight: 600, fontSize: 12 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>{s.sub}</div>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontSize: 10.5, color: "#9ca3af" }}>Signature / Date</div>
              {s.title === "Received by" && shipment.podSignedBy && (
                <div style={{ fontSize: 10.5, fontWeight: 600 }}>{shipment.podSignedBy}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28, textAlign: "center", fontSize: 10, color: "#9ca3af" }}>
        {drNo} · Generated {today} · Original for Customer · Duplicate for File
      </div>
    </div>
  );
}
