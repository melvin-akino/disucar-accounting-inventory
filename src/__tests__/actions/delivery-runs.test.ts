/**
 * Action tests for Delivery Run creation and stop reconciliation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("../../app/(dashboard)/collections/actions", () => ({ recordCollection: vi.fn() }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { recordCollection } from "@/app/(dashboard)/collections/actions";

const mockSession = (role = "WAREHOUSE") => ({
  user: { id: "user-1", name: "Test", email: "t@t.com", role },
});

describe("createDeliveryRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma as any).order = { findMany: vi.fn().mockResolvedValue([{ id: "SO-1", invoices: [{ id: "INV-1" }] }]) };
    (prisma as any).deliveryRun = { create: vi.fn().mockResolvedValue({ id: "run-1" }), count: vi.fn().mockResolvedValue(0) };
  });

  it("blocks roles other than Warehouse/Admin", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("AGENT") as any);
    const { createDeliveryRun } = await import("@/app/(dashboard)/deliveries/actions");
    await expect(
      createDeliveryRun({ runDate: "2026-01-01", orderIds: ["SO-1"] })
    ).rejects.toThrow("Forbidden");
  });

  it("creates a run with multiple order stops", async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession("WAREHOUSE") as any);
    (prisma as any).order.findMany = vi.fn().mockResolvedValue([
      { id: "SO-1", invoices: [{ id: "INV-1" }] },
      { id: "SO-2", invoices: [] },
    ]);
    const { createDeliveryRun } = await import("@/app/(dashboard)/deliveries/actions");
    await createDeliveryRun({ driverId: "d1", vehicleId: "v1", runDate: "2026-01-01", orderIds: ["SO-1", "SO-2"] });

    expect((prisma as any).deliveryRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          driverId: "d1",
          vehicleId: "v1",
          stops: { create: [{ orderId: "SO-1", invoiceId: "INV-1" }, { orderId: "SO-2", invoiceId: null }] },
        }),
      })
    );
  });
});

describe("recordStopOutcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession("WAREHOUSE") as any);
    (prisma as any).deliveryRunStop = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "stop-1",
        invoiceId: "INV-1",
        deliveryRun: { id: "run-1", runNumber: "2026-0101-0001", driverId: "driver-1" },
        order: { invoices: [] },
      }),
      update: vi.fn().mockResolvedValue({}),
    };
  });

  it("does not touch Order.state — remark is a label only", async () => {
    (prisma as any).order = { update: vi.fn() };
    const { recordStopOutcome } = await import("@/app/(dashboard)/deliveries/actions");
    await recordStopOutcome("stop-1", { remark: "DELIVERED" });
    expect((prisma as any).order.update).not.toHaveBeenCalled();
  });

  it("books a collected amount through the existing Collections module", async () => {
    const { recordStopOutcome } = await import("@/app/(dashboard)/deliveries/actions");
    await recordStopOutcome("stop-1", { remark: "DELIVERED", amountCollected: 500 });

    expect(recordCollection).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: "driver-1", invoiceId: "INV-1", amountCollected: 500 })
    );
  });

  it("rejects a collected amount when the order has no invoice", async () => {
    (prisma as any).deliveryRunStop.findUniqueOrThrow = vi.fn().mockResolvedValue({
      id: "stop-1", invoiceId: null,
      deliveryRun: { id: "run-1", runNumber: "x", driverId: null },
      order: { invoices: [] },
    });
    const { recordStopOutcome } = await import("@/app/(dashboard)/deliveries/actions");
    await expect(
      recordStopOutcome("stop-1", { remark: "DELIVERED", amountCollected: 500 })
    ).rejects.toThrow(/no invoice/);
  });
});
