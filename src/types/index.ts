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
export const ORDER_STATES: OrderState[] = [
  "PENDING",
  "APPROVED",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
];

export const STATE_LABEL: Record<OrderState | "CANCELLED", string> = {
  PENDING:   "Pending Review",
  APPROVED:  "Approved",
  PREPARING: "Preparing",
  SHIPPED:   "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const NEXT_STATE: Record<
  OrderState,
  { next: OrderState | null; label: string; roles: Role[] } | null
> = {
  PENDING:   { next: "APPROVED",  label: "Approve order",   roles: ["FINANCE", "ADMIN"] },
  APPROVED:  { next: "PREPARING", label: "Start preparing", roles: ["WAREHOUSE", "ADMIN"] },
  PREPARING: { next: "SHIPPED",   label: "Mark shipped",    roles: ["WAREHOUSE", "ADMIN"] },
  SHIPPED:   { next: "DELIVERED", label: "Confirm delivery",roles: ["WAREHOUSE", "ADMIN", "FINANCE"] },
  DELIVERED: null,
  CANCELLED: null,
};

// ── Nav item type ─────────────────────────────────────────────────────────────
export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  count?: number;
  roles?: Role[];
}
