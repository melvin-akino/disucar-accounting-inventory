import {
  PrismaClient,
  Role,
  SupplierStatus,
  JeSource,
  InvoiceStatus,
  BillStatus,
  BirStatus,
} from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

function daysFromNow(d: number) {
  return new Date(Date.now() + d * 86_400_000);
}
function daysAgo(d: number) {
  return daysFromNow(-d);
}
function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3_600_000);
}

async function main() {
  console.log("Seeding…");

  // ── Warehouses ────────────────────────────────────────────────────────────
  const mnl = await prisma.warehouse.upsert({
    where: { code: "MNL" },
    update: {},
    create: { code: "MNL", name: "Manila — Pasig DC", city: "Pasig" },
  });
  const ceb = await prisma.warehouse.upsert({
    where: { code: "CEB" },
    update: {},
    create: { code: "CEB", name: "Cebu DC", city: "Cebu City" },
  });
  const dvo = await prisma.warehouse.upsert({
    where: { code: "DVO" },
    update: {},
    create: { code: "DVO", name: "Davao DC", city: "Davao City" },
  });

  // ── Customers (grocery/FMCG retail — Disucar is based in Urdaneta, Pangasinan) ──
  const customers = await Promise.all([
    prisma.customer.upsert({ where: { code: "C-2001" }, update: {}, create: { code: "C-2001", name: "Puregold Price Club — Urdaneta",   type: "SUPERMARKET",     tin: "000-111-222-000", region: "I",  city: "Urdaneta",   terms: "Net 30", creditLimit: 500_000, contactEmail: "procurement@puregold-urdaneta.ph" } }),
    prisma.customer.upsert({ where: { code: "C-2002" }, update: {}, create: { code: "C-2002", name: "SM Savemore Market — Dagupan",     type: "SUPERMARKET",     tin: "000-222-333-000", region: "I",  city: "Dagupan",    terms: "Net 30", creditLimit: 450_000, contactEmail: "orders@savemoredagupan.ph" } }),
    prisma.customer.upsert({ where: { code: "C-2003" }, update: {}, create: { code: "C-2003", name: "Alfamart — Urdaneta",              type: "GROCERY",         tin: "000-333-444-000", region: "I",  city: "Urdaneta",   terms: "Net 15", creditLimit: 150_000, contactEmail: "store@alfamarturdaneta.ph" } }),
    prisma.customer.upsert({ where: { code: "C-2004" }, update: {}, create: { code: "C-2004", name: "Fely's Mini Mart",                 type: "GROCERY",         tin: "000-444-555-000", region: "I",  city: "San Carlos", terms: "Net 15", creditLimit: 60_000,  contactEmail: "fely@felysminimart.ph" } }),
    prisma.customer.upsert({ where: { code: "C-2005" }, update: {}, create: { code: "C-2005", name: "Villaflor General Merchandise",    type: "WHOLESALER",      tin: "000-555-666-000", region: "I",  city: "Rosales",    terms: "Net 30", creditLimit: 300_000, contactEmail: "orders@villaflorgm.ph" } }),
    prisma.customer.upsert({ where: { code: "C-2006" }, update: {}, create: { code: "C-2006", name: "Dela Cruz Sari-Sari Store",        type: "SARI_SARI_STORE", tin: "000-666-777-000", region: "I",  city: "Urdaneta",   terms: "COD",    creditLimit: 25_000,  contactEmail: "delacruzstore@gmail.com" } }),
    prisma.customer.upsert({ where: { code: "C-2007" }, update: {}, create: { code: "C-2007", name: "Aling Nena's Store — Baguio Public Market", type: "SARI_SARI_STORE", tin: "000-777-888-000", region: "CAR", city: "Baguio",   terms: "COD",    creditLimit: 40_000,  contactEmail: "alingnena@gmail.com" } }),
    prisma.customer.upsert({ where: { code: "C-2008" }, update: {}, create: { code: "C-2008", name: "CSI Supermarket — Dagupan",        type: "SUPERMARKET",     tin: "000-888-999-000", region: "I",  city: "Dagupan",    terms: "Net 30", creditLimit: 380_000, contactEmail: "purchasing@csisupermarket.ph" } }),
  ]);

  // ── Suppliers (the principals Disucar Sales distributes for) ────────────────────
  const suppliers = await Promise.all([
    prisma.supplier.upsert({ where: { code: "SUP-101" }, update: {}, create: { code: "SUP-101", name: "Monde Nissin Corporation",     contactEmail: "orders@mondenissin.com",  city: "Bulacan", leadTimeDays: 7,  status: "ACTIVE" as SupplierStatus } }),
    prisma.supplier.upsert({ where: { code: "SUP-102" }, update: {}, create: { code: "SUP-102", name: "Century Pacific Food, Inc.",   contactEmail: "trade@centurypacific.com.ph", city: "Taguig", leadTimeDays: 10, status: "ACTIVE" as SupplierStatus } }),
    prisma.supplier.upsert({ where: { code: "SUP-103" }, update: {}, create: { code: "SUP-103", name: "Champion Household Products",  contactEmail: "sales@championhousehold.ph",  city: "Manila", leadTimeDays: 10, status: "ACTIVE" as SupplierStatus } }),
  ]);

  // ── Product categories (managed by catalog admins — see catalog/actions.ts) ─
  await Promise.all([
    prisma.category.upsert({ where: { code: "NOODLES" },      update: {}, create: { code: "NOODLES",      name: "Noodles",      sortOrder: 1 } }),
    prisma.category.upsert({ where: { code: "BISCUITS" },     update: {}, create: { code: "BISCUITS",     name: "Biscuits",     sortOrder: 2 } }),
    prisma.category.upsert({ where: { code: "CONDIMENTS" },   update: {}, create: { code: "CONDIMENTS",   name: "Condiments",   sortOrder: 3 } }),
    prisma.category.upsert({ where: { code: "DAIRY" },        update: {}, create: { code: "DAIRY",        name: "Dairy",        sortOrder: 4 } }),
    prisma.category.upsert({ where: { code: "CANNED_GOODS" }, update: {}, create: { code: "CANNED_GOODS", name: "Canned Goods", sortOrder: 5 } }),
    prisma.category.upsert({ where: { code: "HOUSEHOLD" },    update: {}, create: { code: "HOUSEHOLD",    name: "Household",    sortOrder: 6 } }),
    prisma.category.upsert({ where: { code: "OTHER" },        update: {}, create: { code: "OTHER",        name: "Other",        sortOrder: 99 } }),
  ]);

  // ── Catalog (Monde Nissin division: Lucky Me!, Monde Nissin, Monde M.Y. San,
  //    Mama Sita's, Dutch Mill — plus Century Tuna and Champion per Dominic) ──
  const catalog = await Promise.all([
    // Lucky Me! — instant noodles
    prisma.catalogItem.upsert({ where: { sku: "LM-PC-ORIG-60"  }, update: {}, create: { sku: "LM-PC-ORIG-60",  name: "Lucky Me! Pancit Canton Original 60g",       category: "NOODLES", unit: "pc", unitPrice: 13.50, brand: "Lucky Me!",     supplierId: suppliers[0].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "LM-PC-CHILI-60" }, update: {}, create: { sku: "LM-PC-CHILI-60", name: "Lucky Me! Pancit Canton Chilimansi 60g",     category: "NOODLES", unit: "pc", unitPrice: 13.50, brand: "Lucky Me!",     supplierId: suppliers[0].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "LM-BEEF-55"     }, update: {}, create: { sku: "LM-BEEF-55",     name: "Lucky Me! Beef Noodles 55g",                 category: "NOODLES", unit: "pc", unitPrice: 13.00, brand: "Lucky Me!",     supplierId: suppliers[0].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "LM-GOCUP-70"    }, update: {}, create: { sku: "LM-GOCUP-70",    name: "Lucky Me! Go Cup Pancit Canton 70g",         category: "NOODLES", unit: "pc", unitPrice: 22.00, brand: "Lucky Me!",     supplierId: suppliers[0].id, active: true } }),
    // Monde Nissin / Monde M.Y. San — biscuits
    prisma.catalogItem.upsert({ where: { sku: "MND-CREAMO-316" }, update: {}, create: { sku: "MND-CREAMO-316", name: "Monde Cream-O Sandwich Cookies 316g",        category: "BISCUITS", unit: "pack", unitPrice: 58.00, brand: "Monde Nissin",  supplierId: suppliers[0].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "MND-BUTTER-240" }, update: {}, create: { sku: "MND-BUTTER-240", name: "Monde Special Butter Cookies 240g",          category: "BISCUITS", unit: "pack", unitPrice: 95.00, brand: "Monde Nissin",  supplierId: suppliers[0].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "MYS-SKYFLK-250" }, update: {}, create: { sku: "MYS-SKYFLK-250", name: "SkyFlakes Crackers 10x25g",                  category: "BISCUITS", unit: "pack", unitPrice: 48.00, brand: "Monde M.Y. San", supplierId: suppliers[0].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "MYS-FITA-300"   }, update: {}, create: { sku: "MYS-FITA-300",   name: "Fita Crackers 300g",                         category: "BISCUITS", unit: "pack", unitPrice: 52.00, brand: "Monde M.Y. San", supplierId: suppliers[0].id, active: true } }),
    // Mama Sita's — sauces & seasoning mixes
    prisma.catalogItem.upsert({ where: { sku: "MS-OYSTER-405"  }, update: {}, create: { sku: "MS-OYSTER-405",  name: "Mama Sita's Oyster Sauce 405g",              category: "CONDIMENTS", unit: "btl",  unitPrice: 68.00, brand: "Mama Sita's",  supplierId: suppliers[0].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "MS-SASWEET-50"  }, update: {}, create: { sku: "MS-SASWEET-50",  name: "Mama Sita's Sweet & Sour Sauce Mix 50g",     category: "CONDIMENTS", unit: "pack", unitPrice: 15.00, brand: "Mama Sita's",  supplierId: suppliers[0].id, active: true } }),
    // Dutch Mill — yogurt drinks
    prisma.catalogItem.upsert({ where: { sku: "DM-YOG-ORIG-180"  }, update: {}, create: { sku: "DM-YOG-ORIG-180",  name: "Dutch Mill Yogurt Drink Original 180ml",   category: "DAIRY", unit: "btl", unitPrice: 18.00, brand: "Dutch Mill", supplierId: suppliers[0].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "DM-YOG-STRAW-180" }, update: {}, create: { sku: "DM-YOG-STRAW-180", name: "Dutch Mill Yogurt Drink Strawberry 180ml", category: "DAIRY", unit: "btl", unitPrice: 18.00, brand: "Dutch Mill", supplierId: suppliers[0].id, active: true } }),
    // Century Tuna — canned goods
    prisma.catalogItem.upsert({ where: { sku: "CT-FLAKE-OIL-155"  }, update: {}, create: { sku: "CT-FLAKE-OIL-155",  name: "Century Tuna Flakes in Oil 155g",    category: "CANNED_GOODS", unit: "can", unitPrice: 38.00, brand: "Century Tuna", supplierId: suppliers[1].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "CT-HOTSPICY-155"   }, update: {}, create: { sku: "CT-HOTSPICY-155",   name: "Century Tuna Hot & Spicy 155g",      category: "CANNED_GOODS", unit: "can", unitPrice: 40.00, brand: "Century Tuna", supplierId: suppliers[1].id, active: true } }),
    // Champion — household / detergent
    prisma.catalogItem.upsert({ where: { sku: "CHM-POWDER-68" }, update: {}, create: { sku: "CHM-POWDER-68", name: "Champion Detergent Powder 68g",   category: "HOUSEHOLD", unit: "sachet", unitPrice: 8.00,  brand: "Champion", supplierId: suppliers[2].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "CHM-BAR-380"   }, update: {}, create: { sku: "CHM-BAR-380",   name: "Champion Detergent Bar 380g",     category: "HOUSEHOLD", unit: "bar",    unitPrice: 28.00, brand: "Champion", supplierId: suppliers[2].id, active: true } }),
  ]);

  const catMap = Object.fromEntries(catalog.map((c) => [c.sku, c]));

  // ── Stock ─────────────────────────────────────────────────────────────────
  for (const item of catalog) {
    for (const wh of [mnl, ceb]) {
      await prisma.stock.upsert({
        where: { skuId_warehouseId: { skuId: item.id, warehouseId: wh.id } },
        update: {},
        create: {
          skuId: item.id,
          warehouseId: wh.id,
          onHand: 2000,
          reserved: 0,
          reorderAt: 200,
        },
      });
    }
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  const pw = await hash("password123", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@disucarsales.ph" },
    update: {},
    create: { email: "admin@disucarsales.ph", name: "Admin User", passwordHash: pw, role: "ADMIN" as Role },
  });
  const financeUser = await prisma.user.upsert({
    where: { email: "finance@disucarsales.ph" },
    update: {},
    create: { email: "finance@disucarsales.ph", name: "F. Villanueva", passwordHash: pw, role: "FINANCE" as Role },
  });
  const agentUser = await prisma.user.upsert({
    where: { email: "agent@disucarsales.ph" },
    update: {},
    create: { email: "agent@disucarsales.ph", name: "Sales Agent", passwordHash: pw, role: "AGENT" as Role },
  });
  await prisma.user.upsert({
    where: { email: "warehouse@disucarsales.ph" },
    update: {},
    create: { email: "warehouse@disucarsales.ph", name: "Warehouse Staff", passwordHash: pw, role: "WAREHOUSE" as Role },
  });
  await prisma.user.upsert({
    where: { email: "procurement@puregold-urdaneta.ph" },
    update: {},
    create: {
      email: "procurement@puregold-urdaneta.ph", name: "Puregold Urdaneta Procurement",
      passwordHash: pw, role: "CUSTOMER" as Role, customerId: customers[0].id,
    },
  });

  await prisma.user.upsert({
    where: { email: "driver@disucarsales.ph" },
    update: {},
    create: { email: "driver@disucarsales.ph", name: "Rodel Reyes", passwordHash: pw, role: "DRIVER" as Role },
  });

  // ── Customer-linked login accounts (one per retail account) ─────────────────
  const customerUsers = [
    { email: "procurement@puregold-urdaneta.ph", name: "Puregold Urdaneta Procurement", custIdx: 0 },
    { email: "orders@savemoredagupan.ph",         name: "SM Savemore Dagupan Orders",    custIdx: 1 },
    { email: "store@alfamarturdaneta.ph",         name: "Alfamart Urdaneta Store",       custIdx: 2 },
    { email: "fely@felysminimart.ph",             name: "Fely's Mini Mart",              custIdx: 3 },
    { email: "orders@villaflorgm.ph",             name: "Villaflor GM Orders",           custIdx: 4 },
    { email: "delacruzstore@gmail.com",           name: "Dela Cruz Sari-Sari Store",      custIdx: 5 },
    { email: "alingnena@gmail.com",                name: "Aling Nena's Store",             custIdx: 6 },
    { email: "purchasing@csisupermarket.ph",       name: "CSI Supermarket Purchasing",     custIdx: 7 },
  ];
  for (const u of customerUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, name: u.name, passwordHash: pw, role: "CUSTOMER" as Role, customerId: customers[u.custIdx].id },
    });
  }

  // ── Sample orders ─────────────────────────────────────────────────────────
  async function upsertOrder(
    id: string, custId: string, whId: string,
    state: string, cwt2307: boolean,
    lines: { sku: string; qty: number; unitPrice: number }[]
  ) {
    const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const vat = subtotal * 0.12;
    const cwt = cwt2307 ? subtotal * 0.02 : 0;
    const total = subtotal + vat - cwt;

    const exists = await prisma.order.findUnique({ where: { id } });
    if (!exists) {
      await prisma.order.create({
        data: {
          id, customerId: custId, agentId: adminUser.id, warehouseId: whId,
          state: state as any, cwt2307, subtotal, vat, cwt, total,
          lines: {
            create: lines.map((l) => {
              const item = catMap[l.sku];
              return { skuId: item.id, name: item.name, unit: item.unit, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.qty * l.unitPrice };
            }),
          },
          events: { create: { state, actorId: adminUser.id, note: "Seeded" } },
        },
      });
    }
  }

  // Quantities and prices below are denominated in cases (see CatalogItem.unit /
  // unitsPerCase) — Disucar trades by the case, not the individual piece.
  await upsertOrder("SO-2026-0418", customers[0].id, mnl.id, "PENDING",   false, [{ sku: "LM-PC-ORIG-60",  qty: 10, unitPrice: 972.00 },  { sku: "LM-BEEF-55",      qty: 8,  unitPrice: 936.00 }]);
  await upsertOrder("SO-2026-0417", customers[1].id, mnl.id, "APPROVED",  false, [{ sku: "MYS-SKYFLK-250", qty: 15, unitPrice: 576.00 },  { sku: "MND-BUTTER-240",  qty: 10, unitPrice: 1140.00 }]);
  await upsertOrder("SO-2026-0416", customers[2].id, ceb.id, "PREPARING", false, [{ sku: "MS-OYSTER-405",  qty: 12, unitPrice: 816.00 }]);
  await upsertOrder("SO-2026-0415", customers[3].id, mnl.id, "SHIPPED",   false, [{ sku: "DM-YOG-ORIG-180", qty: 10, unitPrice: 432.00 }, { sku: "DM-YOG-STRAW-180", qty: 8,  unitPrice: 432.00 }]);
  await upsertOrder("SO-2026-0413", customers[4].id, dvo.id, "DELIVERED", false, [{ sku: "CT-FLAKE-OIL-155", qty: 20, unitPrice: 1824.00 }]);
  await upsertOrder("SO-2026-0412", customers[7].id, mnl.id, "DELIVERED", false, [{ sku: "CHM-BAR-380",     qty: 15, unitPrice: 672.00 }]);

  // ── Accounting seed ───────────────────────────────────────────────────────
  // Journal entries
  const jeData = [
    // ── AR: base orders (case-priced) ──────────────────────────────────────
    { id: "JE-2026-05-0418", date: hoursAgo(1),   source: "AR" as JeSource, ref: "INV-2026-0418", memo: "Sale to Puregold Urdaneta",                    lines: [{ code: "1100", dr: 19272.96, cr: 0 }, { code: "4000", dr: 0, cr: 17208.00 }, { code: "2100", dr: 0, cr: 2064.96 }] },
    { id: "JE-2026-05-0417", date: hoursAgo(3),   source: "AR" as JeSource, ref: "INV-2026-0417", memo: "Sale to SM Savemore Dagupan",                   lines: [{ code: "1100", dr: 22444.80, cr: 0 }, { code: "4000", dr: 0, cr: 20040.00 }, { code: "2100", dr: 0, cr: 2404.80 }] },
    { id: "JE-2026-05-0416a", date: daysAgo(6),   source: "AR" as JeSource, ref: "INV-2026-0416", memo: "Sale to Alfamart Urdaneta",                     lines: [{ code: "1100", dr: 10967.04, cr: 0 }, { code: "4000", dr: 0, cr: 9792.00 },  { code: "2100", dr: 0, cr: 1175.04 }] },
    { id: "JE-2026-05-0416b", date: daysAgo(1),   source: "BANK" as JeSource, ref: "INV-2026-0416", memo: "Partial payment received — Alfamart Urdaneta", lines: [{ code: "1010", dr: 5000.00,  cr: 0 }, { code: "1100", dr: 0, cr: 5000.00 }] },
    { id: "JE-2026-05-0413a", date: daysAgo(9),   source: "AR" as JeSource, ref: "INV-2026-0413", memo: "Sale to Villaflor General Merchandise — delivered", lines: [{ code: "1100", dr: 40857.60, cr: 0 }, { code: "4000", dr: 0, cr: 36480.00 }, { code: "2100", dr: 0, cr: 4377.60 }, { code: "5000", dr: 25536.00, cr: 0 }, { code: "1220", dr: 0, cr: 25536.00 }] },
    { id: "JE-2026-05-0413b", date: daysAgo(2),   source: "BANK" as JeSource, ref: "INV-2026-0413", memo: "Payment received — Villaflor General Merchandise", lines: [{ code: "1010", dr: 40857.60, cr: 0 }, { code: "1100", dr: 0, cr: 40857.60 }] },
    { id: "JE-2026-05-0412", date: daysAgo(4),    source: "AR" as JeSource, ref: "INV-2026-0412", memo: "Sale to CSI Supermarket — delivered",           lines: [{ code: "1100", dr: 11289.60, cr: 0 }, { code: "4000", dr: 0, cr: 10080.00 }, { code: "2100", dr: 0, cr: 1209.60 }, { code: "5000", dr: 7056.00, cr: 0 }, { code: "1200", dr: 0, cr: 7056.00 }] },
    // ── AR: due-for-payment showcase ────────────────────────────────────────
    { id: "JE-2026-05-DUE01", date: daysAgo(28),  source: "AR" as JeSource, ref: "INV-DUE-01",   memo: "Sale to Fely's Mini Mart",                      lines: [{ code: "1100", dr: 15000.00, cr: 0 }, { code: "4000", dr: 0, cr: 13392.86 }, { code: "2100", dr: 0, cr: 1607.14 }] },
    { id: "JE-2026-05-DUE02", date: daysAgo(29),  source: "AR" as JeSource, ref: "INV-DUE-02",   memo: "Sale to Dela Cruz Sari-Sari Store",             lines: [{ code: "1100", dr: 8500.00,  cr: 0 }, { code: "4000", dr: 0, cr: 7589.29 },  { code: "2100", dr: 0, cr: 910.71 }] },
    // ── AR: Puregold Urdaneta's 2nd unpaid invoice ──────────────────────────
    { id: "JE-2026-05-PGU02", date: daysAgo(10),  source: "AR" as JeSource, ref: "INV-PGU-02",   memo: "Sale to Puregold Urdaneta",                     lines: [{ code: "1100", dr: 22000.00, cr: 0 }, { code: "4000", dr: 0, cr: 19642.86 }, { code: "2100", dr: 0, cr: 2357.14 }] },
    // ── AR: CSI Supermarket's 2nd invoice — paid in the field, pending remittance ──
    { id: "JE-2026-05-CSI02", date: daysAgo(5),   source: "AR" as JeSource, ref: "INV-CSI-02",   memo: "Sale to CSI Supermarket",                       lines: [{ code: "1100", dr: 9450.00,  cr: 0 }, { code: "4000", dr: 0, cr: 8437.50 },  { code: "2100", dr: 0, cr: 1012.50 }] },
    // ── Unrelated to the order/case-pricing refresh — left as-is ────────────
    { id: "JE-2026-04-0416", date: hoursAgo(8),   source: "AP" as JeSource, ref: "PO-2026-0294",  memo: "PO receipt — Monde Nissin Corporation",         lines: [{ code: "1500", dr: 750000, cr: 0 }, { code: "2110", dr: 90000, cr: 0 }, { code: "2000", dr: 0, cr: 825000 }, { code: "2150", dr: 0, cr: 15000 }] },
    { id: "JE-2026-04-0414", date: hoursAgo(26),  source: "INV" as JeSource, ref: "TR-0034",      memo: "Inter-warehouse transfer MNL→CEB",              lines: [{ code: "1210", dr: 73000, cr: 0 }, { code: "1200", dr: 0, cr: 73000 }] },
    { id: "JE-2026-04-0412", date: hoursAgo(38),  source: "PAYROLL" as JeSource, ref: "PAY-2026-04-30", memo: "Bi-monthly payroll · 60 employees",     lines: [{ code: "5100", dr: 1820000, cr: 0 }, { code: "1020", dr: 0, cr: 1488800 }, { code: "2160", dr: 0, cr: 196000 }, { code: "2200", dr: 0, cr: 78400 }, { code: "2210", dr: 0, cr: 32200 }, { code: "2220", dr: 0, cr: 24600 }] },
    { id: "JE-2026-04-0411", date: hoursAgo(48),  source: "AP" as JeSource, ref: "BILL-MERALCO-04", memo: "Meralco — April electricity",                lines: [{ code: "5300", dr: 187500, cr: 0 }, { code: "2110", dr: 22500, cr: 0 }, { code: "2000", dr: 0, cr: 210000 }] },
    { id: "JE-2026-04-0410", date: hoursAgo(56),  source: "AP" as JeSource, ref: "BILL-MAYNILAD-04", memo: "Maynilad water — April",                   lines: [{ code: "5300", dr: 38400, cr: 0 }, { code: "2110", dr: 4608, cr: 0 }, { code: "2000", dr: 0, cr: 43008 }] },
    { id: "JE-2026-04-0408", date: hoursAgo(96),  source: "AP" as JeSource, ref: "PO-2026-0297",  memo: "PO receipt — Century Pacific Food",            lines: [{ code: "1210", dr: 171428, cr: 0 }, { code: "2110", dr: 20571, cr: 0 }, { code: "2000", dr: 0, cr: 192000 }] },
    { id: "JE-2026-04-0407", date: daysAgo(5),    source: "GL" as JeSource, ref: "DEPR-2026-04",  memo: "Monthly depreciation — delivery trucks & warehouse equipment", lines: [{ code: "5500", dr: 142000, cr: 0 }, { code: "1510", dr: 0, cr: 142000 }] },
    { id: "JE-2026-04-0405", date: daysAgo(12),   source: "GL" as JeSource, ref: "ADJ-RENT-04",   memo: "Reclass prepaid rent April",                    lines: [{ code: "5200", dr: 240000, cr: 0 }, { code: "1300", dr: 0, cr: 240000 }] },
  ];

  for (const je of jeData) {
    const exists = await prisma.journalEntry.findUnique({ where: { id: je.id } });
    if (!exists) {
      await prisma.journalEntry.create({
        data: {
          id: je.id, date: je.date, source: je.source,
          ref: je.ref, memo: je.memo, postedById: financeUser.id,
          lines: { create: je.lines.map((l) => ({ code: l.code, dr: l.dr, cr: l.cr })) },
        },
      });
    }
  }

  // Invoices (AR) — recomputed for case-based pricing.
  const invData = [
    // Base orders
    { id: "INV-2026-0418", custCode: "C-2001", soId: "SO-2026-0418", issued: hoursAgo(1),  due: daysFromNow(30), amount: 19272.96, paid: 0,        status: "OPEN"    as InvoiceStatus },
    { id: "INV-2026-0417", custCode: "C-2002", soId: "SO-2026-0417", issued: hoursAgo(3),  due: daysFromNow(30), amount: 22444.80, paid: 0,        status: "OPEN"    as InvoiceStatus },
    { id: "INV-2026-0416", custCode: "C-2003", soId: "SO-2026-0416", issued: daysAgo(6),   due: daysFromNow(24), amount: 10967.04, paid: 5000,     status: "PARTIAL" as InvoiceStatus },
    { id: "INV-2026-0413", custCode: "C-2005", soId: "SO-2026-0413", issued: daysAgo(9),   due: daysFromNow(21), amount: 40857.60, paid: 40857.60, status: "PAID"    as InvoiceStatus },
    // CSI Supermarket — 2 paid invoices ready for collection (collected in the field,
    // pending remittance to Finance — see Collection seeding below)
    { id: "INV-2026-0412", custCode: "C-2008", soId: "SO-2026-0412", issued: daysAgo(4),   due: daysFromNow(26), amount: 11289.60, paid: 11289.60, status: "PAID"    as InvoiceStatus },
    { id: "INV-CSI-02",    custCode: "C-2008", soId: null,           issued: daysAgo(5),   due: daysFromNow(25), amount: 9450.00,  paid: 9450.00,  status: "PAID"    as InvoiceStatus },
    // Due for payment
    { id: "INV-DUE-01",    custCode: "C-2004", soId: null,           issued: daysAgo(28),  due: daysFromNow(2),  amount: 15000.00, paid: 0,        status: "OPEN"    as InvoiceStatus },
    { id: "INV-DUE-02",    custCode: "C-2006", soId: null,           issued: daysAgo(29),  due: daysFromNow(1),  amount: 8500.00,  paid: 0,        status: "OPEN"    as InvoiceStatus },
    // Puregold Urdaneta — 2 pending unpaid invoices (this one + INV-2026-0418 above)
    { id: "INV-PGU-02",    custCode: "C-2001", soId: null,           issued: daysAgo(10),  due: daysFromNow(20), amount: 22000.00, paid: 0,        status: "OPEN"    as InvoiceStatus },
  ];

  for (const inv of invData) {
    const cust = customers.find((c) => c.code === inv.custCode);
    if (!cust) continue;
    await prisma.invoice.upsert({
      where: { id: inv.id },
      update: {},
      create: {
        id: inv.id, customerId: cust.id,
        soId: inv.soId ?? undefined,
        issued: inv.issued, due: inv.due,
        amount: inv.amount, paid: inv.paid, status: inv.status,
      },
    });
  }

  // Field collections — CSI Supermarket's 2 invoices above are fully paid by the
  // customer but the cash is still with the field agent, awaiting remittance to
  // Finance (Collection.status stays PENDING until recordRemittance is called).
  const collectionData = [
    { id: "COL-CSI-01", invoiceId: "INV-2026-0412", amount: 11289.60, collectedAt: daysAgo(1) },
    { id: "COL-CSI-02", invoiceId: "INV-CSI-02",    amount: 9450.00,  collectedAt: daysAgo(1) },
  ];

  for (const c of collectionData) {
    await prisma.collection.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        employeeId: agentUser.id,
        invoiceId: c.invoiceId,
        amountCollected: c.amount,
        collectedAt: c.collectedAt,
        status: "PENDING",
      },
    });
  }

  // Bills (AP)
  const billData = [
    { id: "BILL-2026-0211", suppCode: "SUP-101", ref: "PO-2026-0294",  vendor: null,      note: null,                              issued: hoursAgo(8),  due: daysFromNow(37), amount: 825000, paid: 0,      status: "OPEN"    as BillStatus },
    { id: "BILL-MERALCO-04",suppCode: null,       ref: null,            vendor: "Meralco", note: "April electricity · WH-MNL + HQ", issued: hoursAgo(48), due: daysFromNow(10), amount: 210000, paid: 0,      status: "OPEN"    as BillStatus },
    { id: "BILL-MAYNILAD-04",suppCode: null,      ref: null,            vendor: "Maynilad",note: "April water · WH-MNL",            issued: hoursAgo(56), due: daysFromNow(12), amount: 43008,  paid: 0,      status: "OPEN"    as BillStatus },
    { id: "BILL-2026-0210", suppCode: "SUP-102", ref: "PO-2026-0297",  vendor: null,      note: null,                              issued: hoursAgo(96), due: daysFromNow(22), amount: 192000, paid: 0,      status: "OPEN"    as BillStatus },
    { id: "BILL-2026-0209", suppCode: "SUP-103", ref: "PO-2026-0291",  vendor: null,      note: null,                              issued: daysAgo(8),   due: daysAgo(7),      amount: 128000, paid: 0,      status: "OVERDUE" as BillStatus },
    { id: "BILL-2026-0208", suppCode: "SUP-102", ref: "PO-2026-0289",  vendor: null,      note: null,                              issued: daysAgo(15),  due: daysFromNow(0),  amount: 98000,  paid: 0,      status: "DUE"     as BillStatus },
    { id: "BILL-2026-0207", suppCode: "SUP-101", ref: "PO-2026-0287",  vendor: null,      note: null,                              issued: daysAgo(38),  due: daysAgo(8),      amount: 165000, paid: 100000, status: "PARTIAL" as BillStatus },
    { id: "BILL-2026-0206", suppCode: "SUP-103", ref: "PO-2026-0285",  vendor: null,      note: null,                              issued: daysAgo(52),  due: daysAgo(22),     amount: 412000, paid: 412000, status: "PAID"    as BillStatus },
  ];

  for (const b of billData) {
    const sup = b.suppCode ? suppliers.find((s) => s.code === b.suppCode) : null;
    await prisma.bill.upsert({
      where: { id: b.id },
      update: {},
      create: {
        id: b.id,
        supplierId: sup?.id,
        vendor: b.vendor ?? undefined,
        ref: b.ref ?? undefined,
        note: b.note ?? undefined,
        issued: b.issued, due: b.due,
        amount: b.amount, paid: b.paid, status: b.status,
      },
    });
  }

  // BIR Filings
  const birData = [
    { id: "2550Q-2026Q1",    form: "BIR 2550Q",   period: "2026 Q1",  desc: "Quarterly VAT Return",                   due: daysFromNow(16), amount: 482500, status: "DUE"     as BirStatus },
    { id: "1601EQ-2026Q1",   form: "BIR 1601-EQ", period: "2026 Q1",  desc: "Quarterly EWT Remittance",               due: daysFromNow(22), amount: 168000, status: "DUE"     as BirStatus },
    { id: "1601C-04-2026",   form: "BIR 1601-C",  period: "Apr 2026", desc: "Monthly Withholding on Compensation",    due: daysAgo(1),      amount: 196000, status: "FILED"   as BirStatus },
    { id: "0619E-04-2026",   form: "BIR 0619-E",  period: "Apr 2026", desc: "Monthly EWT Remittance",                 due: daysAgo(2),      amount: 56000,  status: "FILED"   as BirStatus },
    { id: "2550M-04-2026",   form: "BIR 2550M",   period: "Apr 2026", desc: "Monthly VAT Return",                     due: daysAgo(11),     amount: 158400, status: "FILED"   as BirStatus },
    { id: "1701Q-2026Q1",    form: "BIR 1701Q",   period: "2026 Q1",  desc: "Quarterly Income Tax Return",            due: daysFromNow(50), amount: 0,      status: "PENDING" as BirStatus },
  ];

  for (const f of birData) {
    await prisma.birFiling.upsert({
      where: { id: f.id },
      update: {},
      create: f,
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
