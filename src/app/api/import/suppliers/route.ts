import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCSV, ImportError } from "@/lib/csv-parse";

const VALID_STATUSES = ["ACTIVE", "ON_HOLD", "INACTIVE"] as const;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN"].includes(session.user.role))
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string")
    return Response.json({ error: "No file uploaded" }, { status: 400 });

  const text = await (file as File).text();
  const rows = parseCSV(text);

  if (!rows.length)
    return Response.json({ error: "CSV is empty or has no data rows" }, { status: 400 });

  let created = 0;
  let updated = 0;
  const errors: ImportError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const code = row["Code"]?.trim() || null;
    const name = row["Name"]?.trim();
    const statusRaw = row["Status"]?.trim().toUpperCase() || "ACTIVE";
    const city = row["City"]?.trim() || null;
    const terms = row["Terms"]?.trim() || "Net 30";
    const leadTimeDaysRaw = row["Lead Time (days)"]?.trim();
    const ratingRaw = row["Rating"]?.trim();
    const contactEmail = row["Email"]?.trim() || null;
    const contactPhone = row["Phone"]?.trim() || null;

    if (!name) { errors.push({ row: rowNum, field: "Name", message: "Name is required" }); continue; }
    if (!VALID_STATUSES.includes(statusRaw as typeof VALID_STATUSES[number])) {
      errors.push({ row: rowNum, field: "Status", message: `Must be one of: ${VALID_STATUSES.join(", ")}` });
      continue;
    }
    const leadTimeDays = parseInt(leadTimeDaysRaw ?? "7", 10);
    if (isNaN(leadTimeDays) || leadTimeDays < 0) {
      errors.push({ row: rowNum, field: "Lead Time (days)", message: "Must be a non-negative integer" });
      continue;
    }
    const rating = parseFloat(ratingRaw ?? "4.5");
    if (isNaN(rating) || rating < 0 || rating > 5) {
      errors.push({ row: rowNum, field: "Rating", message: "Must be a number between 0 and 5" });
      continue;
    }

    const status = statusRaw as "ACTIVE" | "ON_HOLD" | "INACTIVE";
    const data = { name, status, city, terms, leadTimeDays, rating, contactEmail, contactPhone };

    try {
      let existing = code
        ? await prisma.supplier.findUnique({ where: { code } })
        : await prisma.supplier.findFirst({ where: { name } });

      if (existing) {
        await prisma.supplier.update({
          where: { id: existing.id },
          data: { ...data, ...(code ? { code } : {}) },
        });
        updated++;
      } else {
        await prisma.supplier.create({
          data: { ...data, ...(code ? { code } : {}) },
        });
        created++;
      }
    } catch (e: unknown) {
      errors.push({ row: rowNum, field: "Name", message: e instanceof Error ? e.message : "Database error" });
    }
  }

  return Response.json({ created, updated, errors });
}
