-- CreateEnum
CREATE TYPE "public"."DepreciationMethod" AS ENUM ('NONE', 'STRAIGHT_LINE', 'DECLINING_BALANCE');

-- CreateEnum
CREATE TYPE "public"."FixedAssetStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISPOSED');

-- CreateEnum
CREATE TYPE "public"."FixedAssetMovementType" AS ENUM ('ADDITION', 'IMPROVEMENT', 'TRANSFER', 'DEPRECIATION', 'DISPOSAL', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."DepreciationRunStatus" AS ENUM ('SCHEDULED', 'POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "public"."FixedAssetCategory" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "depreciationMethod" "public"."DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "usefulLifeMonths" INTEGER NOT NULL,
    "residualRate" DECIMAL(5,2),
    "assetAccountCode" TEXT NOT NULL,
    "accumulatedDepreciationAccountCode" TEXT NOT NULL,
    "depreciationExpenseAccountCode" TEXT NOT NULL,
    "disposalGainAccountCode" TEXT,
    "disposalLossAccountCode" TEXT,
    "impairmentAccountCode" TEXT,
    "defaultCostCenterId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FixedAssetLocation" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAssetLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FixedAssetPolicy" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "coverageSummary" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "premium" DECIMAL(18,2),
    "currencyCode" VARCHAR(3),
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAssetPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FixedAsset" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "policyId" INTEGER,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "acquisitionCost" DECIMAL(18,2) NOT NULL,
    "residualValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "accumulatedDepreciation" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bookValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationMethod" "public"."DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "decliningBalanceRate" DECIMAL(6,4),
    "status" "public"."FixedAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "depreciationStart" TIMESTAMP(3),
    "lastDepreciatedYear" INTEGER,
    "lastDepreciatedMonth" INTEGER,
    "costCenterId" INTEGER,
    "thirdPartyId" INTEGER,
    "location" TEXT,
    "serialNumber" TEXT,
    "policyNumber" TEXT,
    "supportUrl" TEXT,
    "description" TEXT,
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disposedAt" TIMESTAMP(3),

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FixedAssetDepreciationRun" (
    "id" SERIAL NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "status" "public"."DepreciationRunStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),
    "journalEntryId" INTEGER,
    "reversalJournalEntryId" INTEGER,
    "totalAssets" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "autoScheduled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAssetDepreciationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FixedAssetMovement" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "depreciationRunId" INTEGER,
    "type" "public"."FixedAssetMovementType" NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(18,2) NOT NULL,
    "bookValueAfter" DECIMAL(18,2),
    "accumulatedAfter" DECIMAL(18,2),
    "journalEntryId" INTEGER,
    "description" TEXT,
    "metadata" JSONB,
    "costCenterId" INTEGER,
    "thirdPartyId" INTEGER,
    "counterpartyAccountCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "FixedAssetMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixedAssetCategory_code_key" ON "public"."FixedAssetCategory"("code");

-- CreateIndex
CREATE INDEX "FixedAssetCategory_depreciationMethod_idx" ON "public"."FixedAssetCategory"("depreciationMethod");

-- CreateIndex
CREATE INDEX "FixedAssetCategory_assetAccountCode_idx" ON "public"."FixedAssetCategory"("assetAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAssetLocation_code_key" ON "public"."FixedAssetLocation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAssetPolicy_policyNumber_key" ON "public"."FixedAssetPolicy"("policyNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_code_key" ON "public"."FixedAsset"("code");

-- CreateIndex
CREATE INDEX "FixedAsset_categoryId_idx" ON "public"."FixedAsset"("categoryId");

-- CreateIndex
CREATE INDEX "FixedAsset_status_idx" ON "public"."FixedAsset"("status");

-- CreateIndex
CREATE INDEX "FixedAsset_costCenterId_idx" ON "public"."FixedAsset"("costCenterId");

-- CreateIndex
CREATE INDEX "FixedAsset_thirdPartyId_idx" ON "public"."FixedAsset"("thirdPartyId");

-- CreateIndex
CREATE INDEX "FixedAsset_locationId_idx" ON "public"."FixedAsset"("locationId");

-- CreateIndex
CREATE INDEX "FixedAsset_policyId_idx" ON "public"."FixedAsset"("policyId");

-- CreateIndex
CREATE INDEX "FixedAssetDepreciationRun_periodYear_periodMonth_idx" ON "public"."FixedAssetDepreciationRun"("periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAssetDepreciationRun_periodYear_periodMonth_key" ON "public"."FixedAssetDepreciationRun"("periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "FixedAssetMovement_assetId_idx" ON "public"."FixedAssetMovement"("assetId");

-- CreateIndex
CREATE INDEX "FixedAssetMovement_type_idx" ON "public"."FixedAssetMovement"("type");

-- CreateIndex
CREATE INDEX "FixedAssetMovement_movementDate_idx" ON "public"."FixedAssetMovement"("movementDate");

-- CreateIndex
CREATE INDEX "FixedAssetMovement_journalEntryId_idx" ON "public"."FixedAssetMovement"("journalEntryId");

-- AddForeignKey
ALTER TABLE "public"."FixedAssetCategory" ADD CONSTRAINT "FixedAssetCategory_defaultCostCenterId_fkey" FOREIGN KEY ("defaultCostCenterId") REFERENCES "public"."CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAsset" ADD CONSTRAINT "FixedAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."FixedAssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAsset" ADD CONSTRAINT "FixedAsset_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "public"."CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAsset" ADD CONSTRAINT "FixedAsset_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAsset" ADD CONSTRAINT "FixedAsset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."FixedAssetLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAsset" ADD CONSTRAINT "FixedAsset_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "public"."FixedAssetPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAssetDepreciationRun" ADD CONSTRAINT "FixedAssetDepreciationRun_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "public"."JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAssetDepreciationRun" ADD CONSTRAINT "FixedAssetDepreciationRun_reversalJournalEntryId_fkey" FOREIGN KEY ("reversalJournalEntryId") REFERENCES "public"."JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAssetMovement" ADD CONSTRAINT "FixedAssetMovement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAssetMovement" ADD CONSTRAINT "FixedAssetMovement_depreciationRunId_fkey" FOREIGN KEY ("depreciationRunId") REFERENCES "public"."FixedAssetDepreciationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAssetMovement" ADD CONSTRAINT "FixedAssetMovement_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "public"."JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAssetMovement" ADD CONSTRAINT "FixedAssetMovement_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "public"."CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FixedAssetMovement" ADD CONSTRAINT "FixedAssetMovement_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
