/**
 * One-off: create the Urdaneta warehouse and open it with 2,000 units of every
 * active catalog item.
 *
 * Mirrors the app's own receiveStock() path: increments Stock.onHand and writes a
 * matching RECEIPT StockMove for the audit trail. Lots are deliberately not created —
 * receiveStock() does not create them either (lots come from the inbound-PO receiving
 * flow), so this stays consistent with how opening stock is recorded in-app.
 *
 * Idempotent: refuses to run twice against the same warehouse.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CODE = "URD";
const NAME = "Urdaneta";
const CITY = "Urdaneta City";
const QTY = 2000;

async function main() {
  const existing = await prisma.warehouse.findUnique({ where: { code: CODE } });
  if (existing) {
    console.error(
      `Warehouse ${CODE} already exists (id=${existing.id}). Aborting so stock is not double-counted.`
    );
    process.exit(1);
  }

  const items = await prisma.catalogItem.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (items.length === 0) {
    console.error("No active catalog items found — nothing to stock. Aborting.");
    process.exit(1);
  }

  console.log(`Creating warehouse ${CODE} (${NAME}) with ${QTY} units of ${items.length} items…`);

  const warehouse = await prisma.$transaction(async (tx) => {
    const wh = await tx.warehouse.create({
      data: { code: CODE, name: NAME, city: CITY },
    });

    await tx.stock.createMany({
      data: items.map((i) => ({
        skuId: i.id,
        warehouseId: wh.id,
        onHand: QTY,
        reserved: 0,
      })),
    });

    await tx.stockMove.createMany({
      data: items.map((i) => ({
        skuId: i.id,
        warehouseId: wh.id,
        type: "RECEIPT" as const,
        qty: QTY,
        costPerUnit: 0,
        ref: null,
        note: `Opening stock — ${NAME} warehouse`,
        by: "system",
      })),
    });

    return wh;
  });

  const [rows, total] = await Promise.all([
    prisma.stock.count({ where: { warehouseId: warehouse.id } }),
    prisma.stock.aggregate({
      where: { warehouseId: warehouse.id },
      _sum: { onHand: true },
    }),
  ]);

  console.log(
    `Done. Warehouse ${CODE} id=${warehouse.id} — ${rows} stock rows, ${total._sum.onHand} total units.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
