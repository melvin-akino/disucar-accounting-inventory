CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED', 'EXPIRED', 'REJECTED');

CREATE TABLE quotations (
  id TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "agentId" TEXT,
  "warehouseId" TEXT NOT NULL,
  status "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "validUntil" TIMESTAMP(3) NOT NULL,
  notes TEXT,
  subtotal DECIMAL(14,2) NOT NULL,
  vat DECIMAL(14,2) NOT NULL,
  cwt DECIMAL(14,2) NOT NULL DEFAULT 0,
  cwt2307 BOOLEAN NOT NULL DEFAULT false,
  total DECIMAL(14,2) NOT NULL,
  "orderId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quotations_customerId_fkey FOREIGN KEY ("customerId") REFERENCES customers(id),
  CONSTRAINT quotations_agentId_fkey FOREIGN KEY ("agentId") REFERENCES users(id),
  CONSTRAINT quotations_warehouseId_fkey FOREIGN KEY ("warehouseId") REFERENCES warehouses(id),
  CONSTRAINT quotations_orderId_fkey FOREIGN KEY ("orderId") REFERENCES orders(id)
);

CREATE TABLE quotation_lines (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "quotationId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  qty INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  CONSTRAINT quotation_lines_quotationId_fkey FOREIGN KEY ("quotationId") REFERENCES quotations(id) ON DELETE CASCADE,
  CONSTRAINT quotation_lines_skuId_fkey FOREIGN KEY ("skuId") REFERENCES catalog_items(id)
);
