import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUnbalancedCollections } from "@/lib/collections";
import { sendUnbalancedCollectionEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Triggered by a scheduled job outside the app (e.g. a crontab entry on the
// host — see DEPLOYMENT.md). Not user/session-gated; protected by a shared
// secret instead since it's meant to be called by a script, not a browser.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unbalanced = await getUnbalancedCollections();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let issued = 0;
  let skipped = 0;

  for (const emp of unbalanced) {
    const alreadyIssuedToday = await prisma.auditLog.findFirst({
      where: { action: "collection.report_issued", entityId: emp.employeeId, at: { gte: todayStart } },
    });
    if (alreadyIssuedToday) { skipped++; continue; }

    await sendUnbalancedCollectionEmail({
      employeeName: emp.employeeName,
      totalUnremitted: emp.totalUnremitted,
      count: emp.count,
      oldestCollectedAt: emp.oldestCollectedAt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
      to: [emp.employeeEmail],
    });

    await writeAudit({
      action: "collection.report_issued",
      entityType: "user",
      entityId: emp.employeeId,
      actorName: "system (cron)",
      meta: { totalUnremitted: emp.totalUnremitted, count: emp.count, oldestCollectedAt: emp.oldestCollectedAt.toISOString() },
    });

    issued++;
  }

  if (unbalanced.length > 0) {
    const financeEmails = await prisma.user.findMany({
      where: { role: { in: ["FINANCE", "ADMIN"] }, active: true },
      select: { email: true },
    });
    if (financeEmails.length > 0) {
      const summary = unbalanced
        .map((e) => `${e.employeeName}: ₱${e.totalUnremitted.toLocaleString("en-PH", { minimumFractionDigits: 2 })} (${e.count} receipt${e.count === 1 ? "" : "s"})`)
        .join(", ");
      await sendUnbalancedCollectionEmail({
        employeeName: `${unbalanced.length} employee${unbalanced.length === 1 ? "" : "s"}`,
        totalUnremitted: unbalanced.reduce((s, e) => s + e.totalUnremitted, 0),
        count: unbalanced.reduce((s, e) => s + e.count, 0),
        oldestCollectedAt: summary,
        to: financeEmails.map((u) => u.email),
      });
    }
  }

  return NextResponse.json({ flagged: unbalanced.length, issued, skipped });
}
