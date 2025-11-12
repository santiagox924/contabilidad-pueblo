-- AlterTable
ALTER TABLE "public"."FixedAssetLocation" ADD COLUMN     "parentId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."FixedAssetLocation" ADD CONSTRAINT "FixedAssetLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."FixedAssetLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
