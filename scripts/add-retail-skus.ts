/**
 * One-off: create a per-piece (retail) SKU for every case-level catalog item.
 *
 * Disucar's existing 16 products are priced per case. This adds a second SKU for each, sold
 * individually (retail): unit "pc", price = case price ÷ pieces-per-case, linked to the case
 * SKU via CatalogItem.parentId (grouped in the Catalog list — "piece of …"). Case stock is
 * copied to each retail SKU in every warehouse, with a matching RECEIPT StockMove for the
 * audit trail (mirrors scripts/add-warehouse.ts). No automatic case↔piece conversion.
 *
 * Idempotent: skips any case SKU whose "<sku>-RTL" retail sibling already exists.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const caseItems = await prisma.catalogItem.findMany({
    where: { active: true, unit: { not: "pc" }, parentId: null, unitsPerCase: { not: null } },
    include: { stockRows: true },
    orderBy: { sku: "asc" },
  });

  if (caseItems.length === 0) {
    console.log("No case SKUs found to replicate.");
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const item of caseItems) {
    const retailSku = `${item.sku}-RTL`;
    const existing = await prisma.catalogItem.findUnique({ where: { sku: retailSku } });
    if (existing) {
      console.log(`skip ${retailSku} (already exists)`);
      skipped++;
      continue;
    }

    const perPiece = item.unitsPerCase && item.unitsPerCase > 0
      ? Math.round((Number(item.unitPrice) / item.unitsPerCase) * 100) / 100
      : Number(item.unitPrice);

    await prisma.$transaction(async (tx) => {
      const retail = await tx.catalogItem.create({
        data: {
          sku: retailSku,
          name: `${item.name} (Retail)`,
          category: item.category,
          unit: "pc",
          unitsPerCase: null,
          unitPrice: perPiece,
          brand: item.brand,
          imageUrl: item.imageUrl,
          supplierId: item.supplierId,
          parentId: item.id,
          active: true,
        },
      });

      // Copy case stock into the retail SKU for every warehouse it stocks.
      for (const s of item.stockRows) {
        await tx.stock.create({
          data: { skuId: retail.id, warehouseId: s.warehouseId, onHand: s.onHand, reserved: 0 },
        });
        if (s.onHand > 0) {
          await tx.stockMove.create({
            data: {
              skuId: retail.id, warehouseId: s.warehouseId, type: "RECEIPT",
              qty: s.onHand, costPerUnit: 0, ref: null,
              note: `Opening stock — retail SKU (copied from ${item.sku})`,
              by: "system",
            },
          });
        }
      }
    });

    console.log(`created ${retailSku} @ ${perPiece}/pc (${item.stockRows.length} stock rows copied)`);
    created++;
  }

  console.log(`Done. Created ${created}, skipped ${skipped}. Total catalog items now: ${await prisma.catalogItem.count()}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
