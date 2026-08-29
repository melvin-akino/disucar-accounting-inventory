/**
 * Wholesale channel rules: pricing and minimum-quantity enforcement.
 *
 * Pure functions, no Prisma import, so both the order-creation action and the approval
 * action can call them and the tests can drive them directly. The rules are checked in
 * both places deliberately — lines can be edited between creation and approval, and a
 * server action is a public HTTP endpoint, so the client-side form is never the gate.
 */

export type OrderChannelValue = "RETAIL" | "WHOLESALE";

export interface PricedItem {
  id: string;
  name: string;
  unitPrice: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number | null;
}

export interface WholesaleThresholds {
  defaultMinQty: number;
  minOrderTotal: number;
}

export interface OrderLineInput {
  skuId: string;
  qty: number;
}

export interface WholesaleViolation {
  skuId: string | null;
  message: string;
}

/**
 * Selling price for one unit on the given channel.
 *
 * A wholesale order may only contain items that carry a wholesale price — falling back
 * to the retail price would silently sell at the wrong tier, so this throws instead.
 */
export function resolveUnitPrice(item: PricedItem, channel: OrderChannelValue): number {
  if (channel === "RETAIL") return item.unitPrice;
  if (item.wholesalePrice === null) {
    throw new Error(`${item.name} has no wholesale price and cannot be sold wholesale.`);
  }
  return item.wholesalePrice;
}

/** Effective per-line minimum for a SKU: its own override, else the org default. */
export function minQtyFor(item: PricedItem, thresholds: WholesaleThresholds): number {
  return item.wholesaleMinQty ?? thresholds.defaultMinQty;
}

/**
 * Validate a wholesale order against the configured minimums.
 *
 * Returns every violation rather than the first, so the salesperson sees the full set
 * of corrections in one pass instead of resubmitting repeatedly.
 * RETAIL orders are unconstrained and always return [].
 */
export function checkWholesaleMinimums(
  channel: OrderChannelValue,
  lines: OrderLineInput[],
  items: Map<string, PricedItem>,
  thresholds: WholesaleThresholds,
  orderTotal: number
): WholesaleViolation[] {
  if (channel !== "WHOLESALE") return [];

  const violations: WholesaleViolation[] = [];

  for (const line of lines) {
    const item = items.get(line.skuId);
    if (!item) {
      violations.push({ skuId: line.skuId, message: `Unknown item ${line.skuId}.` });
      continue;
    }
    if (item.wholesalePrice === null) {
      violations.push({
        skuId: item.id,
        message: `${item.name} is not available for wholesale.`,
      });
      continue;
    }
    const min = minQtyFor(item, thresholds);
    if (line.qty < min) {
      violations.push({
        skuId: item.id,
        message: `${item.name} requires at least ${min} per wholesale order line (ordered ${line.qty}).`,
      });
    }
  }

  if (thresholds.minOrderTotal > 0 && orderTotal < thresholds.minOrderTotal) {
    violations.push({
      skuId: null,
      message:
        `Wholesale orders must total at least ` +
        `${thresholds.minOrderTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })} ` +
        `(this order is ${orderTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}).`,
    });
  }

  return violations;
}

/** Collapse violations into one message for a server action's error return. */
export function formatViolations(violations: WholesaleViolation[]): string {
  return violations.map((v) => v.message).join(" ");
}

/**
 * Roles permitted to approve an order on this channel.
 *
 * Wholesale commits inventory at a discounted tier and in bulk, so it is ADMIN-only —
 * narrower than the FINANCE-or-ADMIN gate that retail orders use.
 */
export function approverRolesFor(channel: OrderChannelValue): string[] {
  return channel === "WHOLESALE" ? ["ADMIN"] : ["FINANCE", "ADMIN"];
}

export function canApprove(channel: OrderChannelValue, role: string): boolean {
  return approverRolesFor(channel).includes(role);
}
