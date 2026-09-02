#!/bin/bash
set -euo pipefail
cd /opt/disucar

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="/home/ubuntu/disucar-backup-preorders-${STAMP}.sql"
echo "=== Backup -> ${BACKUP} ==="
sudo docker exec disucar-db pg_dump -U postgres disucar > "$BACKUP"
ls -lh "$BACKUP"

echo
echo "=== Deleting old orders/invoices/collections/AR journal entries ==="
sudo docker exec -i disucar-db psql -U postgres -d disucar -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- Collections reference invoices we're about to delete.
DELETE FROM collections;

-- Invoice.soId references Order without a cascade rule, so invoices must go
-- before orders or the delete below fails on a foreign key violation.
DELETE FROM invoices;

-- Quotation.orderId is optional -- clear it rather than deleting the quotation,
-- which is an independent document that can outlive the order it produced.
UPDATE quotations SET "orderId" = NULL WHERE "orderId" IS NOT NULL;

-- ReturnRequest.orderId and Shipment.orderId are required, non-cascading FKs --
-- any row referencing an order being deleted must go too. ReturnLine cascades
-- from ReturnRequest.
DELETE FROM return_requests;
DELETE FROM shipments;

-- Orders: OrderLine/OrderEvent/OrderLineLot all cascade from Order.
DELETE FROM orders;

-- Old AR-sourced journal entries tied to the per-piece pricing being replaced.
-- AP/PAYROLL/GL/inter-warehouse-transfer entries are untouched.
DELETE FROM journal_entries WHERE id IN (
  'JE-2026-04-0418','JE-2026-04-0417','JE-2026-04-0415',
  'JE-2026-04-0413','JE-2026-04-0409','JE-2026-04-0406'
);

COMMIT;
SQL

echo
echo "=== Re-seeding orders/invoices/collections at case pricing ==="
sudo docker compose run --rm --no-deps migrate npx tsx prisma/seed.ts
