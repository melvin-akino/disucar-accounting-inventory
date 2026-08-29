/**
 * Action tests for the public QR order form (submitPublicOrder).
 * Not session-gated — every input here is untrusted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from "@/lib/prisma";

const agent = { id: "agent-1", name: "Juan Agent", homeWarehouseId: "wh-1", active: true, role: "AGENT" };
const warehouse = { id: "wh-1", name: "Manila — Pasig DC" };
const catalogItem = { id: "sku-1", name: "Century Tuna 155g", unit: "can", unitPrice: 45.5, active: true };

function baseInput(overrides: Partial<{
  token: string; name: string; phone: string; email: string; address: string; honeypot: string;
  lines: { skuId: string; qty: number }[];
}> = {}) {
  return {
    token: "tok-123", name: "Maria Customer", phone: "09171234567",
    email: "", address: "123 Rizal St, Urdaneta", honeypot: "",
    lines: [{ skuId: "sku-1", qty: 3 }],
    ...overrides,
  };
}

describe("submitPublicOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma as any).user = { findFirst: vi.fn().mockResolvedValue(agent) };
    (prisma as any).warehouse = { findUnique: vi.fn().mockResolvedValue(warehouse), findFirst: vi.fn().mockResolvedValue(warehouse) };
    (prisma as any).order = {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: "SO-2026-0001" }),
    };
    (prisma as any).customer = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "cust-1" }),
    };
    (prisma as any).catalogItem = { findMany: vi.fn().mockResolvedValue([catalogItem]) };
  });

  it("rejects when the honeypot field is filled (bot)", async () => {
    const { submitPublicOrder } = await import("@/app/(public)/order/[token]/actions");
    await expect(submitPublicOrder(baseInput({ honeypot: "im-a-bot" }))).rejects.toThrow("Submission rejected");
    expect((prisma as any).order.create).not.toHaveBeenCalled();
  });

  it("rejects when the delivery address is empty (now mandatory)", async () => {
    const { submitPublicOrder } = await import("@/app/(public)/order/[token]/actions");
    await expect(submitPublicOrder(baseInput({ address: "" }))).rejects.toThrow();
    expect((prisma as any).order.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid/inactive/non-agent token", async () => {
    (prisma as any).user.findFirst = vi.fn().mockResolvedValue(null);
    const { submitPublicOrder } = await import("@/app/(public)/order/[token]/actions");
    await expect(submitPublicOrder(baseInput())).rejects.toThrow("no longer valid");
  });

  it("recomputes line price server-side, ignoring any client-tampered price", async () => {
    const { submitPublicOrder } = await import("@/app/(public)/order/[token]/actions");
    await submitPublicOrder(baseInput({ lines: [{ skuId: "sku-1", qty: 2, unitPrice: 1 } as any] }));

    const createCall = (prisma as any).order.create.mock.calls[0][0];
    expect(createCall.data.lines.create[0].unitPrice).toBe(45.5);
    expect(createCall.data.lines.create[0].lineTotal).toBe(91);
  });

  it("creates a new customer when no match by phone exists", async () => {
    const { submitPublicOrder } = await import("@/app/(public)/order/[token]/actions");
    await submitPublicOrder(baseInput());
    expect((prisma as any).customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "INDIVIDUAL", source: "QR_SELF_SERVICE", contactPhone: "09171234567" }) })
    );
  });

  it("reuses an existing customer matched by phone", async () => {
    (prisma as any).customer.findFirst = vi.fn().mockResolvedValue({ id: "existing-cust" });
    const { submitPublicOrder } = await import("@/app/(public)/order/[token]/actions");
    await submitPublicOrder(baseInput());
    expect((prisma as any).customer.create).not.toHaveBeenCalled();
    const createCall = (prisma as any).order.create.mock.calls[0][0];
    expect(createCall.data.customerId).toBe("existing-cust");
  });

  it("attributes the order to the agent's home warehouse", async () => {
    const { submitPublicOrder } = await import("@/app/(public)/order/[token]/actions");
    await submitPublicOrder(baseInput());
    const createCall = (prisma as any).order.create.mock.calls[0][0];
    expect(createCall.data.agentId).toBe("agent-1");
    expect(createCall.data.warehouseId).toBe("wh-1");
  });

  it("enforces the per-phone daily rate limit", async () => {
    (prisma as any).order.count = vi.fn().mockResolvedValue(5);
    const { submitPublicOrder } = await import("@/app/(public)/order/[token]/actions");
    await expect(submitPublicOrder(baseInput())).rejects.toThrow("Too many orders");
  });

  it("rejects a submission referencing an inactive/unknown catalog item", async () => {
    (prisma as any).catalogItem.findMany = vi.fn().mockResolvedValue([]);
    const { submitPublicOrder } = await import("@/app/(public)/order/[token]/actions");
    await expect(submitPublicOrder(baseInput())).rejects.toThrow("no longer available");
  });
});
