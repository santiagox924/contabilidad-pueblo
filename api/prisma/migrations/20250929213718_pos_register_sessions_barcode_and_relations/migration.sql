/*
  Warnings:

  - A unique constraint covering the columns `[barcode]` on the table `Item` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."CashMovementKind" AS ENUM ('SALE_RECEIPT', 'REFUND', 'CASH_IN', 'CASH_OUT');

-- AlterTable
ALTER TABLE "public"."Item" ADD COLUMN     "barcode" TEXT;

-- CreateTable
CREATE TABLE "public"."CashRegister" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CashSession" (
    "id" SERIAL NOT NULL,
    "registerId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expectedClose" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "countedClose" DECIMAL(14,2),
    "status" "public"."CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CashMovement" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "kind" "public"."CashMovementKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refType" TEXT,
    "refId" INTEGER,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CashCount" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "denom" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_name_key" ON "public"."CashRegister"("name");

-- CreateIndex
CREATE INDEX "CashSession_registerId_status_openedAt_idx" ON "public"."CashSession"("registerId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "CashSession_userId_idx" ON "public"."CashSession"("userId");

-- CreateIndex
CREATE INDEX "CashMovement_sessionId_kind_createdAt_idx" ON "public"."CashMovement"("sessionId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "CashCount_sessionId_idx" ON "public"."CashCount"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_barcode_key" ON "public"."Item"("barcode");

-- AddForeignKey
ALTER TABLE "public"."CashSession" ADD CONSTRAINT "CashSession_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "public"."CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashSession" ADD CONSTRAINT "CashSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashMovement" ADD CONSTRAINT "CashMovement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashCount" ADD CONSTRAINT "CashCount_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
