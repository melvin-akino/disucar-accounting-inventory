import { num } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeTrialBalance } from "@/lib/coa";
import { getUnbalancedCollections } from "@/lib/collections";

function csv(rows: (string | number | null | undefined)[][]): string {
  return rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  ).join("\n");
}

function agingBucket(days: number) {
  if (days <= 0) return "Current";
  if (days <= 30) return "1-30 d";
  if (days <= 60) return "31-60 d";
  if (days <= 90) return "61-90 d";
  return "90+ d";
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp   = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "SALES";
  const from = new Date((sp.get("from") ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)) + "T00:00:00");
  const to   = new Date((sp.get("to")   ?? new Date().toISOString().slice(0, 10))                             + "T23:59:59");
  const brand = sp.get("brand")?.trim() || "";

  let rows: (string | number | null)[][] = [];
  let filename = "report";

  if (type === "SALES") {
    filename = `sales-${sp.get("from")}-${sp.get("to")}`;
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: from, lte: to }, ...(brand && { lines: { some: { sku: { brand } } } }) },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    rows = [
      ["Order ID", "Customer", "Date", "State", "Subtotal", "VAT", "CWT", "Total"],
      ...orders.map(o => [o.id, o.customer.name, o.createdAt.toLocaleDateString("en-PH"), o.state,
        Number(o.subtotal), Number(o.vat), Number(o.cwt), Number(o.subtotal) + Number(o.vat) - Number(o.cwt)]),
    ];
  }

  if (type === "AR_AGING") {
    filename = "ar-aging";
    const invoices = await prisma.invoice.findMany({
      where: { status: { not: "PAID" } },
      include: { customer: { select: { name: true } } },
      orderBy: { due: "asc" },
    });
    const today = new Date();
    rows = [
      ["Invoice ID", "Customer", "Issue Date", "Due Date", "Amount", "Paid", "Balance", "Days Overdue", "Bucket"],
      ...invoices.map(inv => {
        const balance = Number(inv.amount) - Number(inv.paid);
        const days    = Math.floor((today.getTime() - new Date(inv.due).getTime()) / 86400_000);
        return [inv.id, inv.customer.name, new Date(inv.issued).toLocaleDateString("en-PH"),
          new Date(inv.due).toLocaleDateString("en-PH"), Number(inv.amount), Number(inv.paid), balance, days, agingBucket(days)];
      }),
    ];
  }

  if (type === "INVENTORY") {
    filename = "inventory";
    const stocks = await prisma.stock.findMany({
      where: { ...(brand && { sku: { brand } }) },
      include: { sku: { select: { sku: true, name: true, category: true, unit: true } }, warehouse: { select: { name: true } } },
      orderBy: [{ warehouse: { name: "asc" } }, { sku: { name: "asc" } }],
    });
    rows = [
      ["SKU", "Product", "Category", "Unit", "Warehouse", "On Hand", "Reserved", "Available", "Reorder At", "Status"],
      ...stocks.map(s => {
        const available = num(s.onHand) - num(s.reserved);
        return [s.sku.sku, s.sku.name, s.sku.category, s.sku.unit, s.warehouse.name,
          num(s.onHand), num(s.reserved), available, s.reorderAt ?? "", s.reorderAt && num(s.onHand) <= s.reorderAt ? "Low" : available === 0 ? "Out" : "OK"];
      }),
    ];
  }

  if (type === "PO_SUMMARY") {
    filename = `po-${sp.get("from")}-${sp.get("to")}`;
    const pos = await prisma.inboundPO.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { supplier: { select: { name: true } }, warehouse: { select: { name: true } }, lines: true },
      orderBy: { createdAt: "desc" },
    });
    rows = [
      ["PO ID", "Supplier", "Warehouse", "Status", "Expected", "Lines", "Total"],
      ...pos.map(po => [po.id, po.supplier.name, po.warehouse.name, po.status,
        new Date(po.expectedAt).toLocaleDateString("en-PH"), po.lines.length, Number(po.total)]),
    ];
  }

  if (type === "PL") {
    filename = `pl-${sp.get("from")}-${sp.get("to")}`;
    const jes = await prisma.journalEntry.findMany({ where: { date: { gte: from, lte: to } }, include: { lines: true } });
    const tb  = computeTrialBalance(jes.flatMap(je => je.lines.map(l => ({ code: l.code, dr: Number(l.dr), cr: Number(l.cr) }))));
    const { COA } = await import("@/lib/coa");
    rows = [
      ["Code", "Account", "Type", "Balance"],
      ...COA.filter(a => a.type === "REVENUE" || a.type === "EXPENSE")
            .map(a => { const bal = (a.normal === "DR" ? 1 : -1) * (tb[a.code] ?? 0); return [a.code, a.name, a.type, bal]; }),
    ];
  }

  if (type === "UNBALANCED_COLLECTIONS") {
    filename = "unbalanced-collections";
    const unbalanced = await getUnbalancedCollections();
    rows = [
      ["Employee", "Unremitted Total", "Unremitted Receipts", "Oldest Collection"],
      ...unbalanced.map(u => [u.employeeName, u.totalUnremitted, u.count, u.oldestCollectedAt.toLocaleDateString("en-PH")]),
    ];
  }

  if (type === "AGENT_AUDIT") {
    filename = "agent-audit";
    const agentId = sp.get("agentId") || "";
    if (agentId) {
      const orders = await prisma.order.findMany({
        where: { agentId, createdAt: { gte: from, lte: to } },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      rows = [
        ["Order", "Date", "Customer", "State", "Total"],
        ...orders.map(o => [o.id, o.createdAt.toLocaleString("en-PH"), o.customer.name, o.state, Number(o.total)]),
      ];
    } else {
      rows = [["Select an agent to export the audit."]];
    }
  }

  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
