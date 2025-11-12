-- AlterTable
ALTER TABLE "public"."PurchaseInvoiceLine" ADD COLUMN     "uom" "public"."Unit" DEFAULT 'UN';

-- AlterTable
ALTER TABLE "public"."SalesInvoiceLine" ADD COLUMN     "uom" "public"."Unit" DEFAULT 'UN';
