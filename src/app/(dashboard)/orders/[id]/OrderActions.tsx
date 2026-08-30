"use client";

import { useState, useTransition } from "react";
import { advanceOrderState, cancelOrder, takeOrderPayment, releaseOrderOnAccount } from "../actions";
import { peso } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import type { OrderState, Role, PaymentType } from "@prisma/client";

interface Transition {
  next: OrderState | null;
  label: string;
  roles: Role[];
}

interface Settlement {
  total: number;
  paid: number;
  balance: number;
  canRelease: boolean;
  onAccount: boolean;
}

interface Props {
  orderId: string;
  transition: Transition;
  currentRole: Role;
  state: OrderState;
  settlement: Settlement;
}

/**
 * The counter till. Shown while an order is awaiting payment.
 *
 * Taking the final payment releases the order to the warehouse in the same transaction,
 * so the state advances as a consequence of the money rather than as a separate click
 * someone could forget or perform out of order.
 */
function TillPanel({
  orderId,
  settlement,
  currentRole,
}: {
  orderId: string;
  settlement: Settlement;
  currentRole: Role;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState(settlement.balance.toFixed(2));
  const [paymentType, setPaymentType] = useState<PaymentType>("CASH");
  const [reference, setReference] = useState("");
  const [showRelease, setShowRelease] = useState(false);
  const [releaseReason, setReleaseReason] = useState("");

  const canTake = (["CASHIER", "FINANCE", "ADMIN"] as Role[]).includes(currentRole);
  const isAdmin = currentRole === "ADMIN";

  function submitPayment() {
    startTransition(async () => {
      try {
        const res = await takeOrderPayment(orderId, parseFloat(amount) || 0, {
          paymentType,
          referenceNo: reference || undefined,
        });
        if (!res.ok) { toast(res.error, "error"); return; }
        toast(
          res.settled ? "Paid in full — released to the warehouse" : "Partial payment recorded",
          "success"
        );
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  function submitRelease() {
    startTransition(async () => {
      try {
        const res = await releaseOrderOnAccount(orderId, releaseReason);
        if (!res.ok) { toast(res.error, "error"); return; }
        setShowRelease(false);
        toast("Released on account", "info");
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  return (
    <div style={{ padding: "10px 12px", borderRadius: 7, background: "oklch(var(--bg-2))", border: "1px solid oklch(var(--line))", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
        <span style={{ color: "oklch(var(--ink-3))" }}>Order total</span>
        <span style={{ fontWeight: 600 }}>{peso(settlement.total)}</span>
      </div>
      {settlement.paid > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
          <span style={{ color: "oklch(var(--ink-3))" }}>Paid so far</span>
          <span>{peso(settlement.paid)}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
        <span>Balance</span>
        <span style={{ color: settlement.balance > 0 ? "oklch(var(--err))" : "inherit" }}>
          {peso(settlement.balance)}
        </span>
      </div>

      {settlement.onAccount && (
        <p style={{ fontSize: 11.5, color: "oklch(var(--ink-3))" }}>
          Released on account by an Admin — the warehouse may prepare this order before payment.
        </p>
      )}

      {canTake && settlement.balance > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label className="field-label">Amount received</label>
              <input
                className="field-input" type="number" min="0" step="0.01"
                style={{ textAlign: "right" }}
                value={amount} onChange={e => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Method</label>
              <select className="field-input" value={paymentType} onChange={e => setPaymentType(e.target.value as PaymentType)}>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CHECK">Check</option>
              </select>
            </div>
          </div>
          {paymentType !== "CASH" && (
            <input
              className="field-input" placeholder="Reference no."
              value={reference} onChange={e => setReference(e.target.value)}
            />
          )}
          <button className="btn btn-accent justify-center" disabled={isPending} onClick={submitPayment}>
            {isPending ? "Processing…" : `Take payment ${peso(parseFloat(amount) || 0)}`}
          </button>
        </>
      )}

      {isAdmin && !settlement.canRelease && !showRelease && (
        <button className="btn justify-center" onClick={() => setShowRelease(true)}>
          Release on account (COD / terms)
        </button>
      )}
      {showRelease && (
        <>
          <textarea
            className="field-input" rows={2}
            placeholder="Why is this order leaving unpaid? (required)"
            value={releaseReason} onChange={e => setReleaseReason(e.target.value)}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn flex-1 justify-center" onClick={() => setShowRelease(false)}>Cancel</button>
            <button className="btn btn-danger flex-1 justify-center" disabled={isPending} onClick={submitRelease}>
              Confirm release
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function OrderActions({ orderId, transition, currentRole, state, settlement }: Props) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const canAdvance = transition.roles.includes(currentRole);
  const canCancel = (["FINANCE", "ADMIN"] as Role[]).includes(currentRole) &&
    state !== "DELIVERED" && state !== "CANCELLED";

  function handleAdvance() {
    startTransition(async () => {
      try {
        const result = await advanceOrderState(orderId);
        if (!result.ok) {
          toast(result.error, "error");
          return;
        }
        toast(`Order advanced to ${transition.next}`, "success");
      } catch (e) {
        toast((e as Error).message, "error");
      }
    });
  }

  async function handleCancel() {
    try {
      await cancelOrder(orderId, cancelReason);
      setShowCancel(false);
      toast("Order cancelled", "info");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="card">
      <div className="card-head"><span className="card-h">Actions</span></div>
      <div className="card-body flex flex-col gap-2">
        {state === "AWAITING_PAYMENT" && (
          <TillPanel orderId={orderId} settlement={settlement} currentRole={currentRole} />
        )}
        {canAdvance && transition.next && (state !== "AWAITING_PAYMENT" || settlement.canRelease) && (
          <button
            onClick={handleAdvance}
            disabled={isPending}
            className="btn btn-accent justify-center"
          >
            {isPending
              ? "Processing…"
              : /* At AWAITING_PAYMENT this button only appears once the order is
                   releasable. If it got there on an Admin's account release rather than
                   on money received, "Take payment" would describe the wrong action. */
                state === "AWAITING_PAYMENT" && settlement.onAccount
                ? "Send to warehouse (on account)"
                : transition.label}
          </button>
        )}
        {canCancel && !showCancel && (
          <button onClick={() => setShowCancel(true)} className="btn btn-danger justify-center">
            Cancel order
          </button>
        )}
        {showCancel && (
          <div className="flex flex-col gap-2">
            <textarea
              className="field-input"
              rows={2}
              placeholder="Reason for cancellation…"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={handleCancel} className="btn btn-danger flex-1 justify-center">
                Confirm cancel
              </button>
              <button onClick={() => setShowCancel(false)} className="btn btn-ghost flex-1 justify-center">
                Keep
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
