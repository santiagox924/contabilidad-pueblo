-- CreateEnum
CREATE TYPE "public"."RoundingMode" AS ENUM ('HALF_UP', 'HALF_EVEN', 'TRUNC');

-- AlterTable
ALTER TABLE "public"."ThirdParty" ADD COLUMN     "defaultVatId" INTEGER,
ADD COLUMN     "taxProfile" "public"."TaxProfile" NOT NULL DEFAULT 'NA';

-- CreateTable
CREATE TABLE "public"."FiscalSettings" (
    "id" SERIAL NOT NULL,
    "roundingMode" "public"."RoundingMode" NOT NULL DEFAULT 'HALF_UP',
    "priceIncludesTax" BOOLEAN NOT NULL DEFAULT false,
    "defaultVat19Id" INTEGER,
    "defaultVat5Id" INTEGER,
    "defaultVat0Id" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiscalSettings_roundingMode_idx" ON "public"."FiscalSettings"("roundingMode");

-- CreateIndex
CREATE INDEX "FiscalSettings_priceIncludesTax_idx" ON "public"."FiscalSettings"("priceIncludesTax");

-- CreateIndex
CREATE INDEX "FiscalSettings_defaultVat19Id_idx" ON "public"."FiscalSettings"("defaultVat19Id");

-- CreateIndex
CREATE INDEX "FiscalSettings_defaultVat5Id_idx" ON "public"."FiscalSettings"("defaultVat5Id");

-- CreateIndex
CREATE INDEX "FiscalSettings_defaultVat0Id_idx" ON "public"."FiscalSettings"("defaultVat0Id");

-- CreateIndex
CREATE INDEX "ThirdParty_taxProfile_idx" ON "public"."ThirdParty"("taxProfile");

-- CreateIndex
CREATE INDEX "ThirdParty_defaultVatId_idx" ON "public"."ThirdParty"("defaultVatId");

-- AddForeignKey
ALTER TABLE "public"."ThirdParty" ADD CONSTRAINT "ThirdParty_defaultVatId_fkey" FOREIGN KEY ("defaultVatId") REFERENCES "public"."Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FiscalSettings" ADD CONSTRAINT "FiscalSettings_defaultVat19Id_fkey" FOREIGN KEY ("defaultVat19Id") REFERENCES "public"."Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FiscalSettings" ADD CONSTRAINT "FiscalSettings_defaultVat5Id_fkey" FOREIGN KEY ("defaultVat5Id") REFERENCES "public"."Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FiscalSettings" ADD CONSTRAINT "FiscalSettings_defaultVat0Id_fkey" FOREIGN KEY ("defaultVat0Id") REFERENCES "public"."Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;
