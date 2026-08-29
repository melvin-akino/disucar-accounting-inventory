/**
 * Action tests for payment recording (type/bank/transfer date) and bulk mark-paid.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = (role = "FINANCE") => ({
  user: { id: "user-1", name: "Test", email: "t@t.com", role },
});

describe("recordInvoicePayment with payment details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession("FINANCE") as any);
    (prisma as any).invoice = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "INV-1", amount: 1000, paid: 0 }), update: vi.fn() };
    (prisma as any).journalEntry = { create: vi.fn(), count: vi.fn().mockResolvedValue(0) };
    (prisma as any).payment = { create: vi.fn() };
    (prisma as any).$transaction = vi.fn().mockImplementation((ops: any[]) => Promise.all(ops));
  });

  it("creates a Payment row capturing type, bank, and transfer date", async () => {
    const { recordInvoicePayment } = await import("@/app/(dashboard)/ledger/actions");
    await recordInvoicePayment("INV-1", 1000, {
      paymentType: "BANK_TRANSFER", bankName: "BPI", transferDate: "2026-01-15", referenceNo: "TXN-9",
    });
    expect((prisma as any).payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: "INV-1", amount: 1000, paymentType: "BANK_TRANSFER", bankName: "BPI", referenceNo: "TXN-9",
        }),
      })
    );
  });

  it("defaults to CASH when no details are supplied", async () => {
    const { recordInvoicePayment } = await import("@/app/(dashboard)/ledger/actions");
    await recordInvoicePayment("INV-1", 500);
    expect((prisma as any).payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentType: "CASH" }) })
    );
  });
});

describe("markInvoicesPaid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma as any).invoice = {
      findUnique: vi.fn().mockResolvedValue({ id: "INV-1", amount: 1000, paid: 0, status: "OPEN" }),
      update: vi.fn(),
    };
    (prisma as any).journalEntry = { create: vi.fn(), count: vi.fn().mockResolvedValue(0) };
    (prisma as any).payment = { create: vi.fn() };
    (prisma as any).$transaction = vi.fn().mockImplementation((ops: any[]) => Promise.all(ops));
  });

  it("redirects (blocks) non-Admin roles", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("FINANCE") as any);
    const { markInvoicesPaid } = await import("@/app/(dashboard)/ledger/actions");
    await expect(markInvoicesPaid(["INV-1"])).rejects.toThrow("REDIRECT");
  });

  it("marks each outstanding invoice fully paid and returns the count", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("ADMIN") as any);
    const { markInvoicesPaid } = await import("@/app/(dashboard)/ledger/actions");
    const res = await markInvoicesPaid(["INV-1"]);
    expect(res.count).toBe(1);
    expect((prisma as any).invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAID" }) })
    );
  });

  it("skips already-paid invoices", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("ADMIN") as any);
    (prisma as any).invoice.findUnique = vi.fn().mockResolvedValue({ id: "INV-1", amount: 1000, paid: 1000, status: "PAID" });
    const { markInvoicesPaid } = await import("@/app/(dashboard)/ledger/actions");
    const res = await markInvoicesPaid(["INV-1"]);
    expect(res.count).toBe(0);
    expect((prisma as any).invoice.update).not.toHaveBeenCalled();
  });
});
