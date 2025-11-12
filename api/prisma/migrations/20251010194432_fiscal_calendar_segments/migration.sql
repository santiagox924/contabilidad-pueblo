/*
  Warnings:

  - The `status` column on the `AccountingPeriod` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[year,month,type]` on the table `AccountingPeriod` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[electronicDocumentId]` on the table `SalesInvoice` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."AccountingPeriodType" AS ENUM ('REGULAR', 'ADJUSTMENT', 'SPECIAL');

-- CreateEnum
CREATE TYPE "public"."AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "public"."FiscalObligationType" AS ENUM ('VAT', 'RETEFUENTE', 'RETEIVA', 'RETEICA', 'ELECTRONIC_INVOICE', 'ELECTRONIC_PAYROLL', 'EXOGENA');

-- CreateEnum
CREATE TYPE "public"."FiscalPeriodicity" AS ENUM ('MONTHLY', 'BIMONTHLY', 'ANNUAL', 'EVENT_BASED');

-- CreateEnum
CREATE TYPE "public"."FinancialStatementType" AS ENUM ('BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW');

-- CreateEnum
CREATE TYPE "public"."FinancialStatementVersion" AS ENUM ('OFFICIAL', 'DRAFT');

-- CreateEnum
CREATE TYPE "public"."ElectronicDocumentType" AS ENUM ('E_INVOICE', 'E_SUPPORT', 'E_PAYROLL', 'EXOGENA');

-- CreateEnum
CREATE TYPE "public"."ElectronicDocumentStatus" AS ENUM ('DRAFT', 'SIGNED', 'READY_FOR_DELIVERY', 'DELIVERED_INTERNAL', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."DianEnvironment" AS ENUM ('TEST', 'PRODUCTION');

-- DropIndex
DROP INDEX "public"."AccountingPeriod_year_month_key";

-- AlterTable
ALTER TABLE "public"."AccountingPeriod" ADD COLUMN     "allowBackPostUntil" TIMESTAMP(3),
ADD COLUMN     "label" VARCHAR(64),
ADD COLUMN     "lockReason" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" INTEGER,
ADD COLUMN     "requiredRole" VARCHAR(64),
ADD COLUMN     "type" "public"."AccountingPeriodType" NOT NULL DEFAULT 'REGULAR',
DROP COLUMN "status",
ADD COLUMN     "status" "public"."AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "public"."CoaAccount" ADD COLUMN     "defaultCurrency" VARCHAR(3);

-- AlterTable
ALTER TABLE "public"."FiscalSettings" ADD COLUMN     "autoDeliverElectronicDocs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dianEnvironment" "public"."DianEnvironment" NOT NULL DEFAULT 'TEST',
ADD COLUMN     "dianSoftwareId" VARCHAR(64),
ADD COLUMN     "dianSoftwarePin" VARCHAR(64),
ADD COLUMN     "dianTestSetId" VARCHAR(64);

-- AlterTable
ALTER TABLE "public"."SalesInvoice" ADD COLUMN     "electronicDocumentId" INTEGER;

-- CreateTable
CREATE TABLE "public"."DeferredTaxProvision" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "description" TEXT,
    "debitAccountCode" TEXT NOT NULL,
    "creditAccountCode" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeferredTaxProvision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinancialStatementSnapshot" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "statement" "public"."FinancialStatementType" NOT NULL,
    "version" "public"."FinancialStatementVersion" NOT NULL DEFAULT 'OFFICIAL',
    "label" VARCHAR(64),
    "accountCode" TEXT NOT NULL,
    "balance" DECIMAL(16,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialStatementSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WithholdingSegment" (
    "id" SERIAL NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "municipalityCode" TEXT,
    "departmentCode" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "minBase" DECIMAL(14,2),
    "maxBase" DECIMAL(14,2),
    "ratePct" DECIMAL(6,4),
    "fixedAmount" DECIMAL(14,2),

    CONSTRAINT "WithholdingSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FiscalCalendar" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "obligation" "public"."FiscalObligationType" NOT NULL,
    "periodicity" "public"."FiscalPeriodicity" NOT NULL,
    "regime" "public"."FiscalRegime" DEFAULT 'NO_RESPONSABLE_IVA',
    "municipalityCode" TEXT,
    "departmentCode" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "FiscalCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FiscalCalendarEvent" (
    "id" SERIAL NOT NULL,
    "calendarId" INTEGER NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "cutoffDate" TIMESTAMP(3),
    "dianForm" TEXT,
    "channel" TEXT,

    CONSTRAINT "FiscalCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ElectronicDocument" (
    "id" SERIAL NOT NULL,
    "type" "public"."ElectronicDocumentType" NOT NULL,
    "status" "public"."ElectronicDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "environment" "public"."DianEnvironment" NOT NULL DEFAULT 'TEST',
    "fiscalSettingsId" INTEGER,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "shouldDeliver" BOOLEAN NOT NULL DEFAULT false,
    "cufe" TEXT,
    "dianTrackId" TEXT,
    "deliveryReference" TEXT,
    "signedXmlPath" TEXT,
    "zipPath" TEXT,
    "responseXmlPath" TEXT,
    "rejectionReason" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectronicDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeferredTaxProvision_year_idx" ON "public"."DeferredTaxProvision"("year");

-- CreateIndex
CREATE INDEX "DeferredTaxProvision_active_idx" ON "public"."DeferredTaxProvision"("active");

-- CreateIndex
CREATE INDEX "FinancialStatementSnapshot_statement_idx" ON "public"."FinancialStatementSnapshot"("statement");

-- CreateIndex
CREATE INDEX "FinancialStatementSnapshot_version_idx" ON "public"."FinancialStatementSnapshot"("version");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatementSnapshot_year_statement_version_accountCo_key" ON "public"."FinancialStatementSnapshot"("year", "statement", "version", "accountCode");

-- CreateIndex
CREATE INDEX "WithholdingSegment_ruleId_idx" ON "public"."WithholdingSegment"("ruleId");

-- CreateIndex
CREATE INDEX "WithholdingSegment_municipalityCode_idx" ON "public"."WithholdingSegment"("municipalityCode");

-- CreateIndex
CREATE INDEX "WithholdingSegment_departmentCode_idx" ON "public"."WithholdingSegment"("departmentCode");

-- CreateIndex
CREATE INDEX "WithholdingSegment_validFrom_idx" ON "public"."WithholdingSegment"("validFrom");

-- CreateIndex
CREATE INDEX "WithholdingSegment_validTo_idx" ON "public"."WithholdingSegment"("validTo");

-- CreateIndex
CREATE INDEX "FiscalCalendar_year_idx" ON "public"."FiscalCalendar"("year");

-- CreateIndex
CREATE INDEX "FiscalCalendar_obligation_idx" ON "public"."FiscalCalendar"("obligation");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalCalendar_year_obligation_regime_municipalityCode_depa_key" ON "public"."FiscalCalendar"("year", "obligation", "regime", "municipalityCode", "departmentCode");

-- CreateIndex
CREATE INDEX "FiscalCalendarEvent_calendarId_idx" ON "public"."FiscalCalendarEvent"("calendarId");

-- CreateIndex
CREATE INDEX "FiscalCalendarEvent_dueDate_idx" ON "public"."FiscalCalendarEvent"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ElectronicDocument_cufe_key" ON "public"."ElectronicDocument"("cufe");

-- CreateIndex
CREATE INDEX "ElectronicDocument_status_idx" ON "public"."ElectronicDocument"("status");

-- CreateIndex
CREATE INDEX "ElectronicDocument_type_idx" ON "public"."ElectronicDocument"("type");

-- CreateIndex
CREATE INDEX "ElectronicDocument_environment_idx" ON "public"."ElectronicDocument"("environment");

-- CreateIndex
CREATE UNIQUE INDEX "ElectronicDocument_sourceType_sourceId_key" ON "public"."ElectronicDocument"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "AccountingPeriod_status_idx" ON "public"."AccountingPeriod"("status");

-- CreateIndex
CREATE INDEX "AccountingPeriod_type_idx" ON "public"."AccountingPeriod"("type");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_year_month_type_key" ON "public"."AccountingPeriod"("year", "month", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_electronicDocumentId_key" ON "public"."SalesInvoice"("electronicDocumentId");

-- CreateIndex
CREATE INDEX "SalesInvoice_electronicDocumentId_idx" ON "public"."SalesInvoice"("electronicDocumentId");

-- AddForeignKey
ALTER TABLE "public"."SalesInvoice" ADD CONSTRAINT "SalesInvoice_electronicDocumentId_fkey" FOREIGN KEY ("electronicDocumentId") REFERENCES "public"."ElectronicDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WithholdingSegment" ADD CONSTRAINT "WithholdingSegment_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."WithholdingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FiscalCalendarEvent" ADD CONSTRAINT "FiscalCalendarEvent_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "public"."FiscalCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ElectronicDocument" ADD CONSTRAINT "ElectronicDocument_fiscalSettingsId_fkey" FOREIGN KEY ("fiscalSettingsId") REFERENCES "public"."FiscalSettings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
