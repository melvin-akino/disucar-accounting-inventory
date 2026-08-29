import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeTrialBalance, COA } from "@/lib/coa";
import { AccountingClient } from "./AccountingClient";

export default async function LedgerPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role)) redirect("/orders");

  const [journalEntries, invoices, bills, birFilings] = await Promise.all([
    prisma.journalEntry.findMany({
      include: { lines: true, postedBy: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.invoice.findMany({
      include: { customer: { select: { name: true } } },
      orderBy: { issued: "desc" },
    }),
    prisma.bill.findMany({
      include: { supplier: { select: { name: true } } },
      orderBy: { issued: "desc" },
    }),
    prisma.birFiling.findMany({ orderBy: { due: "asc" } }),
  ]);

  // Compute trial balance from all journal lines
  const allLines = journalEntries.flatMap((je) =>
    je.lines.map((l) => ({
      code: l.code,
      dr: Number(l.dr),
      cr: Number(l.cr),
    }))
  );
  const trialBalance = computeTrialBalance(allLines);

  return (
    <AccountingClient
      journalEntries={journalEntries.map((je) => ({
        id: je.id,
        date: je.date.toISOString(),
        source: je.source,
        ref: je.ref,
        memo: je.memo,
        by: je.postedBy?.name ?? "System",
        lines: je.lines.map((l) => ({
          code: l.code,
          dr: Number(l.dr),
          cr: Number(l.cr),
        })),
      }))}
      invoices={invoices.map((i) => ({
        id: i.id,
        customerName: i.customer.name,
        soId: i.soId,
        issued: i.issued.toISOString(),
        due: i.due.toISOString(),
        amount: Number(i.amount),
        paid: Number(i.paid),
        status: i.status,
      }))}
      bills={bills.map((b) => ({
        id: b.id,
        vendorName: b.supplier?.name ?? b.vendor ?? "—",
        ref: b.ref,
        note: b.note,
        issued: b.issued.toISOString(),
        due: b.due.toISOString(),
        amount: Number(b.amount),
        paid: Number(b.paid),
        status: b.status,
      }))}
      birFilings={birFilings.map((f) => ({
        id: f.id,
        form: f.form,
        period: f.period,
        desc: f.desc,
        due: f.due.toISOString(),
        amount: Number(f.amount),
        status: f.status,
      }))}
      trialBalance={trialBalance}
      coaLength={COA.length}
      userRole={session.user.role}
    />
  );
}
