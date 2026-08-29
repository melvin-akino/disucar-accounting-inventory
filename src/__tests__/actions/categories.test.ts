/**
 * Action tests for product category CRUD (catalog/actions.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = (role = "ADMIN") => ({ user: { id: "u1", name: "T", email: "t@t.com", role } });

describe("category actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession() as any);
  });

  it("blocks unauthenticated users from creating a category", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const { createCategory } = await import("@/app/(dashboard)/catalog/actions");
    await expect(createCategory({ code: "SNACKS", name: "Snacks", sortOrder: 0, active: true })).rejects.toThrow("Forbidden");
  });

  it("rejects a duplicate category code on create", async () => {
    (prisma as any).category = { findUnique: vi.fn().mockResolvedValue({ id: "c1" }) };
    const { createCategory } = await import("@/app/(dashboard)/catalog/actions");
    await expect(createCategory({ code: "DAIRY", name: "Dairy", sortOrder: 0, active: true })).rejects.toThrow(/already exists/);
  });

  it("creates a category with a valid UPPER_SNAKE_CASE code", async () => {
    (prisma as any).category = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    };
    const { createCategory } = await import("@/app/(dashboard)/catalog/actions");
    await createCategory({ code: "SNACKS", name: "Snacks", sortOrder: 7, active: true });
    expect((prisma as any).category.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "SNACKS", name: "Snacks" }) })
    );
  });

  it("renaming a code cascades to every catalog item using the old code", async () => {
    (prisma as any).category = {
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", code: "SNACKS", name: "Snacks" }),
      update: vi.fn().mockReturnValue("update-op"),
    };
    (prisma as any).catalogItem = { updateMany: vi.fn().mockReturnValue("updateMany-op") };
    (prisma as any).$transaction = vi.fn().mockResolvedValue([]);

    const { updateCategory } = await import("@/app/(dashboard)/catalog/actions");
    await updateCategory("c1", { code: "TREATS", name: "Treats", sortOrder: 7, active: true });

    expect((prisma as any).catalogItem.updateMany).toHaveBeenCalledWith({
      where: { category: "SNACKS" },
      data: { category: "TREATS" },
    });
    expect((prisma as any).$transaction).toHaveBeenCalledWith(["update-op", "updateMany-op"]);
  });

  it("does not touch catalog items when the code is unchanged", async () => {
    (prisma as any).category = {
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", code: "SNACKS", name: "Snacks" }),
      update: vi.fn().mockReturnValue("update-op"),
    };
    (prisma as any).catalogItem = { updateMany: vi.fn() };
    (prisma as any).$transaction = vi.fn().mockResolvedValue([]);

    const { updateCategory } = await import("@/app/(dashboard)/catalog/actions");
    await updateCategory("c1", { code: "SNACKS", name: "Snacks (renamed label only)", sortOrder: 7, active: true });

    expect((prisma as any).catalogItem.updateMany).not.toHaveBeenCalled();
    expect((prisma as any).$transaction).toHaveBeenCalledWith(["update-op"]);
  });

  it("blocks deleting a category still used by catalog items", async () => {
    (prisma as any).category = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", code: "DAIRY", name: "Dairy" }) };
    (prisma as any).catalogItem = { count: vi.fn().mockResolvedValue(3) };
    const { deleteCategory } = await import("@/app/(dashboard)/catalog/actions");
    await expect(deleteCategory("c1")).rejects.toThrow(/3 products still use it/);
  });

  it("deletes an unused category", async () => {
    (prisma as any).category = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", code: "SNACKS", name: "Snacks" }),
      delete: vi.fn().mockResolvedValue({}),
    };
    (prisma as any).catalogItem = { count: vi.fn().mockResolvedValue(0) };
    const { deleteCategory } = await import("@/app/(dashboard)/catalog/actions");
    await deleteCategory("c1");
    expect((prisma as any).category.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});
