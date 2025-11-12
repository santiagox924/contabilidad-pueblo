-- AlterTable
ALTER TABLE "public"."CostCenter" ADD COLUMN     "isReportable" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "CostCenter_isReportable_idx" ON "public"."CostCenter"("isReportable");
