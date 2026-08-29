import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCSV, ImportError } from "@/lib/csv-parse";

const VALID_TYPES = ["SUPERMARKET", "GROCERY", "SARI_SARI_STORE", "WHOLESALER", "GOVERNMENT", "OTHER"] as const;

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
    const type = row["Type"]?.trim().toUpperCase();
    const tin = row["TIN"]?.trim() || null;
    const region = row["Region"]?.trim() || null;
    const city = row["City"]?.trim() || null;
    const terms = row["Terms"]?.trim() || "Net 30";
    const creditLimitRaw = row["Credit Limit"]?.trim();
    const contactEmail = row["Email"]?.trim() || null;
    const contactPhone = row["Phone"]?.trim() || null;

    if (!name) { errors.push({ row: rowNum, field: "Name", message: "Name is required" }); continue; }
    if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      errors.push({ row: rowNum, field: "Type", message: `Must be one of: ${VALID_TYPES.join(", ")}` });
      continue;
    }
    const creditLimit = parseFloat(creditLimitRaw ?? "0");
    if (isNaN(creditLimit) || creditLimit < 0) {
      errors.push({ row: rowNum, field: "Credit Limit", message: "Must be a number ≥ 0" });
      continue;
    }

    const data = { name, type, tin, region, city, terms, creditLimit, contactEmail, contactPhone };

    try {
      // Look up by code first, then by name
      let existing = code
        ? await prisma.customer.findUnique({ where: { code } })
        : await prisma.customer.findFirst({ where: { name } });

      if (existing) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: { ...data, ...(code ? { code } : {}) },
        });
        updated++;
      } else {
        await prisma.customer.create({
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
