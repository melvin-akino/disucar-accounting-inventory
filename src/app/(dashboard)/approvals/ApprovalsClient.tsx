"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { approveOrder, rejectOrder } from "./actions";
import { useToast } from "@/components/ui/Toast";
import { peso, fmtDateTime } from "@/lib/utils";

interface Order {
  id: string;
  createdAt: string;
  total: string;
  notes: string | null;
  customer: { name: string };
  quotaWarning: { label: string; remaining: number } | null;
  creditHold: { unpaidCount: number } | null;
}

interface Props { orders: Order[] }

export function ApprovalsClient({ orders }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Quota override state
  const [quotaOverrideTarget, setQuotaOverrideTarget] = useState<Order | null>(null);
  const [quotaOverrideReason, setQuotaOverrideReason] = useState("");

  // Credit hold override state
  const [creditHoldTarget, setCreditHoldTarget] = useState<Order | null>(null);
  const [creditHoldReason, setCreditHoldReason] = useState("");

  // Reasons already resolved through a prior dialog in this approval attempt, carried forward
  // so a second warning (e.g. quota, after credit hold was just cleared) doesn't lose the first.
  const [resolvedQuotaReason, setResolvedQuotaReason] = useState<string | undefined>(undefined);
  const [resolvedCreditReason, setResolvedCreditReason] = useState<string | undefined>(undefined);

  function tryApprove(orderId: string, quotaReason?: string, creditReason?: string) {
    setBusy(orderId);
    startTransition(async () => {
      try {
        await approveOrder(orderId, quotaReason, creditReason);
        toast(`Order ${orderId} approved${quotaReason || creditReason ? " with override" : ""}`, "success");
        setResolvedQuotaReason(undefined);
        setResolvedCreditReason(undefined);
        router.refresh();
      } catch (e) {
        const msg = (e as Error).message;
        const order = orders.find(o => o.id === orderId);
        if (msg.startsWith("CREDIT_HOLD_WARNING:") && order) {
          setCreditHoldTarget(order);
          setCreditHoldReason("");
          setResolvedQuotaReason(quotaReason);
        } else if (msg.startsWith("QUOTA_WARNING:") && order) {
          setQuotaOverrideTarget(order);
          setQuotaOverrideReason("");
          setResolvedCreditReason(creditReason);
        } else {
          toast(msg, "error");
        }
      } finally {
        setBusy(null);
      }
    });
  }

  function handleApprove(orderId: string) {
    tryApprove(orderId);
  }

  function handleApproveWithCreditOverride() {
    if (!creditHoldTarget || !creditHoldReason.trim()) return;
    const id = creditHoldTarget.id;
    const reason = creditHoldReason;
    setCreditHoldTarget(null);
    setCreditHoldReason("");
    // If the order is also over quota, the server throws QUOTA_WARNING next and tryApprove
    // chains into the quota dialog, carrying this credit reason forward.
    tryApprove(id, resolvedQuotaReason, reason);
  }

  function handleApproveWithOverride() {
    if (!quotaOverrideTarget || !quotaOverrideReason.trim()) return;
    const id = quotaOverrideTarget.id;
    const reason = quotaOverrideReason;
    setQuotaOverrideTarget(null);
    setQuotaOverrideReason("");
    tryApprove(id, reason, resolvedCreditReason);
  }

  function openReject(orderId: string) {
    setRejectTarget(orderId);
    setRejectReason("");
  }

  function handleReject() {
    if (!rejectTarget) return;
    const id = rejectTarget;
    setBusy(id);
    setRejectTarget(null);
    startTransition(async () => {
      try {
        await rejectOrder(id, rejectReason);
        toast(`Order ${id} rejected`, "success");
        router.refresh();
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="id">Order ID</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Notes</th>
              <th className="num">Total</th>
              <th style={{ width: 200 }}></th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </div>
                    No pending approvals
                  </div>
                </td>
              </tr>
            )}
            {orders.map((order) => {
              const isBusy = busy === order.id || (isPending && busy === order.id);
              return (
                <tr key={order.id} style={{ cursor: "default" }}>
                  <td className="id">
                    <Link href={`/orders/${order.id}`} className="hover:underline">
                      {order.id}
                    </Link>
                  </td>
                  <td>
                    <div>{order.customer.name}</div>
                    {order.creditHold && (
                      <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 2 }}>
                        ⚠ Credit hold · {order.creditHold.unpaidCount} unpaid receipts
                      </div>
                    )}
                    {order.quotaWarning && (
                      <div style={{ fontSize: 11, color: "#d97706", fontWeight: 600, marginTop: 2 }}>
                        ⚠ Over quota · {order.quotaWarning.label}
                      </div>
                    )}
                  </td>
                  <td className="dim">{fmtDateTime(new Date(order.createdAt))}</td>
                  <td className="dim" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {order.notes ?? "—"}
                  </td>
                  <td className="num">{peso(order.total)}</td>
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => handleApprove(order.id)}
                        disabled={isBusy || isPending}
                        className="btn btn-sm btn-accent"
                      >
                        {isBusy ? "…" : "Approve"}
                      </button>
                      <button
                        onClick={() => openReject(order.id)}
                        disabled={isBusy || isPending}
                        className="btn btn-sm btn-danger"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Reject modal */}
      {rejectTarget && (
        <>
          <div className="scrim" onClick={() => setRejectTarget(null)} />
          <div className="modal" style={{ width: "min(420px, 92vw)" }}>
            <div className="card-head">
              <span className="card-h">Reject Order</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setRejectTarget(null)}>✕</button>
            </div>
            <div className="card-body flex flex-col gap-4">
              <p className="text-[13px]" style={{ color: "oklch(var(--ink-2))" }}>
                Rejecting <strong>{rejectTarget}</strong>. This will cancel the order.
              </p>
              <div>
                <label className="field-label">Reason (optional)</label>
                <textarea
                  className="field-input"
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection…"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => setRejectTarget(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={handleReject}>
                  Confirm Reject
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Credit hold override modal */}
      {creditHoldTarget && (
        <>
          <div className="scrim" onClick={() => setCreditHoldTarget(null)} />
          <div className="modal" style={{ width: "min(480px, 92vw)" }}>
            <div className="card-head">
              <span className="card-h" style={{ color: "#dc2626" }}>⚠ Credit Hold Override Required</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setCreditHoldTarget(null)}>✕</button>
            </div>
            <div className="card-body flex flex-col gap-4">
              <div style={{ padding: "10px 14px", borderRadius: 7, background: "#fef2f2", border: "1px solid #fecaca" }}>
                <p style={{ fontSize: 13, color: "#991b1b", margin: 0 }}>
                  Order <strong>{creditHoldTarget.id}</strong> is for <strong>{creditHoldTarget.customer.name}</strong>,
                  who has <strong>{creditHoldTarget.creditHold?.unpaidCount}</strong> unpaid receipts outstanding —
                  on hold per Disucar policy (hold at 3 unpaid receipts).
                </p>
              </div>
              <div>
                <label className="field-label">Override Reason <span style={{ color: "#dc2626" }}>*</span></label>
                <textarea
                  className="field-input"
                  rows={3}
                  value={creditHoldReason}
                  onChange={(e) => setCreditHoldReason(e.target.value)}
                  placeholder="e.g. Customer paid via bank transfer, receipt pending posting…"
                  autoFocus
                />
                <p style={{ fontSize: 11, color: "oklch(var(--ink-3))", marginTop: 4 }}>
                  This reason will be recorded on the order and visible to Finance.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => setCreditHoldTarget(null)}>Cancel</button>
                <button
                  className="btn btn-accent"
                  onClick={handleApproveWithCreditOverride}
                  disabled={!creditHoldReason.trim() || isPending}
                >
                  Approve with Override
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Quota override modal */}
      {quotaOverrideTarget && (
        <>
          <div className="scrim" onClick={() => setQuotaOverrideTarget(null)} />
          <div className="modal" style={{ width: "min(480px, 92vw)" }}>
            <div className="card-head">
              <span className="card-h" style={{ color: "#d97706" }}>⚠ Quota Override Required</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setQuotaOverrideTarget(null)}>✕</button>
            </div>
            <div className="card-body flex flex-col gap-4">
              <div style={{ padding: "10px 14px", borderRadius: 7, background: "#fffbeb", border: "1px solid #fde68a" }}>
                <p style={{ fontSize: 13, color: "#92400e", margin: 0 }}>
                  Order <strong>{quotaOverrideTarget.id}</strong> for{" "}
                  <strong>{quotaOverrideTarget.customer.name}</strong> exceeds their active purchase quota.
                  {quotaOverrideTarget.quotaWarning && (
                    <><br />Quota period: <strong>{quotaOverrideTarget.quotaWarning.label}</strong> · Remaining: <strong>₱{quotaOverrideTarget.quotaWarning.remaining.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong></>
                  )}
                </p>
              </div>
              <div>
                <label className="field-label">Override Reason <span style={{ color: "#dc2626" }}>*</span></label>
                <textarea
                  className="field-input"
                  rows={3}
                  value={quotaOverrideReason}
                  onChange={(e) => setQuotaOverrideReason(e.target.value)}
                  placeholder="e.g. Emergency restock approved by Finance Director…"
                  autoFocus
                />
                <p style={{ fontSize: 11, color: "oklch(var(--ink-3))", marginTop: 4 }}>
                  This reason will be recorded on the order and visible to Finance.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => setQuotaOverrideTarget(null)}>Cancel</button>
                <button
                  className="btn btn-accent"
                  onClick={handleApproveWithOverride}
                  disabled={!quotaOverrideReason.trim() || isPending}
                >
                  Approve with Override
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
