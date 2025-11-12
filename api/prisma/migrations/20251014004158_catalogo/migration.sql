/*
  Warnings:

  - The primary key for the `Municipality` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "public"."Municipality" DROP CONSTRAINT "Municipality_pkey",
ALTER COLUMN "code" SET DATA TYPE TEXT,
ALTER COLUMN "departmentCode" SET DATA TYPE TEXT,
ALTER COLUMN "departmentName" SET DATA TYPE TEXT,
ALTER COLUMN "name" SET DATA TYPE TEXT,
ALTER COLUMN "type" SET DATA TYPE TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT,
ADD CONSTRAINT "Municipality_pkey" PRIMARY KEY ("code");
