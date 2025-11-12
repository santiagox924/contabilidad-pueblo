-- AlterTable
ALTER TABLE "ThirdParty"
  ADD COLUMN "clientReceivableAccountCode" TEXT,
  ADD COLUMN "providerPayableAccountCode" TEXT,
  ADD COLUMN "employeePayableAccountCode" TEXT,
  ADD COLUMN "otherReceivableAccountCode" TEXT,
  ADD COLUMN "otherPayableAccountCode" TEXT;

-- Backfill per-role account codes based on existing data
UPDATE "ThirdParty"
SET
  "clientReceivableAccountCode" = CASE
    WHEN COALESCE("roles", ARRAY[]::"PartyType"[]) @> ARRAY['CLIENT']::"PartyType"[] OR "type" = 'CLIENT'
      THEN "receivableAccountCode"
    ELSE NULL
  END,
  "providerPayableAccountCode" = CASE
    WHEN COALESCE("roles", ARRAY[]::"PartyType"[]) @> ARRAY['PROVIDER']::"PartyType"[] OR "type" = 'PROVIDER'
      THEN "payableAccountCode"
    ELSE NULL
  END,
  "employeePayableAccountCode" = CASE
    WHEN COALESCE("roles", ARRAY[]::"PartyType"[]) @> ARRAY['EMPLOYEE']::"PartyType"[] OR "type" = 'EMPLOYEE'
      THEN "payableAccountCode"
    ELSE NULL
  END,
  "otherReceivableAccountCode" = CASE
    WHEN COALESCE("roles", ARRAY[]::"PartyType"[]) @> ARRAY['OTHER']::"PartyType"[] OR "type" = 'OTHER'
      THEN "receivableAccountCode"
    ELSE NULL
  END,
  "otherPayableAccountCode" = CASE
    WHEN COALESCE("roles", ARRAY[]::"PartyType"[]) @> ARRAY['OTHER']::"PartyType"[] OR "type" = 'OTHER'
      THEN "payableAccountCode"
    ELSE NULL
  END;
