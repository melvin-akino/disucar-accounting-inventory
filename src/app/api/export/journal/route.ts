import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCSV, csvResponse } from "@/lib/csv";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN"].includes(session.user.role))
    return new Response("Unauthorized", { status: 401 });

  const entries = await prisma.journalEntry.findMany({
    include: { lines: true, postedBy: { select: { name: true } } },
    orderBy: { date: "desc" },
  });

  const rows = entries.flatMap((je) =>
    je.lines.map((l) => ({
      "Entry ID": je.id,
      "Date": new Date(je.date).toLocaleDateString("en-PH"),
      "Source": je.source,
      "Reference": je.ref ?? "",
      "Memo": je.memo,
      "Account Code": l.code,
      "Debit": Number(l.dr).toFixed(2),
      "Credit": Number(l.cr).toFixed(2),
      "Posted By": je.postedBy?.name ?? "",
    }))
  );

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(buildCSV(rows), `journal-${today}.csv`);
}
