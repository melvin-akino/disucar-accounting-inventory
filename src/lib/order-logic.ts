/**
 * Pure business-logic functions — no DB, no Next.js, fully testable.
 * Server actions import these and pass in the DB-fetched data.
 */

import type { OrderState, Role } from "@prisma/client";
import { NEXT_STATE } from "@/types";

// ── Order totals ──────────────────────────────────────────────────────────────

export interface OrderTotals {
  subtotal: number;
  vat: number;
  cwt: number;
  total: number;
}

export function computeOrderTotals(subtotal: number, cwt2307: boolean): OrderTotals {
  const vat = Math.round(subtotal * 0.12 * 100) / 100;
  const cwt = cwt2307 ? Math.round(subtotal * 0.02 * 100) / 100 : 0;
  return { subtotal, vat, cwt, total: subtotal + vat - cwt };
}

// ── Credit availability ───────────────────────────────────────────────────────

export interface CreditCheck {
  creditLimit: number;
  outstanding: number;
  available: number;
  newOrderTotal: number;
  allowed: boolean;
  overLimitBy: number;
}

export function checkCredit(
  creditLimit: number,
  outstanding: number,
  newOrderTotal: number
): CreditCheck {
  const available = creditLimit - outstanding;
  const allowed = creditLimit === 0 || outstanding + newOrderTotal <= creditLimit;
  const overLimitBy = allowed ? 0 : outstanding + newOrderTotal - creditLimit;
  return { creditLimit, outstanding, available, newOrderTotal, allowed, overLimitBy };
}

// ── Stock availability ────────────────────────────────────────────────────────

export interface StockCheck {
  onHand: number;
  reserved: number;
  available: number;
  requested: number;
  sufficient: boolean;
  deficit: number;
}

export function checkStock(onHand: number, reserved: number, requested: number): StockCheck {
  const available = onHand - reserved;
  const sufficient = available >= requested;
  const deficit = sufficient ? 0 : requested - available;
  return { onHand, reserved, available, requested, sufficient, deficit };
}

// ── State-machine ─────────────────────────────────────────────────────────────

export function canAdvanceState(currentState: OrderState, role: Role): boolean {
  const transition = NEXT_STATE[currentState];
  if (!transition) return false;
  return transition.roles.includes(role);
}

export function nextOrderState(currentState: OrderState): OrderState | null {
  return NEXT_STATE[currentState]?.next ?? null;
}

// ── FEFO lot selection ────────────────────────────────────────────────────────

export interface LotInput {
  id: string;
  remainingQty: number;
  expiryDate: Date | null;
}

export interface LotAllocation {
  lotId: string;
  take: number;
}

// ── FIFO lot selection ────────────────────────────────────────────────────────

export interface CostedLotInput {
  id: string;
  remainingQty: number;
  unitCost: number;
  receivedAt: Date;
}

export interface CostedLotAllocation {
  lotId: string;
  take: number;
  unitCost: number;
  costTotal: number;
}

/** Round to centavos. Costing must not carry float dust into the ledger. */
function toCentavos(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Select lots using First-In-First-Out and cost each slice at the lot's own unit cost.
 *
 * This is the default for construction materials, where cost moves per delivery but
 * nothing expires — FEFO (`selectLotsFefo`) degenerates to arbitrary order there because
 * every expiryDate is null. One order line legitimately spans several lots: 15 bags drawn
 * from a 10-bag layer at 200.00 and a later layer at 205.00 costs 3,025.00, not 15 x 205.
 *
 * Ties on receivedAt break by id so allocation is deterministic and reproducible.
 * Throws if the open layers cannot satisfy neededQty.
 */
export function selectLotsFifo(
  lots: CostedLotInput[],
  neededQty: number
): CostedLotAllocation[] {
  if (neededQty <= 0) return [];

  const sorted = [...lots]
    .filter((l) => l.remainingQty > 0)
    .sort((a, b) => {
      const diff = a.receivedAt.getTime() - b.receivedAt.getTime();
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });

  const allocations: CostedLotAllocation[] = [];
  let remaining = neededQty;

  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remainingQty, remaining);
    allocations.push({
      lotId: lot.id,
      take,
      unitCost: lot.unitCost,
      costTotal: toCentavos(take * lot.unitCost),
    });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient lot stock: needed ${neededQty}, available ${neededQty - remaining}`
    );
  }

  return allocations;
}

/** Total cost of a set of allocations — the amount debited to COGS. */
export function totalAllocationCost(allocations: CostedLotAllocation[]): number {
  return toCentavos(allocations.reduce((sum, a) => sum + a.costTotal, 0));
}

/**
 * Select lots using First-Expiry-First-Out (FEFO).
 * Lots with no expiry are consumed last.
 * Returns array of {lotId, take} allocations that satisfy neededQty.
 * Throws if total remaining across lots is insufficient.
 */
export function selectLotsFefo(lots: LotInput[], neededQty: number): LotAllocation[] {
  if (neededQty <= 0) return [];

  // Sort: earliest expiry first, null expiry last
  const sorted = [...lots]
    .filter(l => l.remainingQty > 0)
    .sort((a, b) => {
      if (a.expiryDate === null && b.expiryDate === null) return 0;
      if (a.expiryDate === null) return 1;
      if (b.expiryDate === null) return -1;
      return a.expiryDate.getTime() - b.expiryDate.getTime();
    });

  const allocations: LotAllocation[] = [];
  let remaining = neededQty;

  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remainingQty, remaining);
    allocations.push({ lotId: lot.id, take });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient lot stock: needed ${neededQty}, available ${neededQty - remaining}`
    );
  }

  return allocations;
}

// ── Statement of account rows ─────────────────────────────────────────────────

export interface InvoiceInput {
  id: string;
  soId: string | null;
  issued: Date;
  updatedAt: Date;
  amount: number;
  paid: number;
}

export interface StatementRow {
  date: Date;
  ref: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export function buildStatementRows(invoices: InvoiceInput[]): StatementRow[] {
  const rows: Omit<StatementRow, "balance">[] = [];

  for (const inv of invoices) {
    rows.push({
      date: inv.issued,
      ref: inv.id,
      description: inv.soId ? `Invoice — SO ${inv.soId}` : "Invoice",
      debit: inv.amount,
      credit: 0,
    });
    if (inv.paid > 0) {
      rows.push({
        date: inv.updatedAt,
        ref: `PMT-${inv.id}`,
        description: "Payment received",
        debit: 0,
        credit: inv.paid,
      });
    }
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  let balance = 0;
  return rows.map(r => {
    balance += r.debit - r.credit;
    return { ...r, balance };
  });
}

// ── Return quantity validation ─────────────────────────────────────────────────

export interface ReturnLineInput {
  skuId: string;
  qtyRequested: number;
  originalQty: number;
}

export interface ReturnValidation {
  valid: boolean;
  errors: string[];
}

export function validateReturnQtys(lines: ReturnLineInput[]): ReturnValidation {
  const errors: string[] = [];
  for (const line of lines) {
    if (line.qtyRequested <= 0) {
      errors.push(`Return quantity must be greater than 0 for SKU ${line.skuId}`);
    }
    if (line.qtyRequested > line.originalQty) {
      errors.push(
        `Cannot return ${line.qtyRequested} of SKU ${line.skuId}: only ${line.originalQty} was originally ordered`
      );
    }
  }
  return { valid: errors.length === 0, errors };
}
