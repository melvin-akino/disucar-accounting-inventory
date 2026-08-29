import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function peso(n: number | string | { toNumber: () => number }) {
  const val = typeof n === "object" ? n.toNumber() : Number(n);
  return "₱" + val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function shortPeso(n: number | string | { toNumber: () => number }) {
  const val = typeof n === "object" ? n.toNumber() : Number(n);
  const v = Math.abs(val);
  if (v >= 1e6) return "₱" + (val / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "₱" + Math.round(val / 1e3) + "K";
  return "₱" + Math.round(val);
}

export function fmtRel(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function fmtDate(date: Date | string) {
  return format(new Date(date), "MMM d, yyyy");
}

export function fmtDateTime(date: Date | string) {
  return format(new Date(date), "MMM d · HH:mm");
}

// VAT / CWT helpers (Philippines)
export function vatOf(subtotal: number, rate = 0.12) {
  return subtotal * rate;
}

export function cwtOf(subtotal: number, rate = 0.02, apply = false) {
  return apply ? subtotal * rate : 0;
}

export function orderTotal(subtotal: number, cwt2307: boolean) {
  const vat = vatOf(subtotal);
  const cwt = cwtOf(subtotal, 0.02, cwt2307);
  return { subtotal, vat, cwt, total: subtotal + vat - cwt };
}

/**
 * The "this morning" window for a given moment: midnight to 11:59:59.999 AM
 * on that same day, inclusive. Used for the Morning Order Activity dashboard
 * card — orders placed strictly before noon.
 */
export function getMorningWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(11, 59, 59, 999);
  return { start, end };
}
