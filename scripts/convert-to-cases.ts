/**
 * One-off: convert the catalog from per-piece trading units to per-case.
 *
 *   unit         → "case"
 *   unitsPerCase → retail pieces contained in one case
 *   unitPrice    → existing per-piece price x unitsPerCase
 *
 * PROVISIONAL: the case sizes below are standard Philippine FMCG configurations,
 * not Disucar's actual supplier packing — they were not present anywhere in the data.
 * Prices are a straight multiplication and assume no wholesale/case discount off
 * the per-piece price. Both should be replaced with real figures via
 * Catalog -> Export / Import once supplier confirmations are available.
 *
 * Existing order lines are untouched: OrderLine stores a name/unit/price snapshot
 * taken at order time, so historical documents keep the pricing they were raised on.
 *
 * Idempotent: rows already on "case" are skipped, so prices cannot be multiplied twice.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const UNITS_PER_CASE: Record<string, number> = {
  // Noodles
  "LM-PC-ORIG-60":    72,  // instant pancit canton, 60g
  "LM-PC-CHILI-60":   72,
  "LM-BEEF-55":       72,
  "LM-GOCUP-70":      24,  // cup noodles
  // Biscuits
  "MND-CREAMO-316":   12,
  "MND-BUTTER-240":   12,
  "MYS-SKYFLK-250":   12,
  "MYS-FITA-300":     12,
  // Condiments
  "MS-OYSTER-405":    12,
  "MS-SASWEET-50":    60,  // sauce mix sachets
  // Dairy
  "DM-YOG-ORIG-180":  24,
  "DM-YOG-STRAW-180": 24,
  // Canned goods
  "CT-FLAKE-OIL-155": 48,  // 155g tuna
  "CT-HOTSPICY-155":  48,
  // Household
  "CHM-POWDER-68":   144,  // detergent sachets
  "CHM-BAR-380":      24,
};

async function main() {
  const items = await prisma.catalogItem.findMany({ orderBy: { sku: "asc" } });

  const missing = items.filter((i) => !(i.sku in UNITS_PER_CASE)).map((i) => i.sku);
  if (missing.length > 0) {
    console.error(`No case size defined for: ${missing.join(", ")}. Aborting — refusing a partial conversion.`);
    process.exit(1);
  }

  const rows: string[] = [];
  let converted = 0;
  let skipped = 0;

  for (const item of items) {
    if (item.unit === "case") {
      skipped++;
      rows.push(`SKIP  ${item.sku.padEnd(17)} already on cases`);
      continue;
    }

    const per = UNITS_PER_CASE[item.sku];
    const oldPrice = Number(item.unitPrice);
    const newPrice = Math.round(oldPrice * per * 100) / 100;

    await prisma.catalogItem.update({
      where: { id: item.id },
      data: { unit: "case", unitsPerCase: per, unitPrice: newPrice },
    });

    converted++;
    rows.push(
      `OK    ${item.sku.padEnd(17)} ${String(per).padStart(3)} ${item.unit.padEnd(6)}/case  ` +
        `${oldPrice.toFixed(2).padStart(8)} -> ${newPrice.toFixed(2).padStart(10)}`
    );
  }

  console.log(rows.join("\n"));
  console.log(`\nConverted ${converted}, skipped ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
