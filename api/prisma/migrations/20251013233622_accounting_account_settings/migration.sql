-- CreateTable
CREATE TABLE "public"."AccountingAccountSetting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingAccountSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAccountSetting_key_key" ON "public"."AccountingAccountSetting"("key");

-- CreateIndex
CREATE INDEX "AccountingAccountSetting_accountCode_idx" ON "public"."AccountingAccountSetting"("accountCode");
