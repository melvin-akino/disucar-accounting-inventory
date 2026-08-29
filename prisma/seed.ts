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
    // Codes are load-bearing: INVENTORY_ACCOUNT_BY_WAREHOUSE_CODE in src/lib/coa.ts maps
    // MNL/CEB/DVO/URD to GL accounts 1200-1230. Rename the yards, never the codes.
    create: { code: "MNL", name: "Urdaneta Main Yard", city: "Urdaneta" },
  });
  const ceb = await prisma.warehouse.upsert({
    where: { code: "CEB" },
    update: {},
    create: { code: "CEB", name: "Dagupan Yard", city: "Dagupan" },
  });
  const dvo = await prisma.warehouse.upsert({
    where: { code: "DVO" },
    update: {},
    create: { code: "DVO", name: "Rosales Aggregates Depot", city: "Rosales" },
  });

  // ── Customers (construction trade — Disucar is based in Urdaneta, Pangasinan) ──
  const customers = await Promise.all([
    prisma.customer.upsert({ where: { code: "C-2001" }, update: {}, create: { code: "C-2001", name: "Bautista Construction & Development",  type: "CONTRACTOR",     tin: "000-111-222-000", region: "I",  city: "Urdaneta",   terms: "Net 30", creditLimit: 500_000, contactEmail: "procurement@bautistaconstruction.ph", blanketDiscountPct: 3 } }),
    prisma.customer.upsert({ where: { code: "C-2002" }, update: {}, create: { code: "C-2002", name: "Pangasinan Builders Supply",          type: "HARDWARE",       tin: "000-222-333-000", region: "I",  city: "Dagupan",    terms: "Net 30", creditLimit: 450_000, contactEmail: "orders@pangasinanbuilders.ph" } }),
    prisma.customer.upsert({ where: { code: "C-2003" }, update: {}, create: { code: "C-2003", name: "Sison Hardware & Construction Supply", type: "HARDWARE",      tin: "000-333-444-000", region: "I",  city: "Urdaneta",   terms: "Net 15", creditLimit: 150_000, contactEmail: "sales@sisonhardware.ph" } }),
    prisma.customer.upsert({ where: { code: "C-2004" }, update: {}, create: { code: "C-2004", name: "Reyes Engineering Works",             type: "CONTRACTOR",     tin: "000-444-555-000", region: "I",  city: "San Carlos", terms: "Net 15", creditLimit: 60_000,  contactEmail: "admin@reyesengineering.ph" } }),
    prisma.customer.upsert({ where: { code: "C-2005" }, update: {}, create: { code: "C-2005", name: "Villaflor Aggregates Trading",        type: "WHOLESALER",     tin: "000-555-666-000", region: "I",  city: "Rosales",    terms: "Net 30", creditLimit: 300_000, contactEmail: "orders@villaflorgm.ph", blanketDiscountPct: 5 } }),
    prisma.customer.upsert({ where: { code: "C-2006" }, update: {}, create: { code: "C-2006", name: "Dela Cruz Homebuilders",              type: "WALK_IN",        tin: "000-666-777-000", region: "I",  city: "Urdaneta",   terms: "COD",    creditLimit: 25_000,  contactEmail: "delacruzbuild@gmail.com" } }),
    prisma.customer.upsert({ where: { code: "C-2007" }, update: {}, create: { code: "C-2007", name: "Baguio Highlands Development Corp.",  type: "DEVELOPER",      tin: "000-777-888-000", region: "CAR", city: "Baguio",     terms: "Net 45", creditLimit: 40_000,  contactEmail: "projects@baguiohighlands.ph" } }),
    prisma.customer.upsert({ where: { code: "C-2008" }, update: {}, create: { code: "C-2008", name: "CSI Infrastructure Builders",         type: "CONTRACTOR",     tin: "000-888-999-000", region: "I",  city: "Dagupan",    terms: "Net 30", creditLimit: 380_000, contactEmail: "purchasing@csibuilders.ph" } }),
  ]);

  // ── Suppliers (cement, steel and quarry principals) ─────────────────────────────
  const suppliers = await Promise.all([
    prisma.supplier.upsert({ where: { code: "SUP-101" }, update: {}, create: { code: "SUP-101", name: "Northern Cement Corporation",      contactEmail: "orders@northerncement.com.ph", city: "Sison, Pangasinan", leadTimeDays: 7,  status: "ACTIVE" as SupplierStatus } }),
    prisma.supplier.upsert({ where: { code: "SUP-102" }, update: {}, create: { code: "SUP-102", name: "Pag-asa Steel Works, Inc.",        contactEmail: "trade@pagasasteel.com.ph",     city: "Pasig",             leadTimeDays: 10, status: "ACTIVE" as SupplierStatus } }),
    prisma.supplier.upsert({ where: { code: "SUP-103" }, update: {}, create: { code: "SUP-103", name: "Agno River Aggregates Quarry",     contactEmail: "dispatch@agnoaggregates.ph",   city: "Rosales",           leadTimeDays: 2,  status: "ACTIVE" as SupplierStatus } }),
  ]);

  // ── Product categories (managed by catalog admins — see catalog/actions.ts) ─
  await Promise.all([
    prisma.category.upsert({ where: { code: "CEMENT" },     update: {}, create: { code: "CEMENT",     name: "Cement & Binders",   sortOrder: 1 } }),
    prisma.category.upsert({ where: { code: "AGGREGATES" }, update: {}, create: { code: "AGGREGATES", name: "Aggregates",         sortOrder: 2 } }),
    prisma.category.upsert({ where: { code: "HAULING" },    update: {}, create: { code: "HAULING",    name: "Hauling & Delivery", sortOrder: 3 } }),
    prisma.category.upsert({ where: { code: "STEEL" },      update: {}, create: { code: "STEEL",      name: "Steel & Rebar",      sortOrder: 4 } }),
    prisma.category.upsert({ where: { code: "LUMBER" },     update: {}, create: { code: "LUMBER",     name: "Lumber & Panels",    sortOrder: 5 } }),
    prisma.category.upsert({ where: { code: "HARDWARE" },   update: {}, create: { code: "HARDWARE",   name: "Hardware",           sortOrder: 6 } }),
    prisma.category.upsert({ where: { code: "OTHER" },      update: {}, create: { code: "OTHER",      name: "Other",              sortOrder: 99 } }),
  ]);

  // ── Catalog ────────────────────────────────────────────────────────────────
  // Three kinds of item (see ItemKind in schema.prisma):
  //   PACKAGED    — cement by the bag, rebar by the length, plywood by the sheet
  //   BULK        — stockpile material held and costed per cubic metre
  //   BULK_VESSEL — a truck size that draws its volume from one of those piles
  const packaged = await Promise.all([
    // Cement & binders
    prisma.catalogItem.upsert({ where: { sku: "CEM-PORT-40"   }, update: {}, create: { sku: "CEM-PORT-40",   name: "Portland Cement Type 1 — 40kg",    category: "CEMENT",   unit: "bag",   unitPrice: 265.00, wholesalePrice: 245.00, wholesaleMinQty: 50,  brand: "Northern Cement", supplierId: suppliers[0].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "CEM-POZZ-40"   }, update: {}, create: { sku: "CEM-POZZ-40",   name: "Pozzolan Cement — 40kg",           category: "CEMENT",   unit: "bag",   unitPrice: 250.00, wholesalePrice: 232.00, wholesaleMinQty: 50,  brand: "Northern Cement", supplierId: suppliers[0].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "CEM-MASON-40"  }, update: {}, create: { sku: "CEM-MASON-40",  name: "Masonry Cement — 40kg",            category: "CEMENT",   unit: "bag",   unitPrice: 240.00, wholesalePrice: 224.00, wholesaleMinQty: 50,  brand: "Northern Cement", supplierId: suppliers[0].id, active: true } }),

    // Steel & rebar
    prisma.catalogItem.upsert({ where: { sku: "RSB-10-6M"     }, update: {}, create: { sku: "RSB-10-6M",     name: "Deformed Bar 10mm x 6m",           category: "STEEL",    unit: "pc",    unitPrice: 185.00, wholesalePrice: 172.00, wholesaleMinQty: 100, brand: "Pag-asa Steel",   supplierId: suppliers[1].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "RSB-12-6M"     }, update: {}, create: { sku: "RSB-12-6M",     name: "Deformed Bar 12mm x 6m",           category: "STEEL",    unit: "pc",    unitPrice: 265.00, wholesalePrice: 248.00, wholesaleMinQty: 100, brand: "Pag-asa Steel",   supplierId: suppliers[1].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "RSB-16-6M"     }, update: {}, create: { sku: "RSB-16-6M",     name: "Deformed Bar 16mm x 6m",           category: "STEEL",    unit: "pc",    unitPrice: 470.00, wholesalePrice: 442.00, wholesaleMinQty: 50,  brand: "Pag-asa Steel",   supplierId: suppliers[1].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "GITIE-16"      }, update: {}, create: { sku: "GITIE-16",      name: "G.I. Tie Wire #16 — 1kg",          category: "STEEL",    unit: "kg",    unitPrice: 95.00,  wholesalePrice: 86.00,  wholesaleMinQty: 20,  brand: "Pag-asa Steel",   supplierId: suppliers[1].id, active: true } }),

    // Lumber & panels
    prisma.catalogItem.upsert({ where: { sku: "PLY-MARINE-12" }, update: {}, create: { sku: "PLY-MARINE-12", name: "Marine Plywood 1/2in x 4ft x 8ft", category: "LUMBER",   unit: "sheet", unitPrice: 890.00, wholesalePrice: 835.00, wholesaleMinQty: 20,  active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "PLY-ORD-6"     }, update: {}, create: { sku: "PLY-ORD-6",     name: "Ordinary Plywood 1/4in x 4ft x 8ft", category: "LUMBER", unit: "sheet", unitPrice: 420.00, wholesalePrice: 392.00, wholesaleMinQty: 20,  active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "LUM-COCO-2X3"  }, update: {}, create: { sku: "LUM-COCO-2X3",  name: "Coco Lumber 2in x 3in x 10ft",     category: "LUMBER",   unit: "pc",    unitPrice: 165.00, wholesalePrice: 152.00, wholesaleMinQty: 50,  active: true } }),

    // Hardware
    prisma.catalogItem.upsert({ where: { sku: "CHB-4"         }, update: {}, create: { sku: "CHB-4",         name: "Concrete Hollow Block 4in",        category: "HARDWARE", unit: "pc",    unitPrice: 18.00,  wholesalePrice: 15.50,  wholesaleMinQty: 500, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "CHB-6"         }, update: {}, create: { sku: "CHB-6",         name: "Concrete Hollow Block 6in",        category: "HARDWARE", unit: "pc",    unitPrice: 26.00,  wholesalePrice: 22.50,  wholesaleMinQty: 500, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "CWN-4"         }, update: {}, create: { sku: "CWN-4",         name: "Common Wire Nail 4in — 1kg",       category: "HARDWARE", unit: "kg",    unitPrice: 88.00,  wholesalePrice: 79.00,  wholesaleMinQty: 25,  active: true } }),
  ]);

  // ── Stockpile materials ────────────────────────────────────────────────────
  // Received by the truckload (typically 18 m³ at a total delivered cost) and held per
  // cubic metre. unitPrice is the walk-in rate per m³; the cost COGS uses comes from
  // each delivery's own lot, never from this row.
  const bulk = await Promise.all([
    prisma.catalogItem.upsert({ where: { sku: "AGG-SAND"     }, update: {}, create: { sku: "AGG-SAND",     name: "Washed Sand",       category: "AGGREGATES", unit: "m3", itemKind: "BULK", unitPrice: 1250.00, wholesalePrice: 1150.00, wholesaleMinQty: 18, supplierId: suppliers[2].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "AGG-GRAVEL"   }, update: {}, create: { sku: "AGG-GRAVEL",   name: "Gravel",            category: "AGGREGATES", unit: "m3", itemKind: "BULK", unitPrice: 1400.00, wholesalePrice: 1290.00, wholesaleMinQty: 18, supplierId: suppliers[2].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "AGG-CRUSH-34" }, update: {}, create: { sku: "AGG-CRUSH-34", name: "3/4 Crushed Stone", category: "AGGREGATES", unit: "m3", itemKind: "BULK", unitPrice: 1550.00, wholesalePrice: 1430.00, wholesaleMinQty: 18, supplierId: suppliers[2].id, active: true } }),
    prisma.catalogItem.upsert({ where: { sku: "AGG-MIXED"    }, update: {}, create: { sku: "AGG-MIXED",    name: "Mixed Gravel",      category: "AGGREGATES", unit: "m3", itemKind: "BULK", unitPrice: 1180.00, wholesalePrice: 1090.00, wholesaleMinQty: 18, supplierId: suppliers[2].id, active: true } }),
  ]);
  const bulkBySku = Object.fromEntries(bulk.map((b) => [b.sku, b]));

  // ── Truck sizes ────────────────────────────────────────────────────────────
  // Sellable loads. A vessel holds no stock of its own: one sold draws bulkVolumeM3
  // from the pile it references, so 3 mini-trucks of sand is a single line of qty 3
  // drawing 7.5 m³. The dimensions are what the customer is quoted.
  const TRUCK_SIZES = [
    { code: "MT", label: "Mini-Truck", volumeM3: 2.5,  lengthM: 2.00, widthM: 1.50, heightM: 0.833 },
    { code: "ET", label: "Elf Truck",  volumeM3: 4.0,  lengthM: 2.60, widthM: 1.60, heightM: 0.962 },
    { code: "DT", label: "Dump Truck", volumeM3: 10.0, lengthM: 3.60, widthM: 2.10, heightM: 1.323 },
  ];
  const HAULED = [
    { sku: "AGG-SAND",     short: "Sand",         ratePerM3: 1250 },
    { sku: "AGG-GRAVEL",   short: "Gravel",       ratePerM3: 1400 },
    { sku: "AGG-CRUSH-34", short: "3/4 Crush",    ratePerM3: 1550 },
    { sku: "AGG-MIXED",    short: "Mixed Gravel", ratePerM3: 1180 },
  ];
  // Delivery charge baked into the load price — a truck is priced as a truck, not as
  // volume × rate, which is why the vessel carries its own price rather than deriving one.
  const HAUL_FEE = 800;

  const vessels = await Promise.all(
    TRUCK_SIZES.flatMap((t) =>
      HAULED.map((m) => {
        const sku = `${t.code}-${m.sku.replace("AGG-", "")}`;
        const retail = Math.round((m.ratePerM3 * t.volumeM3 + HAUL_FEE) / 10) * 10;
        return prisma.catalogItem.upsert({
          where: { sku },
          update: {},
          create: {
            sku,
            name: `${t.label} — ${m.short}`,
            category: "HAULING",
            unit: "load",
            itemKind: "BULK_VESSEL",
            bulkSourceId: bulkBySku[m.sku].id,
            bulkVolumeM3: t.volumeM3,
            lengthM: t.lengthM,
            widthM: t.widthM,
            heightM: t.heightM,
            unitPrice: retail,
            wholesalePrice: Math.round((m.ratePerM3 * t.volumeM3 * 0.92 + HAUL_FEE) / 10) * 10,
            wholesaleMinQty: 2,
            active: true,
          },
        });
      })
    )
  );

  const catalog = [...packaged, ...bulk, ...vessels];

  const catMap = Object.fromEntries(catalog.map((c) => [c.sku, c]));

  // ── Stock ─────────────────────────────────────────────────────────────────
  // Truck sizes are deliberately skipped: a vessel holds no stock of its own, it draws
  // from the pile it references. Giving it a Stock row would double-count the material.
  const stocked = [...packaged, ...bulk];

  for (const item of stocked) {
    const isBulk = item.itemKind === "BULK";
    for (const wh of [mnl, ceb]) {
      await prisma.stock.upsert({
        where: { skuId_warehouseId: { skuId: item.id, warehouseId: wh.id } },
        update: {},
        create: {
          skuId: item.id,
          warehouseId: wh.id,
          // Piles are held in cubic metres, packaged goods in their own units.
          onHand: isBulk ? 54 : 2000,
          reserved: 0,
          reorderAt: isBulk ? 18 : 200,
        },
      });
    }
  }

  // ── Cost layers ────────────────────────────────────────────────────────────
  // Every SKU gets two receipts at different costs, a week apart, so FIFO has
  // something real to consume and margin reporting is not flat from day one. This is
  // the price movement the whole costing rework exists for: cement at 200 one week and
  // 205 the next must stay two distinguishable layers.
  //
  // Aggregates are received as truckloads of 18 m³ at a total delivered cost, so their
  // per-m³ cost is that total spread over the load (7,000 / 18 = 388.8889).
  const TRUCKLOAD_M3 = 18;
  const bulkLoadCost: Record<string, [number, number]> = {
    "AGG-SAND":     [7_000, 7_400],
    "AGG-GRAVEL":   [8_200, 8_500],
    "AGG-CRUSH-34": [9_100, 9_450],
    "AGG-MIXED":    [6_600, 6_900],
  };

  for (const item of stocked) {
    const isBulk = item.itemKind === "BULK";
    const retail = Number(item.unitPrice);

    // Two deliveries: the older layer part-drawn, the newer one intact.
    const layers = isBulk
      ? bulkLoadCost[item.sku].map((total) => total / TRUCKLOAD_M3)
      : [retail * 0.72, retail * 0.75];
    const received = isBulk ? [TRUCKLOAD_M3, TRUCKLOAD_M3] : [1200, 1200];
    const remaining = isBulk ? [18, 36] : [800, 1200];

    for (const wh of [mnl, ceb]) {
      for (let i = 0; i < layers.length; i++) {
        const lotNumber = `${item.sku}-L${i + 1}`;
        const exists = await prisma.lot.findFirst({
          where: { lotNumber, skuId: item.id, warehouseId: wh.id },
        });
        if (exists) continue;
        await prisma.lot.create({
          data: {
            lotNumber,
            skuId: item.id,
            warehouseId: wh.id,
            receivedQty: received[i],
            remainingQty: remaining[i] / 2,
            unitCost: Math.round(layers[i] * 10000) / 10000,
            receivedAt: daysAgo(i === 0 ? 21 : 7),
          },
        });
      }
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
  await prisma.user.upsert({
    where: { email: "cashier@disucarsales.ph" },
    update: {},
    create: { email: "cashier@disucarsales.ph", name: "C. Manalo", passwordHash: pw, role: "CASHIER" as Role },
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
      email: "procurement@puregold-urdaneta.ph", name: "Bautista Construction Procurement",
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
    { email: "procurement@puregold-urdaneta.ph", name: "Bautista Construction Procurement", custIdx: 0 },
    { email: "orders@savemoredagupan.ph",         name: "Pangasinan Builders Supply Orders",    custIdx: 1 },
    { email: "store@alfamarturdaneta.ph",         name: "Sison Hardware Store",       custIdx: 2 },
    { email: "fely@felysminimart.ph",             name: "Reyes Engineering Works",              custIdx: 3 },
    { email: "orders@villaflorgm.ph",             name: "Villaflor GM Orders",           custIdx: 4 },
    { email: "delacruzstore@gmail.com",           name: "Dela Cruz Homebuilders",      custIdx: 5 },
    { email: "alingnena@gmail.com",                name: "Aling Nena's Store",             custIdx: 6 },
    { email: "purchasing@csisupermarket.ph",       name: "CSI Infrastructure Builders Purchasing",     custIdx: 7 },
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

  // Each item is priced in its own trading unit: cement by the bag, rebar by the length,
  // aggregates by the cubic metre, and truck sizes by the load.
  await upsertOrder("SO-2026-0418", customers[0].id, mnl.id, "PENDING",   false, [{ sku: "CEM-PORT-40",  qty: 120, unitPrice: 265.00 }, { sku: "RSB-12-6M",  qty: 80, unitPrice: 265.00 }]);
  await upsertOrder("SO-2026-0417", customers[1].id, mnl.id, "APPROVED",  false, [{ sku: "CHB-6",        qty: 800, unitPrice: 26.00 },  { sku: "CEM-MASON-40", qty: 60, unitPrice: 240.00 }]);
  // Three mini-trucks of sand: one line of qty 3 drawing 7.5 m³ from the pile.
  await upsertOrder("SO-2026-0416", customers[2].id, ceb.id, "PREPARING", false, [{ sku: "MT-SAND",      qty: 3,   unitPrice: 3930.00 }]);
  await upsertOrder("SO-2026-0415", customers[3].id, mnl.id, "SHIPPED",   false, [{ sku: "PLY-MARINE-12", qty: 24, unitPrice: 890.00 }, { sku: "LUM-COCO-2X3", qty: 40, unitPrice: 165.00 }]);
  // Bulk aggregate bought by volume rather than by the truck.
  await upsertOrder("SO-2026-0413", customers[4].id, dvo.id, "DELIVERED", false, [{ sku: "AGG-CRUSH-34", qty: 12,  unitPrice: 1550.00 }]);
  await upsertOrder("SO-2026-0412", customers[7].id, mnl.id, "DELIVERED", false, [{ sku: "CEM-PORT-40",  qty: 200, unitPrice: 265.00 }]);

  // ── Accounting seed ───────────────────────────────────────────────────────
  // Journal entries
  const jeData = [
    // ── AR: base orders (case-priced) ──────────────────────────────────────
    { id: "JE-2026-05-0418", date: hoursAgo(1),   source: "AR" as JeSource, ref: "INV-2026-0418", memo: "Sale to Bautista Construction",                    lines: [{ code: "1100", dr: 19272.96, cr: 0 }, { code: "4000", dr: 0, cr: 17208.00 }, { code: "2100", dr: 0, cr: 2064.96 }] },
    { id: "JE-2026-05-0417", date: hoursAgo(3),   source: "AR" as JeSource, ref: "INV-2026-0417", memo: "Sale to Pangasinan Builders Supply",                   lines: [{ code: "1100", dr: 22444.80, cr: 0 }, { code: "4000", dr: 0, cr: 20040.00 }, { code: "2100", dr: 0, cr: 2404.80 }] },
    { id: "JE-2026-05-0416a", date: daysAgo(6),   source: "AR" as JeSource, ref: "INV-2026-0416", memo: "Sale to Sison Hardware",                     lines: [{ code: "1100", dr: 10967.04, cr: 0 }, { code: "4000", dr: 0, cr: 9792.00 },  { code: "2100", dr: 0, cr: 1175.04 }] },
    { id: "JE-2026-05-0416b", date: daysAgo(1),   source: "BANK" as JeSource, ref: "INV-2026-0416", memo: "Partial payment received — Sison Hardware", lines: [{ code: "1010", dr: 5000.00,  cr: 0 }, { code: "1100", dr: 0, cr: 5000.00 }] },
    { id: "JE-2026-05-0413a", date: daysAgo(9),   source: "AR" as JeSource, ref: "INV-2026-0413", memo: "Sale to Villaflor Aggregates Trading — delivered", lines: [{ code: "1100", dr: 40857.60, cr: 0 }, { code: "4000", dr: 0, cr: 36480.00 }, { code: "2100", dr: 0, cr: 4377.60 }, { code: "5000", dr: 25536.00, cr: 0 }, { code: "1220", dr: 0, cr: 25536.00 }] },
    { id: "JE-2026-05-0413b", date: daysAgo(2),   source: "BANK" as JeSource, ref: "INV-2026-0413", memo: "Payment received — Villaflor Aggregates Trading", lines: [{ code: "1010", dr: 40857.60, cr: 0 }, { code: "1100", dr: 0, cr: 40857.60 }] },
    { id: "JE-2026-05-0412", date: daysAgo(4),    source: "AR" as JeSource, ref: "INV-2026-0412", memo: "Sale to CSI Infrastructure Builders — delivered",           lines: [{ code: "1100", dr: 11289.60, cr: 0 }, { code: "4000", dr: 0, cr: 10080.00 }, { code: "2100", dr: 0, cr: 1209.60 }, { code: "5000", dr: 7056.00, cr: 0 }, { code: "1200", dr: 0, cr: 7056.00 }] },
    // ── AR: due-for-payment showcase ────────────────────────────────────────
    { id: "JE-2026-05-DUE01", date: daysAgo(28),  source: "AR" as JeSource, ref: "INV-DUE-01",   memo: "Sale to Reyes Engineering Works",                      lines: [{ code: "1100", dr: 15000.00, cr: 0 }, { code: "4000", dr: 0, cr: 13392.86 }, { code: "2100", dr: 0, cr: 1607.14 }] },
    { id: "JE-2026-05-DUE02", date: daysAgo(29),  source: "AR" as JeSource, ref: "INV-DUE-02",   memo: "Sale to Dela Cruz Homebuilders",             lines: [{ code: "1100", dr: 8500.00,  cr: 0 }, { code: "4000", dr: 0, cr: 7589.29 },  { code: "2100", dr: 0, cr: 910.71 }] },
    // ── AR: Bautista Construction's 2nd unpaid invoice ──────────────────────────
    { id: "JE-2026-05-PGU02", date: daysAgo(10),  source: "AR" as JeSource, ref: "INV-BCD-02",   memo: "Sale to Bautista Construction",                     lines: [{ code: "1100", dr: 22000.00, cr: 0 }, { code: "4000", dr: 0, cr: 19642.86 }, { code: "2100", dr: 0, cr: 2357.14 }] },
    // ── AR: CSI Infrastructure Builders's 2nd invoice — paid in the field, pending remittance ──
    { id: "JE-2026-05-CSI02", date: daysAgo(5),   source: "AR" as JeSource, ref: "INV-CSI-02",   memo: "Sale to CSI Infrastructure Builders",                       lines: [{ code: "1100", dr: 9450.00,  cr: 0 }, { code: "4000", dr: 0, cr: 8437.50 },  { code: "2100", dr: 0, cr: 1012.50 }] },
    // ── Unrelated to the order/case-pricing refresh — left as-is ────────────
    { id: "JE-2026-04-0416", date: hoursAgo(8),   source: "AP" as JeSource, ref: "PO-2026-0294",  memo: "PO receipt — Northern Cement Corporation",         lines: [{ code: "1500", dr: 750000, cr: 0 }, { code: "2110", dr: 90000, cr: 0 }, { code: "2000", dr: 0, cr: 825000 }, { code: "2150", dr: 0, cr: 15000 }] },
    { id: "JE-2026-04-0414", date: hoursAgo(26),  source: "INV" as JeSource, ref: "TR-0034",      memo: "Inter-warehouse transfer MNL→CEB",              lines: [{ code: "1210", dr: 73000, cr: 0 }, { code: "1200", dr: 0, cr: 73000 }] },
    { id: "JE-2026-04-0412", date: hoursAgo(38),  source: "PAYROLL" as JeSource, ref: "PAY-2026-04-30", memo: "Bi-monthly payroll · 60 employees",     lines: [{ code: "5100", dr: 1820000, cr: 0 }, { code: "1020", dr: 0, cr: 1488800 }, { code: "2160", dr: 0, cr: 196000 }, { code: "2200", dr: 0, cr: 78400 }, { code: "2210", dr: 0, cr: 32200 }, { code: "2220", dr: 0, cr: 24600 }] },
    { id: "JE-2026-04-0411", date: hoursAgo(48),  source: "AP" as JeSource, ref: "BILL-MERALCO-04", memo: "Meralco — April electricity",                lines: [{ code: "5300", dr: 187500, cr: 0 }, { code: "2110", dr: 22500, cr: 0 }, { code: "2000", dr: 0, cr: 210000 }] },
    { id: "JE-2026-04-0410", date: hoursAgo(56),  source: "AP" as JeSource, ref: "BILL-MAYNILAD-04", memo: "Maynilad water — April",                   lines: [{ code: "5300", dr: 38400, cr: 0 }, { code: "2110", dr: 4608, cr: 0 }, { code: "2000", dr: 0, cr: 43008 }] },
    { id: "JE-2026-04-0408", date: hoursAgo(96),  source: "AP" as JeSource, ref: "PO-2026-0297",  memo: "PO receipt — Pag-asa Steel Works",            lines: [{ code: "1210", dr: 171428, cr: 0 }, { code: "2110", dr: 20571, cr: 0 }, { code: "2000", dr: 0, cr: 192000 }] },
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
    // CSI Infrastructure Builders — 2 paid invoices ready for collection (collected in the field,
    // pending remittance to Finance — see Collection seeding below)
    { id: "INV-2026-0412", custCode: "C-2008", soId: "SO-2026-0412", issued: daysAgo(4),   due: daysFromNow(26), amount: 11289.60, paid: 11289.60, status: "PAID"    as InvoiceStatus },
    { id: "INV-CSI-02",    custCode: "C-2008", soId: null,           issued: daysAgo(5),   due: daysFromNow(25), amount: 9450.00,  paid: 9450.00,  status: "PAID"    as InvoiceStatus },
    // Due for payment
    { id: "INV-DUE-01",    custCode: "C-2004", soId: null,           issued: daysAgo(28),  due: daysFromNow(2),  amount: 15000.00, paid: 0,        status: "OPEN"    as InvoiceStatus },
    { id: "INV-DUE-02",    custCode: "C-2006", soId: null,           issued: daysAgo(29),  due: daysFromNow(1),  amount: 8500.00,  paid: 0,        status: "OPEN"    as InvoiceStatus },
    // Bautista Construction — 2 pending unpaid invoices (this one + INV-2026-0418 above)
    { id: "INV-BCD-02",    custCode: "C-2001", soId: null,           issued: daysAgo(10),  due: daysFromNow(20), amount: 22000.00, paid: 0,        status: "OPEN"    as InvoiceStatus },
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

  // Field collections — CSI Infrastructure Builders's 2 invoices above are fully paid by the
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
