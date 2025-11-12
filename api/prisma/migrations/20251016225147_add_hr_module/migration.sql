-- CreateEnum
CREATE TYPE "public"."EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "public"."EmploymentContractType" AS ENUM ('INDEFINITE', 'FIXED_TERM', 'SERVICE', 'APPRENTICESHIP');

-- CreateEnum
CREATE TYPE "public"."PayrollFrequency" AS ENUM ('MONTHLY', 'BIWEEKLY', 'WEEKLY', 'DAILY');

-- CreateEnum
CREATE TYPE "public"."PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'POSTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."PayrollComponentKind" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION', 'PROVISION');

-- CreateEnum
CREATE TYPE "public"."EmployeeAffiliationType" AS ENUM ('EPS', 'PENSION', 'ARL', 'CCF', 'COMPENSATION_FUND', 'UNION', 'OTHER');

-- CreateTable
CREATE TABLE "public"."EmployeeProfile" (
    "id" SERIAL NOT NULL,
    "thirdPartyId" INTEGER NOT NULL,
    "status" "public"."EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "jobTitle" TEXT,
    "department" TEXT,
    "hireDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "defaultCostCenterId" INTEGER,
    "payableAccountCode" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmploymentContract" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "code" TEXT,
    "contractType" "public"."EmploymentContractType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "salaryAmount" DECIMAL(14,2) NOT NULL,
    "salaryFrequency" "public"."PayrollFrequency" NOT NULL DEFAULT 'MONTHLY',
    "workingHours" TEXT,
    "probationEnd" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmploymentContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmployeeAffiliation" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "kind" "public"."EmployeeAffiliationType" NOT NULL,
    "thirdPartyId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAffiliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayrollRun" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "deductionsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employerContribAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "provisionsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "journalEntryId" INTEGER,
    "paymentEntryId" INTEGER,
    "description" TEXT,
    "metadata" JSONB,
    "createdById" INTEGER,
    "postedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayrollRunLine" (
    "id" SERIAL NOT NULL,
    "payrollRunId" INTEGER NOT NULL,
    "componentCode" TEXT NOT NULL,
    "componentName" TEXT,
    "kind" "public"."PayrollComponentKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "baseAmount" DECIMAL(14,2),
    "percentage" DECIMAL(8,4),
    "accountCode" TEXT NOT NULL,
    "thirdPartyId" INTEGER,
    "costCenterId" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "PayrollRunLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_thirdPartyId_key" ON "public"."EmployeeProfile"("thirdPartyId");

-- CreateIndex
CREATE INDEX "EmployeeProfile_status_idx" ON "public"."EmployeeProfile"("status");

-- CreateIndex
CREATE INDEX "EmployeeProfile_jobTitle_idx" ON "public"."EmployeeProfile"("jobTitle");

-- CreateIndex
CREATE INDEX "EmployeeProfile_department_idx" ON "public"."EmployeeProfile"("department");

-- CreateIndex
CREATE INDEX "EmployeeProfile_defaultCostCenterId_idx" ON "public"."EmployeeProfile"("defaultCostCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentContract_code_key" ON "public"."EmploymentContract"("code");

-- CreateIndex
CREATE INDEX "EmploymentContract_employeeId_idx" ON "public"."EmploymentContract"("employeeId");

-- CreateIndex
CREATE INDEX "EmploymentContract_contractType_idx" ON "public"."EmploymentContract"("contractType");

-- CreateIndex
CREATE INDEX "EmploymentContract_startDate_idx" ON "public"."EmploymentContract"("startDate");

-- CreateIndex
CREATE INDEX "EmploymentContract_endDate_idx" ON "public"."EmploymentContract"("endDate");

-- CreateIndex
CREATE INDEX "EmploymentContract_isActive_idx" ON "public"."EmploymentContract"("isActive");

-- CreateIndex
CREATE INDEX "EmployeeAffiliation_kind_idx" ON "public"."EmployeeAffiliation"("kind");

-- CreateIndex
CREATE INDEX "EmployeeAffiliation_startDate_idx" ON "public"."EmployeeAffiliation"("startDate");

-- CreateIndex
CREATE INDEX "EmployeeAffiliation_endDate_idx" ON "public"."EmployeeAffiliation"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAffiliation_employeeId_kind_thirdPartyId_key" ON "public"."EmployeeAffiliation"("employeeId", "kind", "thirdPartyId");

-- CreateIndex
CREATE INDEX "PayrollRun_employeeId_idx" ON "public"."PayrollRun"("employeeId");

-- CreateIndex
CREATE INDEX "PayrollRun_status_idx" ON "public"."PayrollRun"("status");

-- CreateIndex
CREATE INDEX "PayrollRun_periodStart_idx" ON "public"."PayrollRun"("periodStart");

-- CreateIndex
CREATE INDEX "PayrollRun_periodEnd_idx" ON "public"."PayrollRun"("periodEnd");

-- CreateIndex
CREATE INDEX "PayrollRun_journalEntryId_idx" ON "public"."PayrollRun"("journalEntryId");

-- CreateIndex
CREATE INDEX "PayrollRun_paymentEntryId_idx" ON "public"."PayrollRun"("paymentEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_employeeId_periodStart_periodEnd_key" ON "public"."PayrollRun"("employeeId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PayrollRunLine_payrollRunId_idx" ON "public"."PayrollRunLine"("payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollRunLine_kind_idx" ON "public"."PayrollRunLine"("kind");

-- CreateIndex
CREATE INDEX "PayrollRunLine_accountCode_idx" ON "public"."PayrollRunLine"("accountCode");

-- CreateIndex
CREATE INDEX "PayrollRunLine_thirdPartyId_idx" ON "public"."PayrollRunLine"("thirdPartyId");

-- CreateIndex
CREATE INDEX "PayrollRunLine_costCenterId_idx" ON "public"."PayrollRunLine"("costCenterId");

-- AddForeignKey
ALTER TABLE "public"."EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_defaultCostCenterId_fkey" FOREIGN KEY ("defaultCostCenterId") REFERENCES "public"."CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmploymentContract" ADD CONSTRAINT "EmploymentContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmployeeAffiliation" ADD CONSTRAINT "EmployeeAffiliation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmployeeAffiliation" ADD CONSTRAINT "EmployeeAffiliation_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollRun" ADD CONSTRAINT "PayrollRun_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollRun" ADD CONSTRAINT "PayrollRun_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "public"."JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollRun" ADD CONSTRAINT "PayrollRun_paymentEntryId_fkey" FOREIGN KEY ("paymentEntryId") REFERENCES "public"."JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollRunLine" ADD CONSTRAINT "PayrollRunLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "public"."PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollRunLine" ADD CONSTRAINT "PayrollRunLine_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayrollRunLine" ADD CONSTRAINT "PayrollRunLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "public"."CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
