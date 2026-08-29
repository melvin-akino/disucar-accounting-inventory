import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCSV, ImportError } from "@/lib/csv-parse";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN"].includes(session.user.role))
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const validCategories = new Set((await prisma.category.findMany({ select: { code: true } })).map((c) => c.code));

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
    const rowNum = i + 2; // 1-indexed + header

    const sku = row["SKU"]?.trim();
    const name = row["Name"]?.trim();
    const category = row["Category"]?.trim().toUpperCase();
    const unit = row["Unit"]?.trim();
    const unitsPerCaseRaw = row["Units Per Case"]?.trim();
    const unitPriceRaw = row["Unit Price"]?.trim();
    const brand = row["Brand"]?.trim() || null;
    const activeRaw = row["Active"]?.trim().toLowerCase();

    // Validation
    if (!sku) { errors.push({ row: rowNum, field: "SKU", message: "SKU is required" }); continue; }
    if (!name) { errors.push({ row: rowNum, field: "Name", message: "Name is required" }); continue; }
    if (!category || !validCategories.has(category)) {
      errors.push({ row: rowNum, field: "Category", message: `Must be one of: ${Array.from(validCategories).join(", ")}` });
      continue;
    }
    if (!unit) { errors.push({ row: rowNum, field: "Unit", message: "Unit is required" }); continue; }
    const unitPrice = parseFloat(unitPriceRaw ?? "");
    if (isNaN(unitPrice) || unitPrice < 0) {
      errors.push({ row: rowNum, field: "Unit Price", message: "Must be a number ≥ 0" });
      continue;
    }
    // Optional — blank leaves it unset rather than failing the row.
    let unitsPerCase: number | null = null;
    if (unitsPerCaseRaw) {
      const parsed = Number(unitsPerCaseRaw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        errors.push({ row: rowNum, field: "Units Per Case", message: "Must be a whole number > 0, or blank" });
        continue;
      }
      unitsPerCase = parsed;
    }
    const active = activeRaw !== "false";

    try {
      const existing = await prisma.catalogItem.findUnique({ where: { sku } });
      if (existing) {
        await prisma.catalogItem.update({
          where: { sku },
          data: { name, category, unit, unitsPerCase, unitPrice, brand, active },
        });
        updated++;
      } else {
        await prisma.catalogItem.create({
          data: { id: randomUUID(), sku, name, category, unit, unitsPerCase, unitPrice, brand, active },
        });
        created++;
      }
    } catch (e: unknown) {
      errors.push({ row: rowNum, field: "SKU", message: e instanceof Error ? e.message : "Database error" });
    }
  }

  return Response.json({ created, updated, errors });
}
