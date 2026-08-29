-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderState" ADD VALUE 'AWAITING_PAYMENT';
ALTER TYPE "OrderState" ADD VALUE 'PAID';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CASHIER';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "codRelease" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "codReleaseReason" TEXT,
ADD COLUMN     "codReleasedAt" TIMESTAMP(3),
ADD COLUMN     "codReleasedById" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_codReleasedById_fkey" FOREIGN KEY ("codReleasedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
