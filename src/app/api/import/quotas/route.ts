import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rows: Record<string, string>[];
  try {
    rows = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  const errors: { row: number; field: string; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed, row 1 = header

    // ── Resolve customer ────────────────────────────────────────────────────
    const code  = row["Customer Code"]?.trim();
    const cname = row["Customer Name"]?.trim();

    let customer: { id: string } | null = null;
    if (code) {
      customer = await prisma.customer.findFirst({ where: { code }, select: { id: true } });
    }
    if (!customer && cname) {
      customer = await prisma.customer.findFirst({ where: { name: cname }, select: { id: true } });
    }
    if (!customer) {
      errors.push({ row: rowNum, field: "Customer Code / Customer Name", message: "Customer not found" });
      continue;
    }

    // ── Validate required fields ────────────────────────────────────────────
    const label        = row["Label"]?.trim();
    const periodStart  = row["Period Start"]?.trim();
    const periodEnd    = row["Period End"]?.trim();
    const targetRaw    = row["Target Amount"]?.trim();

    if (!label) { errors.push({ row: rowNum, field: "Label", message: "Required" }); continue; }
    if (!periodStart) { errors.push({ row: rowNum, field: "Period Start", message: "Required" }); continue; }
    if (!periodEnd)   { errors.push({ row: rowNum, field: "Period End",   message: "Required" }); continue; }
    if (!targetRaw)   { errors.push({ row: rowNum, field: "Target Amount", message: "Required" }); continue; }

    const targetAmount = parseFloat(targetRaw.replace(/,/g, ""));
    if (isNaN(targetAmount) || targetAmount <= 0) {
      errors.push({ row: rowNum, field: "Target Amount", message: "Must be a positive number" });
      continue;
    }

    const startDate = new Date(periodStart + "T00:00:00");
    const endDate   = new Date(periodEnd   + "T23:59:59");
    if (isNaN(startDate.getTime())) { errors.push({ row: rowNum, field: "Period Start", message: "Invalid date (use YYYY-MM-DD)" }); continue; }
    if (isNaN(endDate.getTime()))   { errors.push({ row: rowNum, field: "Period End",   message: "Invalid date (use YYYY-MM-DD)" }); continue; }
    if (startDate >= endDate)       { errors.push({ row: rowNum, field: "Period End",   message: "Must be after Period Start" }); continue; }

    const notes      = row["Notes"]?.trim() || null;
    const activeStr  = row["Active"]?.trim().toUpperCase();
    const active     = activeStr === "" || activeStr === undefined || activeStr === "TRUE" || activeStr === "1" || activeStr === "YES";

    // ── Upsert: match by customerId + label + periodStart ──────────────────
    const existing = await prisma.customerQuota.findFirst({
      where: { customerId: customer.id, label, periodStart: startDate },
      select: { id: true },
    });

    if (existing) {
      await prisma.customerQuota.update({
        where: { id: existing.id },
        data: { periodEnd: endDate, targetAmount, notes, active },
      });
      updated++;
    } else {
      await prisma.customerQuota.create({
        data: {
          customerId: customer.id,
          label,
          periodStart: startDate,
          periodEnd: endDate,
          targetAmount,
          notes,
          active,
        },
      });
      created++;
    }
  }

  return NextResponse.json({ created, updated, errors });
}
