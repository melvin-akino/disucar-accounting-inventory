"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { hash } from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

// ── Agent QR code (public order-form link) ─────────────────────────────────────
export async function generateAgentQrToken(userId: string): Promise<{ qrToken: string }> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");
  // Admins can (re)generate for any agent; an agent can only do it for themselves.
  if (session.user.role !== "ADMIN" && session.user.id !== userId) throw new Error("Forbidden");

  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role !== "AGENT") throw new Error("QR codes are only for AGENT-role users.");

  const { randomUUID } = await import("crypto");
  const qrToken = randomUUID();
  await prisma.user.update({ where: { id: userId }, data: { qrToken } });

  writeAudit({ action: "user.qr_token_regenerated", entityType: "user", entityId: userId, actorId: session.user.id, actorName: session.user.name ?? undefined }).catch(() => {});
  revalidatePath("/settings");
  return { qrToken };
}

// ── Create user ───────────────────────────────────────────────────────────────
const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["CUSTOMER", "AGENT", "FINANCE", "WAREHOUSE", "DRIVER", "ADMIN"]),
  customerId: z.string().optional(),
  isOwner: z.boolean().default(false),
  isWarehouseHead: z.boolean().default(false),
});

export async function createUser(input: z.infer<typeof CreateUserSchema>) {
  await requireAdmin();
  const data = CreateUserSchema.parse(input);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error("A user with this email already exists");

  const passwordHash = await hash(data.password, 12);

  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role as Role,
      customerId:  data.role === "CUSTOMER"   ? (data.customerId  ?? null) : null,
      isOwner: data.role === "ADMIN" ? data.isOwner : false,
      isWarehouseHead: data.role === "WAREHOUSE" ? data.isWarehouseHead : false,
    },
  });

  const session2 = await getServerSession(authOptions);
  writeAudit({ action: "user.create", entityType: "user", entityId: data.email, actorId: session2?.user.id, actorName: session2?.user.name ?? undefined, meta: { role: data.role } }).catch(() => {});

  revalidatePath("/settings");
}

// ── Update user ───────────────────────────────────────────────────────────────
const UpdateUserSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role: z.enum(["CUSTOMER", "AGENT", "FINANCE", "WAREHOUSE", "DRIVER", "ADMIN"]),
  customerId: z.string().optional().nullable(),
  active: z.boolean(),
  isOwner: z.boolean().default(false),
  isWarehouseHead: z.boolean().default(false),
});

export async function updateUser(input: z.infer<typeof UpdateUserSchema>) {
  const session = await requireAdmin();
  const data = UpdateUserSchema.parse(input);

  if (data.id === session.user.id && !data.active) {
    throw new Error("You cannot deactivate your own account");
  }

  await prisma.user.update({
    where: { id: data.id },
    data: {
      name: data.name,
      role: data.role as Role,
      customerId:  data.role === "CUSTOMER"   ? (data.customerId  ?? null) : null,
      active: data.active,
      isOwner: data.role === "ADMIN" ? data.isOwner : false,
      isWarehouseHead: data.role === "WAREHOUSE" ? data.isWarehouseHead : false,
    },
  });

  writeAudit({ action: "user.update", entityType: "user", entityId: data.id, actorId: session.user.id, actorName: session.user.name ?? undefined, meta: { role: data.role, active: data.active } }).catch(() => {});

  revalidatePath("/settings");
}

// ── Branding ──────────────────────────────────────────────────────────────────
const BrandSchema = z.object({
  name:    z.string().min(1),
  tagline: z.string().min(1),
  address: z.string().min(1),
  phone:   z.string().min(1),
  email:   z.string().email(),
  tin:     z.string().min(1),
  website: z.string().min(1),
  color:   z.string().regex(/^#[0-9a-fA-F]{6}$/),
  rdo:     z.string(),
  zip:     z.string(),
  logoUrl: z.string(),
});

export async function saveBranding(input: z.infer<typeof BrandSchema>) {
  await requireAdmin();
  const data = BrandSchema.parse(input);
  const sess3 = await getServerSession(authOptions);
  await prisma.orgSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });
  writeAudit({ action: "branding.save", entityType: "branding", actorId: sess3?.user.id, actorName: sess3?.user.name ?? undefined, meta: { name: data.name, color: data.color } }).catch(() => {});
  revalidatePath("/", "layout");
}

export async function getBranding() {
  await requireAdmin();
  return prisma.orgSettings.findUnique({ where: { id: "singleton" } });
}

// ── Logo upload ───────────────────────────────────────────────────────────────
export async function uploadLogo(formData: FormData): Promise<{ logoUrl: string }> {
  await requireAdmin();

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");
  if (file.size > 2 * 1024 * 1024) throw new Error("Logo must be under 2 MB");

  const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!allowed.includes(file.type)) throw new Error("Only PNG, JPG, WebP or SVG allowed");

  const { writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const { randomUUID } = await import("crypto");

  const ext = file.name.split(".").pop() ?? "png";
  const filename = `logo-${randomUUID()}.${ext}`;
  // Write to the persistent Docker volume mounted at /app/uploads
  // Served back to the browser via /api/uploads/[...path]
  const dir = join(process.cwd(), "uploads", "branding");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()));

  const logoUrl = `/api/uploads/branding/${filename}`;

  // Persist to DB — upsert so it works even if no other branding was saved yet
  await prisma.orgSettings.upsert({
    where: { id: "singleton" },
    update: { logoUrl },
    create: {
      id: "singleton",
      logoUrl,
      name: "", tagline: "", address: "", phone: "", email: "", tin: "", website: "", color: "#003087", rdo: "", zip: "",
    },
  });

  revalidatePath("/", "layout");
  return { logoUrl };
}

// ── Expiry thresholds ─────────────────────────────────────────────────────────
export async function saveExpiryThresholds(warnDays: number, criticalDays: number) {
  await requireAdmin();
  if (criticalDays >= warnDays) throw new Error("Critical threshold must be less than warning threshold");
  if (criticalDays < 1) throw new Error("Critical threshold must be at least 1 day");

  await prisma.orgSettings.upsert({
    where: { id: "singleton" },
    update: { expiryWarnDays: warnDays, expiryCriticalDays: criticalDays },
    create: {
      id: "singleton", expiryWarnDays: warnDays, expiryCriticalDays: criticalDays,
      name: "", tagline: "", address: "", phone: "", email: "", tin: "", website: "", color: "#003087", rdo: "", zip: "",
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

// ── Home-base login restriction ─────────────────────────────────────────────
export async function saveAccessSettings(allowedOfficeIps: string) {
  const session = await requireAdmin();

  await prisma.orgSettings.upsert({
    where: { id: "singleton" },
    update: { allowedOfficeIps },
    create: {
      id: "singleton", allowedOfficeIps,
      name: "", tagline: "", address: "", phone: "", email: "", tin: "", website: "", color: "#003087", rdo: "", zip: "",
    },
  });

  writeAudit({ action: "org.access_settings_save", entityType: "org_settings", actorId: session.user.id, actorName: session.user.name ?? undefined, meta: { allowedOfficeIps } }).catch(() => {});
  revalidatePath("/settings");
}

// ── Reset password ────────────────────────────────────────────────────────────
export async function resetPassword(userId: string, newPassword: string) {
  await requireAdmin();

  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters");

  const passwordHash = await hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  revalidatePath("/settings");
}

// ── Reliever assignments (item 11) ────────────────────────────────────────────

// Admin, or a Warehouse user flagged as a warehouse head, may manage reliever grants.
async function requireRelieverManager() {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Forbidden");
  if (session.user.role === "ADMIN") return session;
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isWarehouseHead: true, role: true } });
  if (me?.role === "WAREHOUSE" && me.isWarehouseHead) return session;
  throw new Error("Forbidden — Admin or warehouse head only");
}

const RelieverSchema = z.object({
  originalUserId: z.string().min(1),
  relieverUserId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  notes: z.string().optional(),
});

export async function createRelieverAssignment(input: z.infer<typeof RelieverSchema>) {
  const session = await requireRelieverManager();
  const d = RelieverSchema.parse(input);
  if (d.originalUserId === d.relieverUserId) throw new Error("The reliever and the covered user must be different people.");
  if (new Date(d.endDate) < new Date(d.startDate)) throw new Error("End date must be on or after the start date.");

  await prisma.relieverAssignment.create({
    data: {
      originalUserId: d.originalUserId,
      relieverUserId: d.relieverUserId,
      coveredRole: "WAREHOUSE", // scoped to warehouse coverage in the current rollout
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate + "T23:59:59"),
      notes: d.notes || null,
      createdById: session.user.id,
    },
  });
  revalidatePath("/settings");
}

export async function deleteRelieverAssignment(id: string) {
  await requireRelieverManager();
  await prisma.relieverAssignment.delete({ where: { id } });
  revalidatePath("/settings");
}
