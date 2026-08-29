/**
 * Action tests for field collections and remittances.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = (role = "AGENT", id = "emp-1") => ({
  user: { id, name: "Test Agent", email: "agent@disucarsales.ph", role },
});

const openInvoice = { id: "INV-1", amount: 1000, paid: 200 };

// ── recordCollection ─────────────────────────────────────────────────────────

describe("recordCollection", () => {
  let tx: { collection: { create: ReturnType<typeof vi.fn> }; invoice: { update: ReturnType<typeof vi.fn> }; journalEntry: { create: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession() as any);
    (prisma as any).invoice = { findUniqueOrThrow: vi.fn().mockResolvedValue(openInvoice) };
    (prisma as any).journalEntry = { count: vi.fn().mockResolvedValue(0) };
    tx = {
      collection: { create: vi.fn().mockResolvedValue({}) },
      invoice: { update: vi.fn().mockResolvedValue({}) },
      journalEntry: { create: vi.fn().mockResolvedValue({}) },
    };
    (prisma as any).$transaction = vi.fn().mockImplementation((fn: any) => fn(tx));
  });

  it("blocks unauthorized roles", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("CUSTOMER") as any);
    const { recordCollection } = await import("@/app/(dashboard)/collections/actions");
    await expect(
      recordCollection({ employeeId: "emp-1", invoiceId: "INV-1", amountCollected: 100 })
    ).rejects.toThrow("Forbidden");
  });

  it("blocks an agent from logging a collection for someone else", async () => {
    const { recordCollection } = await import("@/app/(dashboard)/collections/actions");
    await expect(
      recordCollection({ employeeId: "someone-else", invoiceId: "INV-1", amountCollected: 100 })
    ).rejects.toThrow("Forbidden");
  });

  it("rejects collecting more than the invoice balance", async () => {
    const { recordCollection } = await import("@/app/(dashboard)/collections/actions");
    // balance = 1000 - 200 = 800
    await expect(
      recordCollection({ employeeId: "emp-1", invoiceId: "INV-1", amountCollected: 900 })
    ).rejects.toThrow("balance is only");
  });

  it("creates the collection, updates the invoice, and posts the JE", async () => {
    const { recordCollection } = await import("@/app/(dashboard)/collections/actions");
    await recordCollection({ employeeId: "emp-1", invoiceId: "INV-1", amountCollected: 300 });

    expect(tx.collection.create).toHaveBeenCalledOnce();
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paid: 500, status: "PARTIAL" }) })
    );
    const je = tx.journalEntry.create.mock.calls[0][0];
    expect(je.data.lines.create).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "1030", dr: 300 }),
        expect.objectContaining({ code: "1100", cr: 300 }),
      ])
    );
  });

  it("marks the invoice PAID when the full balance is collected", async () => {
    const { recordCollection } = await import("@/app/(dashboard)/collections/actions");
    await recordCollection({ employeeId: "emp-1", invoiceId: "INV-1", amountCollected: 800 });
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paid: 1000, status: "PAID" }) })
    );
  });
});

// ── recordRemittance ─────────────────────────────────────────────────────────

describe("recordRemittance", () => {
  const pendingCollections = [
    { id: "C1", amountCollected: 300, amountRemitted: 0, status: "PENDING" },
    { id: "C2", amountCollected: 200, amountRemitted: 0, status: "PENDING" },
  ];

  let tx: { collection: { update: ReturnType<typeof vi.fn> }; journalEntry: { create: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession("FINANCE", "fin-1") as any);
    (prisma as any).collection = { findMany: vi.fn().mockResolvedValue(pendingCollections) };
    (prisma as any).journalEntry = { count: vi.fn().mockResolvedValue(0) };
    tx = {
      collection: { update: vi.fn().mockResolvedValue({}) },
      journalEntry: { create: vi.fn().mockResolvedValue({}) },
    };
    (prisma as any).$transaction = vi.fn().mockImplementation((fn: any) => fn(tx));
  });

  it("blocks non-Finance/Admin roles", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("AGENT") as any);
    const { recordRemittance } = await import("@/app/(dashboard)/collections/actions");
    await expect(
      recordRemittance({ collectionIds: ["C1", "C2"], amountRemitted: 500 })
    ).rejects.toThrow("Forbidden");
  });

  it("marks collections REMITTED when the full amount comes in", async () => {
    const { recordRemittance } = await import("@/app/(dashboard)/collections/actions");
    await recordRemittance({ collectionIds: ["C1", "C2"], amountRemitted: 500 });

    expect(tx.collection.update).toHaveBeenCalledTimes(2);
    for (const call of tx.collection.update.mock.calls) {
      expect(call[0].data.status).toBe("REMITTED");
    }
    const je = tx.journalEntry.create.mock.calls[0][0];
    expect(je.data.lines.create).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "1010", dr: 500 }),
        expect.objectContaining({ code: "1030", cr: 500 }),
      ])
    );
  });

  it("rejects a short remittance without a shortage note", async () => {
    const { recordRemittance } = await import("@/app/(dashboard)/collections/actions");
    await expect(
      recordRemittance({ collectionIds: ["C1", "C2"], amountRemitted: 300 })
    ).rejects.toThrow("shortage note is required");
  });

  it("marks collections SHORT when a shortage note is supplied", async () => {
    const { recordRemittance } = await import("@/app/(dashboard)/collections/actions");
    await recordRemittance({ collectionIds: ["C1", "C2"], amountRemitted: 300, shortageNote: "Employee says rest is coming tomorrow" });

    for (const call of tx.collection.update.mock.calls) {
      expect(call[0].data.status).toBe("SHORT");
      expect(call[0].data.shortageNote).toBe("Employee says rest is coming tomorrow");
    }
  });

  it("rejects remitting a collection that's already fully remitted", async () => {
    (prisma as any).collection.findMany = vi.fn().mockResolvedValue([
      { id: "C1", amountCollected: 300, amountRemitted: 300, status: "REMITTED" },
    ]);
    const { recordRemittance } = await import("@/app/(dashboard)/collections/actions");
    await expect(
      recordRemittance({ collectionIds: ["C1"], amountRemitted: 100 })
    ).rejects.toThrow("already fully remitted");
  });
});
