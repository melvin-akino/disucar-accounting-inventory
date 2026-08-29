import type { Role, OrderState } from "@prisma/client";

// ── Session augmentation ──────────────────────────────────────────────────────
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      customerId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    customerId?: string;
  }
}

// ── Re-exports for convenience ────────────────────────────────────────────────
export type { Role, OrderState };

// ── Order state machine ───────────────────────────────────────────────────────
//
// Two entry paths that converge at the till:
//
//   RETAIL     PENDING → AWAITING_PAYMENT → PAID → PREPARING → SHIPPED → DELIVERED
//   WHOLESALE  PENDING → APPROVED → AWAITING_PAYMENT → PAID → PREPARING → SHIPPED → DELIVERED
//
// Retail has no approval step — the cashier pricing the order at the counter is the
// confirmation. Wholesale keeps the Admin gate. Neither reaches the warehouse before
// PAID: the yard never picks stock for an unsettled order unless an Admin releases it
// on account (Order.codRelease).
//
// SHIPPED is labelled "Dispatched" throughout the UI. The enum value is left alone
// deliberately — renaming it would rewrite historical rows for a wording change.

export const ORDER_STATES: OrderState[] = [
  "PENDING",
  "APPROVED",
  "AWAITING_PAYMENT",
  "PAID",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
];

export const STATE_LABEL: Record<OrderState | "CANCELLED", string> = {
  PENDING:          "Pending Review",
  APPROVED:         "Approved",
  AWAITING_PAYMENT: "Awaiting Payment",
  PAID:             "Paid",
  PREPARING:        "Preparing",
  SHIPPED:          "Dispatched",
  DELIVERED:        "Delivered",
  CANCELLED:        "Cancelled",
};

export type OrderChannelValue = "RETAIL" | "WHOLESALE";

export interface StateTransition {
  next: OrderState | null;
  label: string;
  roles: Role[];
}

// Steps shared by both channels once the order has been priced.
const COMMON_TRANSITIONS: Partial<Record<OrderState, StateTransition>> = {
  // Settlement is not a plain state advance — it goes through the cashier's payment
  // action, which needs an amount. Exposed here so the UI can label the step.
  AWAITING_PAYMENT: { next: "PAID",       label: "Take payment",     roles: ["CASHIER", "FINANCE", "ADMIN"] },
  PAID:             { next: "PREPARING",  label: "Start preparing",  roles: ["WAREHOUSE", "ADMIN"] },
  PREPARING:        { next: "SHIPPED",    label: "Dispatch order",   roles: ["WAREHOUSE", "ADMIN"] },
  SHIPPED:          { next: "DELIVERED",  label: "Confirm delivery", roles: ["WAREHOUSE", "ADMIN", "FINANCE"] },
  DELIVERED:        { next: null,         label: "",                 roles: [] },
  CANCELLED:        { next: null,         label: "",                 roles: [] },
};

/**
 * The transition available from `state` on `channel`, or null at a terminal state.
 *
 * Replaces the flat NEXT_STATE map, which could not express that PENDING advances to
 * APPROVED for wholesale but straight to AWAITING_PAYMENT for retail.
 */
export function nextTransition(
  state: OrderState,
  channel: OrderChannelValue
): StateTransition | null {
  if (state === "PENDING") {
    return channel === "WHOLESALE"
      ? { next: "APPROVED",         label: "Approve order", roles: ["ADMIN"] }
      : { next: "AWAITING_PAYMENT", label: "Compute order", roles: ["CASHIER", "FINANCE", "ADMIN"] };
  }
  if (state === "APPROVED") {
    // Only wholesale reaches APPROVED; retail is priced straight from PENDING.
    return { next: "AWAITING_PAYMENT", label: "Compute order", roles: ["CASHIER", "FINANCE", "ADMIN"] };
  }
  const t = COMMON_TRANSITIONS[state];
  return t && t.next ? t : null;
}

// ── Nav item type ─────────────────────────────────────────────────────────────
export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  count?: number;
  roles?: Role[];
}
