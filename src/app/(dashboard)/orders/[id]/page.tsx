import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatePill } from "@/components/ui/StatePill";
import { fmtDateTime, num, peso } from "@/lib/utils";
import { nextTransition, STATE_LABEL } from "@/types";
import type { OrderState } from "@prisma/client";
import { OrderActions } from "./OrderActions";
import { getSettlement } from "../actions";
import { settlementView } from "@/lib/order-flow";
import { OrderLinesEditor } from "./OrderLinesEditor";
import { Attachments } from "@/components/Attachments";

interface Props { params: { id: string } }

export default async function OrderDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  const role = session!.user.role;

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      lines: {
        include: {
          sku: true,
          lots: {
            include: { lot: { select: { lotNumber: true, expiryDate: true } } },
          },
        },
      },
      events: { include: { actor: true }, orderBy: { createdAt: "asc" } },
      shipment: true,
    },
  });
  if (!order) notFound();

  if (role === "CUSTOMER" && order.customerId !== session!.user.customerId) notFound();

  const attachments = await prisma.attachment.findMany({
    where: { entityType: "order", entityId: params.id },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { uploadedAt: "desc" },
  });

  const settlementState = await getSettlement(order.id);
  const settlementInfo = settlementView(settlementState);
  const settlement = {
    total: settlementState.total,
    paid: settlementState.paid,
    balance: settlementInfo.balance,
    canRelease: settlementInfo.canRelease,
    onAccount: settlementInfo.onAccount,
  };

  const transition = nextTransition(order.state as OrderState, order.channel);
  const canManage = ["AGENT", "CASHIER", "FINANCE", "WAREHOUSE", "ADMIN"].includes(role);
  const canEditDiscount = ["FINANCE", "ADMIN"].includes(role) && !["DELIVERED", "CANCELLED"].includes(order.state);
  const blanketPct = order.customer.blanketDiscountPct ? Number(order.customer.blanketDiscountPct) : 0;

  const editorLines = order.lines.map((line) => ({
    id: line.id,
    name: line.sku.name,
    sku: line.sku.sku,
    qty: num(line.qty),
    unitPrice: Number(line.unitPrice),
    lineTotal: Number(line.lineTotal),
    discountPct: line.discountPct != null ? Number(line.discountPct) : null,
    isFree: line.isFree,
    lots: (line.lots ?? []).map((oll) => ({
      id: oll.id,
      lotNumber: oll.lot.lotNumber,
      qtyTaken: num(oll.qtyTaken),
      expiryDate: oll.lot.expiryDate ? oll.lot.expiryDate.toISOString() : null,
    })),
  }));

  return (
    <div className="max-w-[900px]">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/orders" className="btn btn-ghost btn-sm">← Orders</Link>
        <h1 className="text-[17px] font-semibold flex-1">{order.id}</h1>
        <StatePill state={order.state as OrderState} />
        {/* An order released on account sits in PAID with money still outstanding.
            Saying only "Paid" would misrepresent it to anyone reading the order. */}
        {settlement.onAccount && (
          <span
            title={`${peso(settlement.balance)} still outstanding`}
            style={{ fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "oklch(0.94 0.05 65)", color: "oklch(0.38 0.11 55)" }}
          >
            on account · {peso(settlement.balance)} due
          </span>
        )}
        <Link href={`/print/order/${order.id}`} target="_blank" className="btn btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print
        </Link>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 300px" }}>
        {/* Main */}
        <div className="flex flex-col gap-4">
          <OrderLinesEditor orderId={order.id} lines={editorLines} cwt2307={order.cwt2307} blanketPct={blanketPct} initialMode={(order.discountMode ?? "NONE") as "NONE" | "CUSTOMER" | "PRODUCT"} canEditDiscount={canEditDiscount} />

          {/* Attachments */}
          <div className="card">
            <div className="card-head"><span className="card-h">Attachments</span></div>
            <div className="card-body">
              <Attachments
                entityType="order"
                entityId={order.id}
                attachments={attachments.map(a => ({
                  id: a.id,
                  originalName: a.originalName,
                  fileSize: a.fileSize,
                  mimeType: a.mimeType,
                  url: a.url,
                  uploadedAt: a.uploadedAt.toISOString(),
                  uploadedBy: a.uploadedBy,
                }))}
                canUpload={canManage}
                canDelete={["ADMIN", "FINANCE"].includes(role)}
              />
            </div>
          </div>

          {/* History */}
          <div className="card">
            <div className="card-head"><span className="card-h">Order History</span></div>
            <div className="card-body">
              <div>
                {order.events.map((ev, i) => {
                  const isLast = i === order.events.length - 1;
                  return (
                    <div key={ev.id} className="tl-item">
                      <div className={`tl-dot ${isLast ? "tl-dot-active" : "tl-dot-done"}`}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          {isLast ? <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /> : <path d="M20 6 9 17l-5-5" />}
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <StatePill state={ev.state as OrderState | "CANCELLED"} />
                          <span className="text-[11.5px]" style={{ color: "oklch(var(--ink-3))" }}>
                            by {ev.actor?.name ?? "System"} · {fmtDateTime(ev.createdAt)}
                          </span>
                        </div>
                        {ev.note && <p className="text-[12.5px] mt-1" style={{ color: "oklch(var(--ink-2))" }}>{ev.note}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          {/* Details */}
          <div className="card">
            <div className="card-head"><span className="card-h">Details</span></div>
            <div className="card-body">
              <dl className="dl">
                <dt>Customer</dt>
                <dd>{order.customer.name}</dd>
                <dt>Date</dt>
                <dd>{fmtDateTime(order.createdAt)}</dd>
                {order.msrCode && (
                  <>
                    <dt>MSR Code</dt>
                    <dd style={{ fontFamily: "monospace" }}>{order.msrCode}</dd>
                  </>
                )}
                <dt>Discount</dt>
                <dd>
                  {order.discountMode === "CUSTOMER" ? `Customer Blanket (${blanketPct}%)`
                    : order.discountMode === "PRODUCT" ? "Per-Product"
                    : "None"}
                  {canEditDiscount && <span style={{ display: "block", fontSize: 11, color: "oklch(var(--ink-3))", marginTop: 2 }}>Set it in the Order Lines panel →</span>}
                </dd>
                {order.notes && (
                  <>
                    <dt>Notes</dt>
                    <dd>{order.notes}</dd>
                  </>
                )}
              </dl>
            </div>
          </div>

          {/* Actions */}
          {transition && (
            <OrderActions
              orderId={order.id}
              transition={transition}
              currentRole={role}
              state={order.state as OrderState}
              settlement={settlement}
            />
          )}
        </div>
      </div>
    </div>
  );
}
