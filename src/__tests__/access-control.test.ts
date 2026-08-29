import { describe, it, expect } from "vitest";
import { canBypassLocationLock, isIpAllowed, extractClientIp } from "@/lib/access-control";
import type { Role } from "@prisma/client";

// ── canBypassLocationLock ────────────────────────────────────────────────────

describe("canBypassLocationLock", () => {
  it("AGENT always bypasses, owner or not", () => {
    expect(canBypassLocationLock("AGENT" as Role, false)).toBe(true);
    expect(canBypassLocationLock("AGENT" as Role, true)).toBe(true);
  });

  it("DRIVER always bypasses", () => {
    expect(canBypassLocationLock("DRIVER" as Role, false)).toBe(true);
  });

  it("ADMIN bypasses only when flagged as Owner", () => {
    expect(canBypassLocationLock("ADMIN" as Role, true)).toBe(true);
    expect(canBypassLocationLock("ADMIN" as Role, false)).toBe(false);
  });

  it("FINANCE, WAREHOUSE, CUSTOMER never bypass unless owner", () => {
    for (const role of ["FINANCE", "WAREHOUSE", "CUSTOMER"] as Role[]) {
      expect(canBypassLocationLock(role, false)).toBe(false);
      expect(canBypassLocationLock(role, true)).toBe(true);
    }
  });
});

// ── isIpAllowed ───────────────────────────────────────────────────────────────

describe("isIpAllowed", () => {
  it("allows everyone when the allowlist is empty (restriction disabled)", () => {
    expect(isIpAllowed("8.8.8.8", "")).toBe(true);
    expect(isIpAllowed("8.8.8.8", "   ")).toBe(true);
  });

  it("matches an exact IP", () => {
    expect(isIpAllowed("203.0.113.5", "203.0.113.5")).toBe(true);
    expect(isIpAllowed("203.0.113.6", "203.0.113.5")).toBe(false);
  });

  it("matches within a CIDR range", () => {
    expect(isIpAllowed("203.0.113.200", "203.0.113.0/24")).toBe(true);
    expect(isIpAllowed("203.0.114.1", "203.0.113.0/24")).toBe(false);
  });

  it("supports multiple comma-separated entries, exact and CIDR mixed", () => {
    const list = "203.0.113.5, 198.51.100.0/24";
    expect(isIpAllowed("203.0.113.5", list)).toBe(true);
    expect(isIpAllowed("198.51.100.42", list)).toBe(true);
    expect(isIpAllowed("192.0.2.1", list)).toBe(false);
  });

  it("tolerates malformed entries without throwing", () => {
    expect(isIpAllowed("203.0.113.5", "not-an-ip, 203.0.113.5")).toBe(true);
    expect(() => isIpAllowed("203.0.113.5", "garbage/99")).not.toThrow();
  });
});

// ── extractClientIp ───────────────────────────────────────────────────────────

describe("extractClientIp", () => {
  it("reads x-real-ip from a plain headers object", () => {
    expect(extractClientIp({ "x-real-ip": "203.0.113.5" })).toBe("203.0.113.5");
  });

  it("is case-insensitive on the header key", () => {
    expect(extractClientIp({ "X-Real-IP": "203.0.113.5" })).toBe("203.0.113.5");
  });

  it("never trusts x-forwarded-for (spoofable)", () => {
    expect(extractClientIp({ "x-forwarded-for": "1.2.3.4" })).toBeNull();
  });

  it("returns null when no headers are present", () => {
    expect(extractClientIp(undefined)).toBeNull();
    expect(extractClientIp({})).toBeNull();
  });

  it("reads from a real Headers instance", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.9" });
    expect(extractClientIp(headers)).toBe("198.51.100.9");
  });
});
