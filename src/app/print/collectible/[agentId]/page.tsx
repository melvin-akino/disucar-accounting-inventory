import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgentCollectibles } from "@/lib/collections";
import { FloatingPrintButton } from "../../PrintButton";
import { getOrgSettings } from "@/lib/org-settings";

export const dynamic = "force-dynamic";

function peso(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function PrintCollectiblePage({ params }: { params: { agentId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const brand = await getOrgSettings();
  const agent = await prisma.user.findUnique({ where: { id: params.agentId }, select: { name: true } });
  if (!agent) notFound();

  const rows = await getAgentCollectibles(params.agentId);
  const total = rows.reduce((s, r) => s + r.balance, 0);
  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  const cell: React.CSSProperties = { border: "1px solid #d1d5db", padding: "6px 9px", fontSize: 11.5 };
  const cellR: React.CSSProperties = { ...cell, textAlign: "right" };
  const hd: React.CSSProperties = { ...cell, background: "#1e3a5f", color: "white", fontWeight: 700, fontSize: 11 };

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", maxWidth: 820, margin: "0 auto", padding: "24px 32px", color: "#111" }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { margin: 0; } }
        @page { size: A4; margin: 12mm; }
      `}</style>
      <FloatingPrintButton backHref="/collections" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{brand.name}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Collectible Sheet</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12 }}>
          <div><strong>Agent:</strong> {agent.name}</div>
          <div>{today}</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={hd}>Invoice #</th>
            <th style={hd}>Account Name</th>
            <th style={hd}>Address</th>
            <th style={hd}>Due Date</th>
            <th style={{ ...hd, textAlign: "right" }}>Balance</th>
            <th style={hd}>Collected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.invoiceId}>
              <td style={cell}>{r.invoiceId}</td>
              <td style={cell}>{r.customerName}</td>
              <td style={cell}>{r.city ?? "—"}</td>
              <td style={cell}>{new Date(r.due).toLocaleDateString("en-PH")}</td>
              <td style={cellR}>{peso(r.balance)}</td>
              <td style={cell}></td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td style={cell} colSpan={6}>No outstanding invoices.</td></tr>
          )}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={4}>TOTAL ({rows.length} invoices)</td>
            <td style={{ ...cellR, fontWeight: 700 }}>{peso(total)}</td>
            <td style={cell}></td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 40 }}>
        <div>Collected by: {agent.name}</div>
        <div>Received by: _______________</div>
      </div>
    </div>
  );
}
