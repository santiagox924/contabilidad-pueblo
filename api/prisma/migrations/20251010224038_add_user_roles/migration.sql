-- CreateEnum
CREATE TYPE "public"."UserRoleCode" AS ENUM ('SUPER_ADMIN', 'ADMINISTRATOR', 'ACCOUNTING_ADMIN', 'ACCOUNTANT', 'ACCOUNTING_ASSISTANT', 'AUDITOR', 'TREASURY', 'PURCHASING', 'SALES', 'INVENTORY', 'COST', 'HR', 'EXTERNAL_AUDITOR');

-- CreateTable
CREATE TABLE "public"."UserRole" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "public"."UserRoleCode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserRole_role_idx" ON "public"."UserRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "public"."UserRole"("userId", "role");

-- AddForeignKey
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
