/**
 * Settlement rules for the counter.
 *
 * The order flow puts payment before the warehouse touches anything: nothing is picked
 * or dispatched for an unsettled order. The one exception is an Admin releasing an order
 * on account (COD or terms), which is recorded on the order rather than inferred.
 *
 * Pure functions, no Prisma import, so the cashier action and the tests share them.
 */

/** Money comparisons tolerate sub-centavo dust from percentage discounts. */
const EPSILON = 0.01;

export interface SettlementState {
  /** Order total including VAT and any CWT adjustment. */
  total: number;
  /** Sum of payments received against this order. */
  paid: number;
  /** Admin released this order on account — it may reach PAID unsettled. */
  codRelease: boolean;
}

export interface SettlementView {
  balance: number;
  isSettled: boolean;
  /** May the order advance to PAID and reach the warehouse? */
  canRelease: boolean;
  /** True when it advances on an Admin release rather than on money received. */
  onAccount: boolean;
}

export function settlementView(s: SettlementState): SettlementView {
  const balance = Math.round((s.total - s.paid) * 100) / 100;
  const isSettled = balance <= EPSILON;
  return {
    balance,
    isSettled,
    canRelease: isSettled || s.codRelease,
    onAccount: !isSettled && s.codRelease,
  };
}

/**
 * Validate a payment about to be taken at the till.
 *
 * Overpayment is rejected rather than silently recorded: at a counter it almost always
 * means a mistyped amount, and change given from the drawer is not a payment.
 */
export function validatePayment(
  amount: number,
  s: SettlementState
): { ok: boolean; error?: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Payment amount must be greater than zero." };
  }
  const { balance } = settlementView(s);
  if (balance <= EPSILON) {
    return { ok: false, error: "This order is already settled." };
  }
  if (amount - balance > EPSILON) {
    return {
      ok: false,
      error: `Payment exceeds the outstanding balance of ${balance.toFixed(2)}.`,
    };
  }
  return { ok: true };
}

/**
 * Why an order cannot yet go to the warehouse, or null when it can.
 * Phrased for the person holding the order, not the developer.
 */
export function blockingReason(s: SettlementState): string | null {
  const view = settlementView(s);
  if (view.canRelease) return null;
  return `Order is not settled — ${view.balance.toFixed(2)} outstanding. ` +
    `Take payment at the till, or ask an Admin to release it on account.`;
}
