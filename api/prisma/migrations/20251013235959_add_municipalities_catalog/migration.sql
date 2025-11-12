-- CreateTable
CREATE TABLE "Municipality" (
    "code" VARCHAR(5) NOT NULL,
    "departmentCode" VARCHAR(2) NOT NULL,
    "departmentName" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "Municipality_departmentCode_idx" ON "Municipality"("departmentCode");
CREATE INDEX "Municipality_departmentName_idx" ON "Municipality"("departmentName");
CREATE INDEX "Municipality_name_idx" ON "Municipality"("name");
