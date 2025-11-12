-- AlterTable
ALTER TABLE "public"."Item" ADD COLUMN     "purchaseTaxAccountCode" TEXT;

-- CreateIndex
CREATE INDEX "Item_purchaseTaxAccountCode_idx" ON "public"."Item"("purchaseTaxAccountCode");
