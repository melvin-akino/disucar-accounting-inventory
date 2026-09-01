/**
 * Cashier shift totals — the Z-read.
 *
 * A Z-read answers one question at the end of a till session: does the drawer hold what
 * the system says was taken? Only cash can be counted, so cash is separated from the
 * other tenders rather than lumped into a single figure the cashier cannot verify.
 *
 * Pure functions, no Prisma import, so the action and the tests share them.
 */

export type TenderType = "CASH" | "BANK_TRANSFER" | "CHECK" | string;

export interface ShiftPayment {
  amount: number;
  paymentType: TenderType;
}

export interface TenderLine {
  tender: TenderType;
  label: string;
  count: number;
  amount: number;
}

export interface ZRead {
  /** Cash the drawer should hold — the only figure a cashier can physically verify. */
  expectedCash: number;
  /** Everything settled by other means; recorded, but never counted in the drawer. */
  nonCashTotal: number;
  /** Cash plus non-cash: the session's takings. */
  totalTaken: number;
  paymentCount: number;
  byTender: TenderLine[];
}

const TENDER_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CHECK: "Check",
};

function toCentavos(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeZRead(payments: ShiftPayment[]): ZRead {
  const tenders = new Map<string, TenderLine>();
  let expectedCash = 0;
  let nonCashTotal = 0;

  for (const p of payments) {
    const key = p.paymentType;
    if (!tenders.has(key)) {
      tenders.set(key, { tender: key, label: TENDER_LABEL[key] ?? key, count: 0, amount: 0 });
    }
    const line = tenders.get(key)!;
    line.count += 1;
    line.amount += p.amount;

    if (key === "CASH") expectedCash += p.amount;
    else nonCashTotal += p.amount;
  }

  const byTender = Array.from(tenders.values())
    .map((t) => ({ ...t, amount: toCentavos(t.amount) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    expectedCash: toCentavos(expectedCash),
    nonCashTotal: toCentavos(nonCashTotal),
    totalTaken: toCentavos(expectedCash + nonCashTotal),
    paymentCount: payments.length,
    byTender,
  };
}

/**
 * Variance against the counted drawer: positive is an overage, negative a shortage.
 * Only cash is compared — a bank transfer cannot be short in the till.
 */
export function cashVariance(expectedCash: number, countedCash: number): number {
  return toCentavos(countedCash - expectedCash);
}

export interface CloseValidation {
  ok: boolean;
  error?: string;
}

/**
 * A shift may close with a variance — that is the point of counting — but not with a
 * nonsensical count. Refusing negative or non-numeric input keeps a typo from being
 * signed off as a shortage.
 */
export function validateClose(countedCash: number): CloseValidation {
  if (!Number.isFinite(countedCash)) {
    return { ok: false, error: "Enter the cash counted in the drawer." };
  }
  if (countedCash < 0) {
    return { ok: false, error: "Counted cash cannot be negative." };
  }
  return { ok: true };
}

/** Wording for the variance line, so the number is never presented without its sense. */
export function describeVariance(variance: number): string {
  if (Math.abs(variance) < 0.01) return "Drawer balances";
  return variance > 0
    ? `Over by ${variance.toFixed(2)}`
    : `Short by ${Math.abs(variance).toFixed(2)}`;
}
