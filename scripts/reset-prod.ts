/**
 * reset-prod.ts — purge demo data and hand over a clean production database.
 *
 * Keeps what the application needs in order to work at all:
 *   - Warehouses. Their CODES are load-bearing: src/lib/coa.ts maps MNL/CEB/DVO/URD
 *     to inventory GL accounts, so deleting them breaks every stock posting.
 *   - Categories and OrgSettings (branding, wholesale thresholds, expiry windows).
 *   - One administrator, so somebody can still log in afterwards.
 *
 * Deletes everything transactional, every customer and supplier, the whole catalog,
 * and — importantly — every demo login. Leaving accounts behind whose password is
 * "password123" is the single most dangerous thing about going live from a demo.
 *
 *   npm run db:reset-prod                       interactive
 *   RESET_CONFIRM=PURGE npm run db:reset-prod   non-interactive (deploy script)
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=...          the admin to keep or create
 *
 * IRREVERSIBLE. Take a dump first: ./deploy-aws.sh --backup
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import * as readline from "readline";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, a => { rl.close(); resolve(a.trim()); }));
}

const fmt = (n: number) => n.toLocaleString();

/**
 * Deletion order is foreign keys inward: children before parents.
 *
 * The previous version of this script omitted payments, collections, delivery runs,
 * lot allocations, backorders, quotas and cashier shifts — all of which were added
 * after it was written. Because Payment references Invoice, deleting invoices threw
 * a foreign-key violation and the purge failed outright. Every model in schema.prisma
 * is now accounted for here or in KEPT below.
 */
const PURGE: { label: string; run: () => Promise<unknown> }[] = [
  { label: "Audit logs & attachments",   run: async () => {
      await prisma.auditLog.deleteMany({});
      await prisma.attachment.deleteMany({});
  }},
  { label: "Cashier shifts & payments",  run: async () => {
      // Payment → Invoice/Bill/CashierShift, so it must go before all three.
      await prisma.payment.deleteMany({});
      await prisma.cashierShift.deleteMany({});
  }},
  { label: "Field collections",          run: () => prisma.collection.deleteMany({}) },
  { label: "Returns",                    run: async () => {
      await prisma.returnLine.deleteMany({});
      await prisma.returnRequest.deleteMany({});
  }},
  { label: "Quotations",                 run: async () => {
      await prisma.quotationLine.deleteMany({});
      await prisma.quotation.deleteMany({});
  }},
  { label: "BIR filings",                run: () => prisma.birFiling.deleteMany({}) },
  { label: "Journal entries",            run: async () => {
      await prisma.journalLine.deleteMany({});
      await prisma.journalEntry.deleteMany({});
  }},
  { label: "Bills & invoices",           run: async () => {
      await prisma.bill.deleteMany({});
      await prisma.invoice.deleteMany({});
  }},
  { label: "Delivery runs & vehicles",   run: async () => {
      await prisma.deliveryRunStop.deleteMany({});
      await prisma.deliveryRun.deleteMany({});
      await prisma.vehiclePosition.deleteMany({});
      await prisma.vehicle.deleteMany({});
  }},
  { label: "Purchase orders & backorders", run: async () => {
      await prisma.backorderReturn.deleteMany({});
      await prisma.inboundPOLine.deleteMany({});
      await prisma.inboundPO.deleteMany({});
  }},
  { label: "Transfers",                  run: async () => {
      await prisma.transferLine.deleteMany({});
      await prisma.transfer.deleteMany({});
  }},
  { label: "Orders",                     run: async () => {
      // Lot allocations and plans hang off order lines and must precede them.
      await prisma.orderLineLot.deleteMany({});
      await prisma.orderLinePlannedLot.deleteMany({});
      await prisma.orderEvent.deleteMany({});
      await prisma.shipment.deleteMany({});
      await prisma.orderLine.deleteMany({});
      await prisma.order.deleteMany({});
  }},
  { label: "Cost layers (lots)",         run: () => prisma.lot.deleteMany({}) },
  { label: "Stock & stock moves",        run: async () => {
      await prisma.stockMove.deleteMany({});
      await prisma.stock.deleteMany({});
  }},
  { label: "Catalog",                    run: () => prisma.catalogItem.deleteMany({}) },
  { label: "Customer quotas",            run: () => prisma.customerQuota.deleteMany({}) },
  { label: "Suppliers & customers",      run: async () => {
      await prisma.supplier.deleteMany({});
      await prisma.customer.deleteMany({});
  }},
  { label: "Reliever assignments",       run: () => prisma.relieverAssignment.deleteMany({}) },
];

async function countAll(): Promise<number> {
  const counts = await Promise.all([
    prisma.auditLog.count(), prisma.attachment.count(), prisma.payment.count(),
    prisma.cashierShift.count(), prisma.collection.count(), prisma.returnRequest.count(),
    prisma.quotation.count(), prisma.birFiling.count(), prisma.journalEntry.count(),
    prisma.bill.count(), prisma.invoice.count(), prisma.deliveryRun.count(),
    prisma.vehicle.count(), prisma.inboundPO.count(), prisma.transfer.count(),
    prisma.order.count(), prisma.lot.count(), prisma.stock.count(),
    prisma.catalogItem.count(), prisma.supplier.count(), prisma.customer.count(),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

async function main() {
  console.log("\n  Disucar ERP — production reset\n");

  const total = await countAll();
  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
  const warehouses = await prisma.warehouse.count();

  console.log(`  Business records to delete : ${fmt(total)}`);
  console.log(`  User accounts              : ${fmt(users.length)} (all removed except the admin below)`);
  console.log(`  Warehouses                 : ${fmt(warehouses)} (kept — their codes drive GL accounts)`);
  console.log(`  Categories / OrgSettings   : kept\n`);

  const adminEmail = process.env.ADMIN_EMAIL || "admin@disucarsales.ph";
  // Generated rather than defaulted: a known password on a live system is the problem
  // this reset exists to solve.
  const adminPassword = process.env.ADMIN_PASSWORD || randomBytes(9).toString("base64url");
  const generated = !process.env.ADMIN_PASSWORD;

  console.log(`  Administrator after reset  : ${adminEmail}`);
  console.log(`  Password                   : ${generated ? "generated, shown once below" : "as supplied"}\n`);

  console.log("  ⚠  IRREVERSIBLE. Take a backup first: ./deploy-aws.sh --backup\n");

  const answer = process.env.RESET_CONFIRM ?? await prompt('  Type "PURGE" to proceed: ');
  if (answer !== "PURGE") {
    console.log("\n  ✗ Aborted — nothing was deleted.\n");
    return;
  }

  console.log("\n  Deleting…");
  // User.customerId points at customers we are about to remove.
  await prisma.user.updateMany({ where: { customerId: { not: null } }, data: { customerId: null } });

  for (const stage of PURGE) {
    await stage.run();
    console.log(`    ✓ ${stage.label}`);
  }

  // The seed never created an OrgSettings row, so "kept" would have been vacuous:
  // branding and the wholesale thresholds would fall back to code defaults with
  // nothing for an admin to edit in Settings. Guarantee the row exists.
  await prisma.orgSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      name: "Disucar Sales Inc",
      tagline: "Construction Materials & Aggregates",
      address: "", phone: "", email: "", tin: "", website: "",
      color: "#003087", rdo: "", zip: "",
    },
  });
  console.log("    ✓ Organisation settings present");

  // Users last: everything referencing them has gone by now.
  const passwordHash = await hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN", active: true, passwordHash, customerId: null },
    create: { email: adminEmail, name: "Administrator", role: "ADMIN", passwordHash },
  });
  const removed = await prisma.user.deleteMany({ where: { email: { not: adminEmail } } });
  console.log(`    ✓ Demo logins removed (${fmt(removed.count)})`);

  console.log("\n  ══ Reset complete ══\n");
  console.log(`  Deleted ${fmt(total)} business records and ${fmt(removed.count)} accounts.`);
  console.log(`  Kept ${fmt(warehouses)} warehouse(s), categories and org settings.\n`);
  console.log(`  Sign in as : ${adminEmail}`);
  if (generated) {
    console.log(`  Password   : ${adminPassword}`);
    console.log(`  ${"—".repeat(60)}`);
    console.log("  Store this now. It is not written anywhere and cannot be shown again.");
    console.log("  Change it after first login.\n");
  }
}

main()
  .catch(e => { console.error("\n  ✗ Reset failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
