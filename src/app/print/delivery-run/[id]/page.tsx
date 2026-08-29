import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FloatingPrintButton } from "../../PrintButton";
import { getOrgSettings } from "@/lib/org-settings";

export const dynamic = "force-dynamic";

function peso(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function PrintDeliveryRunPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const brand = await getOrgSettings();

  const run = await prisma.deliveryRun.findUnique({
    where: { id: params.id },
    include: {
      driver: { select: { name: true } },
      vehicle: { select: { plateNumber: true } },
      checkedBy: { select: { name: true } },
      stops: {
        include: {
          order: { select: { id: true, total: true, createdAt: true, customer: { select: { name: true, city: true } } } },
          invoice: { select: { id: true, amount: true, issued: true } },
        },
      },
    },
  });
  if (!run) notFound();

  const runDate = new Date(run.runDate).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const totalAmount = run.stops.reduce((s, st) => s + Number(st.invoice?.amount ?? st.order.total), 0);
  const totalCollected = run.stops.reduce((s, st) => s + Number(st.amountCollected ?? 0), 0);

  const cell: React.CSSProperties = { border: "1px solid #d1d5db", padding: "5px 8px", fontSize: 11 };
  const cellR: React.CSSProperties = { ...cell, textAlign: "right" };
  const hd: React.CSSProperties = { ...cell, background: "#1e3a5f", color: "white", fontWeight: 700, fontSize: 10.5 };

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", maxWidth: 900, margin: "0 auto", padding: "24px 32px", color: "#111" }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { margin: 0; } }
        @page { size: A4 landscape; margin: 10mm; }
      `}</style>
      <FloatingPrintButton backHref="/deliveries" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{brand.name}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Delivery Collection Report</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12 }}>
          <div>No. {run.runNumber}</div>
          <div>{runDate}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16, fontSize: 12 }}>
        <div><strong>Driver:</strong> {run.driver?.name ?? "—"}</div>
        <div><strong>Helpers:</strong> {run.helpers ?? "—"}</div>
        <div><strong>Plate #:</strong> {run.vehicle?.plateNumber ?? "—"}</div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={hd}>Invoice #</th>
            <th style={hd}>Invoice Date</th>
            <th style={hd}>Account Name</th>
            <th style={hd}>Address</th>
            <th style={{ ...hd, textAlign: "right" }}>Invoice Amount</th>
            <th style={hd}>Remarks</th>
            <th style={{ ...hd, textAlign: "right" }}>Amount Collected</th>
          </tr>
        </thead>
        <tbody>
          {run.stops.map(stop => (
            <tr key={stop.id}>
              <td style={cell}>{stop.invoice?.id ?? "—"}</td>
              <td style={cell}>{stop.invoice ? new Date(stop.invoice.issued).toLocaleDateString("en-PH") : new Date(stop.order.createdAt).toLocaleDateString("en-PH")}</td>
              <td style={cell}>{stop.order.customer.name}</td>
              <td style={cell}>{stop.order.customer.city ?? "—"}</td>
              <td style={cellR}>{peso(Number(stop.invoice?.amount ?? stop.order.total))}</td>
              <td style={cell}>{stop.remark ? { DELIVERED: "D", STORE_CLOSED: "Close", CANCELLED: "Cancel" }[stop.remark] : ""}</td>
              <td style={cellR}>{stop.amountCollected ? peso(Number(stop.amountCollected)) : ""}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={4}>TOTAL ({run.stops.length} invoices)</td>
            <td style={{ ...cellR, fontWeight: 700 }}>{peso(totalAmount)}</td>
            <td style={cell}></td>
            <td style={{ ...cellR, fontWeight: 700 }}>{peso(totalCollected)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 24 }}>
        Remittance breakdown (cash denominations / checks) is completed by hand on return and reconciled through Collections → Remit.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 40 }}>
        <div>Driver: {run.driver?.name ?? "_______________"}</div>
        <div>Checked by: {run.checkedBy?.name ?? "_______________"}</div>
      </div>
    </div>
  );
}
