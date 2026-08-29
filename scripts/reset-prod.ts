/**
 * reset-prod.ts
 *
 * Purges all business data from the database, leaving only:
 *   - User accounts (login credentials)
 *   - Warehouses
 *   - OrgSettings
 *
 * Run with:   npx tsx scripts/reset-prod.ts
 * npm alias:  npm run db:reset-prod
 *
 * ⚠  THIS IS IRREVERSIBLE. Back up the database first.
 */

import { PrismaClient } from "@prisma/client";
import * as readline from "readline";

const prisma = new PrismaClient();

// ── helpers ───────────────────────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

function fmt(n: number): string {
  return n.toLocaleString();
}

// ── count business records to show user what will be deleted ──────────────────

async function getCounts() {
  const [
    auditLogs, attachments,
    returnLines, returnRequests,
    quotationLines, quotations,
    birFilings,
    journalLines, journalEntries,
    bills, invoices,
    inboundPOLines, inboundPOs,
    transferLines, transfers,
    orderEvents, shipments, orderLines, orders,
    lots,
    stockMoves, stocks,
    catalogItems,
    suppliers,
    customers,
  ] = await Promise.all([
    prisma.auditLog.count(),
    prisma.attachment.count(),
    prisma.returnLine.count(),
    prisma.returnRequest.count(),
    prisma.quotationLine.count(),
    prisma.quotation.count(),
    prisma.birFiling.count(),
    prisma.journalLine.count(),
    prisma.journalEntry.count(),
    prisma.bill.count(),
    prisma.invoice.count(),
    prisma.inboundPOLine.count(),
    prisma.inboundPO.count(),
    prisma.transferLine.count(),
    prisma.transfer.count(),
    prisma.orderEvent.count(),
    prisma.shipment.count(),
    prisma.orderLine.count(),
    prisma.order.count(),
    prisma.lot.count(),
    prisma.stockMove.count(),
    prisma.stock.count(),
    prisma.catalogItem.count(),
    prisma.supplier.count(),
    prisma.customer.count(),
  ]);

  return {
    auditLogs, attachments,
    returnLines, returnRequests,
    quotationLines, quotations,
    birFilings,
    journalLines, journalEntries,
    bills, invoices,
    inboundPOLines, inboundPOs,
    transferLines, transfers,
    orderEvents, shipments, orderLines, orders,
    lots,
    stockMoves, stocks,
    catalogItems,
    suppliers,
    customers,
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║        PRODUCTION DATA RESET SCRIPT         ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  console.log("Counting records to be deleted…\n");
  const counts = await getCounts();

  const total =
    counts.auditLogs + counts.attachments +
    counts.returnLines + counts.returnRequests +
    counts.quotationLines + counts.quotations +
    counts.birFilings +
    counts.journalLines + counts.journalEntries +
    counts.bills + counts.invoices +
    counts.inboundPOLines + counts.inboundPOs +
    counts.transferLines + counts.transfers +
    counts.orderEvents + counts.shipments + counts.orderLines + counts.orders +
    counts.lots +
    counts.stockMoves + counts.stocks +
    counts.catalogItems +
    counts.suppliers +
    counts.customers;

  console.log("Records scheduled for deletion:");
  console.log(`  Customers          : ${fmt(counts.customers)}`);
  console.log(`  Suppliers          : ${fmt(counts.suppliers)}`);
  console.log(`  Catalog items      : ${fmt(counts.catalogItems)}`);
  console.log(`  Orders             : ${fmt(counts.orders)}`);
  console.log(`  Order lines        : ${fmt(counts.orderLines)}`);
  console.log(`  Order events       : ${fmt(counts.orderEvents)}`);
  console.log(`  Shipments          : ${fmt(counts.shipments)}`);
  console.log(`  Quotations         : ${fmt(counts.quotations)}`);
  console.log(`  Quotation lines    : ${fmt(counts.quotationLines)}`);
  console.log(`  Return requests    : ${fmt(counts.returnRequests)}`);
  console.log(`  Return lines       : ${fmt(counts.returnLines)}`);
  console.log(`  Inbound POs        : ${fmt(counts.inboundPOs)}`);
  console.log(`  Inbound PO lines   : ${fmt(counts.inboundPOLines)}`);
  console.log(`  Transfers          : ${fmt(counts.transfers)}`);
  console.log(`  Transfer lines     : ${fmt(counts.transferLines)}`);
  console.log(`  Stock records      : ${fmt(counts.stocks)}`);
  console.log(`  Stock moves        : ${fmt(counts.stockMoves)}`);
  console.log(`  Lots / Batches     : ${fmt(counts.lots)}`);
  console.log(`  Invoices           : ${fmt(counts.invoices)}`);
  console.log(`  Bills              : ${fmt(counts.bills)}`);
  console.log(`  Journal entries    : ${fmt(counts.journalEntries)}`);
  console.log(`  Journal lines      : ${fmt(counts.journalLines)}`);
  console.log(`  BIR filings        : ${fmt(counts.birFilings)}`);
  console.log(`  Attachments        : ${fmt(counts.attachments)}`);
  console.log(`  Audit logs         : ${fmt(counts.auditLogs)}`);
  console.log(`\n  TOTAL              : ${fmt(total)} records\n`);

  console.log("Records that will be KEPT:");
  const userCount = await prisma.user.count();
  const warehouseCount = await prisma.warehouse.count();
  console.log(`  Users              : ${fmt(userCount)}`);
  console.log(`  Warehouses         : ${fmt(warehouseCount)}`);
  console.log(`  OrgSettings        : (preserved)\n`);

  if (total === 0) {
    console.log("✓ Nothing to delete — database is already clean.\n");
    return;
  }

  console.log("⚠  WARNING: This action is IRREVERSIBLE.");
  console.log("   Back up your database before proceeding.\n");

  const answer = await prompt('Type "CONFIRM" to proceed, or anything else to abort: ');
  if (answer !== "CONFIRM") {
    console.log("\n✗ Aborted — no data was deleted.\n");
    return;
  }

  console.log("\nDeleting records…");

  // Step 1: Null out User.customerId to satisfy FK before deleting customers
  await prisma.user.updateMany({ where: { customerId: { not: null } }, data: { customerId: null } });
  console.log("  ✓ Cleared User.customerId references");

  // Step 2: Audit logs & attachments (leaf nodes, no downstream deps)
  await prisma.auditLog.deleteMany({});
  await prisma.attachment.deleteMany({});
  console.log("  ✓ Audit logs & attachments");

  // Step 4: Return lines → return requests
  await prisma.returnLine.deleteMany({});
  await prisma.returnRequest.deleteMany({});
  console.log("  ✓ Return requests");

  // Step 5: Quotation lines → quotations
  await prisma.quotationLine.deleteMany({});
  await prisma.quotation.deleteMany({});
  console.log("  ✓ Quotations");

  // Step 6: BIR filings
  await prisma.birFiling.deleteMany({});
  console.log("  ✓ BIR filings");

  // Step 7: Journal lines → journal entries
  await prisma.journalLine.deleteMany({});
  await prisma.journalEntry.deleteMany({});
  console.log("  ✓ Journal entries");

  // Step 8: Bills & invoices
  await prisma.bill.deleteMany({});
  await prisma.invoice.deleteMany({});
  console.log("  ✓ Bills & invoices");

  // Step 9: Inbound PO lines → inbound POs
  await prisma.inboundPOLine.deleteMany({});
  await prisma.inboundPO.deleteMany({});
  console.log("  ✓ Inbound purchase orders");

  // Step 10: Transfer lines → transfers
  await prisma.transferLine.deleteMany({});
  await prisma.transfer.deleteMany({});
  console.log("  ✓ Transfers");

  // Step 12: Order events, shipments, order lines → orders
  await prisma.orderEvent.deleteMany({});
  await prisma.shipment.deleteMany({});
  await prisma.orderLine.deleteMany({});
  await prisma.order.deleteMany({});
  console.log("  ✓ Orders");

  // Step 13: Lots
  await prisma.lot.deleteMany({});
  console.log("  ✓ Lots / batches");

  // Step 14: Stock moves → stock
  await prisma.stockMove.deleteMany({});
  await prisma.stock.deleteMany({});
  console.log("  ✓ Stock & stock moves");

  // Step 15: Catalog items
  await prisma.catalogItem.deleteMany({});
  console.log("  ✓ Catalog items");

  // Step 16: Suppliers & customers
  await prisma.supplier.deleteMany({});
  await prisma.customer.deleteMany({});
  console.log("  ✓ Suppliers & customers");

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║            RESET COMPLETE ✓                 ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\n  Deleted ${fmt(total)} records total.`);
  console.log(`  Kept ${fmt(userCount)} user(s), ${fmt(warehouseCount)} warehouse(s).\n`);
}

main()
  .catch(e => {
    console.error("\n✗ Reset failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
