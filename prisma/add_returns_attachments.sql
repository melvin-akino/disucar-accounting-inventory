CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'RECEIVED', 'CLOSED');
CREATE TYPE "Disposition" AS ENUM ('RESTOCK', 'SCRAP');

CREATE TABLE return_requests (
  id TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  reason TEXT NOT NULL,
  status "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  notes TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT return_requests_orderId_fkey FOREIGN KEY ("orderId") REFERENCES orders(id)
);

CREATE TABLE return_lines (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "returnId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  name TEXT NOT NULL,
  "qtyRequested" INTEGER NOT NULL,
  "qtyReceived" INTEGER NOT NULL DEFAULT 0,
  disposition "Disposition" NOT NULL DEFAULT 'RESTOCK',
  CONSTRAINT return_lines_returnId_fkey FOREIGN KEY ("returnId") REFERENCES return_requests(id) ON DELETE CASCADE,
  CONSTRAINT return_lines_skuId_fkey FOREIGN KEY ("skuId") REFERENCES catalog_items(id)
);

CREATE TABLE attachments (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  filename TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  url TEXT NOT NULL,
  "uploadedById" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attachments_uploadedById_fkey FOREIGN KEY ("uploadedById") REFERENCES users(id)
);

CREATE INDEX attachments_entity_idx ON attachments ("entityType", "entityId");
