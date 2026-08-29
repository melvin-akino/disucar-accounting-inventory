import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCSV, ImportError } from "@/lib/csv-parse";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["WAREHOUSE", "ADMIN"].includes(session.user.role))
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string")
    return Response.json({ error: "No file uploaded" }, { status: 400 });

  const text = await (file as File).text();
  const rows = parseCSV(text);

  if (!rows.length)
    return Response.json({ error: "CSV is empty or has no data rows" }, { status: 400 });

  // Pre-load SKU and Warehouse lookup maps for efficiency
  const [allSkus, allWarehouses] = await Promise.all([
    prisma.catalogItem.findMany({ select: { id: true, sku: true } }),
    prisma.warehouse.findMany({ select: { id: true, name: true } }),
  ]);
  const skuMap = new Map(allSkus.map(s => [s.sku.toLowerCase(), s.id]));
  const warehouseMap = new Map(allWarehouses.map(w => [w.name.toLowerCase(), w.id]));

  let adjusted = 0;
  let created = 0;
  const errors: ImportError[] = [];
  const importRef = `CSV Import ${new Date().toISOString().slice(0, 10)}`;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const skuCode = row["SKU"]?.trim();
    const warehouseName = row["Warehouse"]?.trim();
    const onHandRaw = row["On Hand"]?.trim();
    const reorderAtRaw = row["Reorder At"]?.trim();
    const maxLevelRaw = row["Max Level"]?.trim();

    // Validation
    if (!skuCode) { errors.push({ row: rowNum, field: "SKU", message: "SKU is required" }); continue; }
    if (!warehouseName) { errors.push({ row: rowNum, field: "Warehouse", message: "Warehouse is required" }); continue; }

    const skuId = skuMap.get(skuCode.toLowerCase());
    if (!skuId) { errors.push({ row: rowNum, field: "SKU", message: `SKU "${skuCode}" not found in catalog` }); continue; }

    const warehouseId = warehouseMap.get(warehouseName.toLowerCase());
    if (!warehouseId) { errors.push({ row: rowNum, field: "Warehouse", message: `Warehouse "${warehouseName}" not found` }); continue; }

    const onHand = parseInt(onHandRaw ?? "", 10);
    if (isNaN(onHand) || onHand < 0) { errors.push({ row: rowNum, field: "On Hand", message: "Must be a non-negative integer" }); continue; }

    const reorderAt = reorderAtRaw ? parseInt(reorderAtRaw, 10) : null;
    const maxLevel = maxLevelRaw ? parseInt(maxLevelRaw, 10) : null;

    try {
      const existing = await prisma.stock.findUnique({
        where: { skuId_warehouseId: { skuId, warehouseId } },
      });

      if (existing) {
        const delta = onHand - existing.onHand;
        await prisma.$transaction([
          prisma.stock.update({
            where: { skuId_warehouseId: { skuId, warehouseId } },
            data: {
              onHand,
              ...(reorderAt !== null ? { reorderAt } : {}),
              ...(maxLevel !== null ? { maxLevel } : {}),
            },
          }),
          // Only create a move if the quantity actually changed
          ...(delta !== 0 ? [prisma.stockMove.create({
            data: {
              skuId, warehouseId,
              type: "ADJUSTMENT",
              qty: delta,
              ref: importRef,
              note: `CSV import: set onHand from ${existing.onHand} to ${onHand}`,
              by: session.user.name ?? session.user.email ?? "import",
            },
          })] : []),
        ]);
        adjusted++;
      } else {
        await prisma.$transaction([
          prisma.stock.create({
            data: {
              skuId, warehouseId, onHand, reserved: 0,
              ...(reorderAt !== null ? { reorderAt } : {}),
              ...(maxLevel !== null ? { maxLevel } : {}),
            },
          }),
          prisma.stockMove.create({
            data: {
              skuId, warehouseId,
              type: "RECEIPT",
              qty: onHand,
              ref: importRef,
              note: "CSV import: initial stock",
              by: session.user.name ?? session.user.email ?? "import",
            },
          }),
        ]);
        created++;
      }
    } catch (e: unknown) {
      errors.push({ row: rowNum, field: "SKU Code", message: e instanceof Error ? e.message : "Database error" });
    }
  }

  return Response.json({ adjusted, created, errors });
}
