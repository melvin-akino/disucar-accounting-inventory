import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "./SettingsClient";
import { getOrgSettings } from "@/lib/org-settings";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isAdmin = session.user.role === "ADMIN";
  // Warehouse heads may reach Settings solely to manage reliever assignments (item 11).
  const me = isAdmin ? null : await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true, isWarehouseHead: true } });
  const isWarehouseHead = me?.role === "WAREHOUSE" && !!me.isWarehouseHead;
  if (!isAdmin && !isWarehouseHead) redirect("/orders");
  const canManageRelievers = isAdmin || isWarehouseHead;

  const [users, customers, branding, orgSettings, relieverRows] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      include: {
        customer: { select: { name: true } },
      },
    }),
    prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getOrgSettings(),
    prisma.orgSettings.findUnique({ where: { id: "singleton" } }),
    prisma.relieverAssignment.findMany({
      orderBy: { startDate: "desc" },
      include: { originalUser: { select: { name: true } }, relieverUser: { select: { name: true } } },
    }),
  ]);

  const serialized = users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    customerId: u.customerId,
    qrToken: u.qrToken,
    isOwner: u.isOwner,
    isWarehouseHead: u.isWarehouseHead,
    createdAt: u.createdAt.toISOString(),
    customer: u.customer,
  }));

  const now = new Date();
  const relievers = relieverRows.map(r => ({
    id: r.id,
    originalUserName: r.originalUser.name,
    relieverUserName: r.relieverUser.name,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    notes: r.notes,
    active: r.startDate <= now && r.endDate >= now,
  }));

  return (
    <SettingsClient
      users={serialized}
      customers={customers.map(c => ({ id: c.id, name: c.name }))}
      currentUserId={session.user.id}
      branding={branding}
      expirySettings={{
        warnDays: orgSettings?.expiryWarnDays ?? 90,
        criticalDays: orgSettings?.expiryCriticalDays ?? 30,
      }}
      appOrigin={process.env.NEXT_PUBLIC_APP_ORIGIN ?? "localhost:3000"}
      accessSettings={{ allowedOfficeIps: orgSettings?.allowedOfficeIps ?? "" }}
      relievers={relievers}
      canManageRelievers={canManageRelievers}
      isAdmin={isAdmin}
    />
  );
}
