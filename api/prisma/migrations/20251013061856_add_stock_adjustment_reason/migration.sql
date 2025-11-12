-- CreateEnum
CREATE TYPE "public"."StockAdjustmentReason" AS ENUM ('ACCOUNTING', 'DONATION', 'PRODUCTION', 'CUSTOMER_RETURN');

-- AlterTable
ALTER TABLE "public"."StockMove" ADD COLUMN     "adjustmentReason" "public"."StockAdjustmentReason" NOT NULL DEFAULT 'ACCOUNTING';
