/**
 * Pure business-logic functions for the home-base login restriction —
 * no DB, no Next.js, fully testable. src/lib/auth.ts imports these.
 */

import type { Role } from "@prisma/client";

// ── Role/owner bypass ────────────────────────────────────────────────────────

export function canBypassLocationLock(role: Role, isOwner: boolean): boolean {
  return isOwner || role === "AGENT" || role === "DRIVER";
}

// ── IP allowlist ─────────────────────────────────────────────────────────────

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const octet = Number(p);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const ipInt = ipToInt(ip);
  const rangeInt = ipToInt(range);
  if (ipInt === null || rangeInt === null) return false;

  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/**
 * `allowlistCsv` is a comma-separated list of exact IPv4 addresses and/or
 * CIDR ranges (e.g. "203.0.113.5, 203.0.113.0/24"). An empty/blank list
 * means the restriction is disabled — everyone is allowed.
 */
export function isIpAllowed(ip: string, allowlistCsv: string): boolean {
  const entries = allowlistCsv.split(",").map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0) return true;
  return entries.some((entry) => (entry.includes("/") ? ipInCidr(ip, entry) : ip === entry));
}

// ── Header parsing ───────────────────────────────────────────────────────────

/**
 * Extracts the real client IP from request headers set by the Nginx reverse
 * proxy. Only trusts X-Real-IP — X-Forwarded-For is appended-to by
 * $proxy_add_x_forwarded_for, so its first entry is client-controlled and
 * not safe to trust for an access-control decision (see setup-aws.sh).
 */
export function extractClientIp(headers: Record<string, string | string[] | undefined> | Headers | undefined): string | null {
  if (!headers) return null;
  const get = (key: string): string | undefined => {
    if (headers instanceof Headers) return headers.get(key) ?? undefined;
    const lower = key.toLowerCase();
    const match = Object.keys(headers).find((k) => k.toLowerCase() === lower);
    const v = match ? headers[match] : undefined;
    return Array.isArray(v) ? v[0] : v;
  };
  const real = get("x-real-ip");
  return real?.trim() || null;
}
