-- AlterTable
ALTER TABLE "ThirdParty"
ADD COLUMN "roles" "PartyType"[] NOT NULL DEFAULT ARRAY[]::"PartyType"[];

-- Backfill existing rows so they keep their current primary role
UPDATE "ThirdParty"
SET "roles" =
  CASE
    WHEN array_length("roles", 1) IS NULL OR array_length("roles", 1) = 0 THEN ARRAY["type"]
    ELSE "roles"
  END;
