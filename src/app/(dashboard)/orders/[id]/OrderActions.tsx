"use client";

import { useState, useTransition } from "react";
import { advanceOrderState, cancelOrder } from "../actions";
import { useToast } from "@/components/ui/Toast";
import type { OrderState, Role } from "@prisma/client";

interface Transition {
  next: OrderState | null;
  label: string;
  roles: Role[];
}

interface Props {
  orderId: string;
  transition: Transition;
  currentRole: Role;
  state: OrderState;
}

export function OrderActions({ orderId, transition, currentRole, state }: Props) {
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
        {canAdvance && transition.next && (
          <button
            onClick={handleAdvance}
            disabled={isPending}
            className="btn btn-accent justify-center"
          >
            {isPending ? "Processing…" : transition.label}
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
