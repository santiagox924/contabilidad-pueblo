-- CreateTable
CREATE TABLE "public"."BankStatement" (
    "id" SERIAL NOT NULL,
    "bank" TEXT NOT NULL,
    "accountNumber" TEXT,
    "currency" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalFileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'parsed',

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BankStatementLine" (
    "id" SERIAL NOT NULL,
    "statementId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance" DECIMAL(14,2),
    "externalId" TEXT,
    "matchScore" INTEGER,
    "matchedLineId" INTEGER,
    "notes" TEXT,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_fileHash_key" ON "public"."BankStatement"("fileHash");

-- CreateIndex
CREATE INDEX "BankStatement_bank_idx" ON "public"."BankStatement"("bank");

-- CreateIndex
CREATE INDEX "BankStatement_accountNumber_idx" ON "public"."BankStatement"("accountNumber");

-- CreateIndex
CREATE INDEX "BankStatement_uploadedAt_idx" ON "public"."BankStatement"("uploadedAt");

-- CreateIndex
CREATE INDEX "BankStatementLine_statementId_idx" ON "public"."BankStatementLine"("statementId");

-- CreateIndex
CREATE INDEX "BankStatementLine_date_idx" ON "public"."BankStatementLine"("date");

-- CreateIndex
CREATE INDEX "BankStatementLine_reference_idx" ON "public"."BankStatementLine"("reference");

-- CreateIndex
CREATE INDEX "BankStatementLine_amount_idx" ON "public"."BankStatementLine"("amount");

-- CreateIndex
CREATE INDEX "BankStatementLine_matchedLineId_idx" ON "public"."BankStatementLine"("matchedLineId");

-- AddForeignKey
ALTER TABLE "public"."BankStatementLine" ADD CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "public"."BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BankStatementLine" ADD CONSTRAINT "BankStatementLine_matchedLineId_fkey" FOREIGN KEY ("matchedLineId") REFERENCES "public"."JournalLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
