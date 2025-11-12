-- CreateEnum
CREATE TYPE "public"."PartyType" AS ENUM ('CLIENT', 'PROVIDER', 'EMPLOYEE', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ItemType" AS ENUM ('PRODUCT', 'SERVICE', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "public"."StockMoveType" AS ENUM ('PURCHASE', 'SALE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "public"."PaymentType" AS ENUM ('CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "public"."InvoiceStatus" AS ENUM ('ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "public"."PurchaseStatus" AS ENUM ('ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "public"."InstallmentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."InstallmentFrequency" AS ENUM ('MONTHLY', 'BIWEEKLY');

-- CreateEnum
CREATE TYPE "public"."UnitKind" AS ENUM ('COUNT', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA');

-- CreateEnum
CREATE TYPE "public"."Unit" AS ENUM ('UN', 'DZ', 'PKG', 'BOX', 'PR', 'ROLL', 'MG', 'G', 'KG', 'LB', 'ML', 'L', 'M3', 'CM3', 'OZ_FL', 'GAL', 'MM', 'CM', 'M', 'KM', 'IN', 'FT', 'YD', 'CM2', 'M2', 'IN2', 'FT2', 'YD2');

-- CreateEnum
CREATE TYPE "public"."PersonKind" AS ENUM ('NATURAL', 'JURIDICAL');

-- CreateEnum
CREATE TYPE "public"."IdType" AS ENUM ('NIT', 'CC', 'PASSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."AccountClass" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "public"."FlowType" AS ENUM ('NONE', 'AR', 'AP');

-- CreateEnum
CREATE TYPE "public"."TaxProfile" AS ENUM ('NA', 'IVA_RESPONSABLE', 'EXENTO', 'EXCLUIDO');

-- CreateEnum
CREATE TYPE "public"."FiscalRegime" AS ENUM ('NO_RESPONSABLE_IVA', 'RESPONSABLE_IVA', 'SIMPLE', 'ESPECIAL');

-- CreateEnum
CREATE TYPE "public"."TaxKind" AS ENUM ('VAT', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."WithholdingType" AS ENUM ('RTF', 'RIVA', 'RICA');

-- CreateEnum
CREATE TYPE "public"."RuleScope" AS ENUM ('SALES', 'PURCHASES', 'BOTH');

-- CreateTable
CREATE TABLE "public"."CoaAccount" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "class" "public"."AccountClass" NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "reconcilable" BOOLEAN NOT NULL DEFAULT false,
    "isBank" BOOLEAN NOT NULL DEFAULT false,
    "isCash" BOOLEAN NOT NULL DEFAULT false,
    "isDetailed" BOOLEAN NOT NULL DEFAULT true,
    "parentCode" TEXT,
    "requiresThirdParty" BOOLEAN NOT NULL DEFAULT false,
    "requiresCostCenter" BOOLEAN NOT NULL DEFAULT false,
    "flowType" "public"."FlowType" NOT NULL DEFAULT 'NONE',
    "taxProfile" "public"."TaxProfile" NOT NULL DEFAULT 'NA',
    "vatRate" DECIMAL(5,2),

    CONSTRAINT "CoaAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CostCenter" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ThirdParty" (
    "id" SERIAL NOT NULL,
    "type" "public"."PartyType" NOT NULL,
    "personKind" "public"."PersonKind" NOT NULL DEFAULT 'NATURAL',
    "idType" "public"."IdType" NOT NULL DEFAULT 'CC',
    "legalRepName" TEXT,
    "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "document" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "paymentTermsDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fiscalRegime" "public"."FiscalRegime" NOT NULL DEFAULT 'NO_RESPONSABLE_IVA',
    "isWithholdingAgent" BOOLEAN NOT NULL DEFAULT false,
    "ciiuCode" TEXT,
    "municipalityCode" TEXT,
    "receivableAccountCode" TEXT,
    "payableAccountCode" TEXT,

    CONSTRAINT "ThirdParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "incomeAccountCode" TEXT,
    "expenseAccountCode" TEXT,
    "inventoryAccountCode" TEXT,
    "taxAccountCode" TEXT,
    "taxProfile" "public"."TaxProfile" NOT NULL DEFAULT 'NA',
    "defaultTaxId" INTEGER,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Item" (
    "id" SERIAL NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."ItemType" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "unitKind" "public"."UnitKind" NOT NULL DEFAULT 'COUNT',
    "baseUnit" "public"."Unit" NOT NULL DEFAULT 'UN',
    "displayUnit" "public"."Unit" NOT NULL DEFAULT 'UN',
    "priceMin" DECIMAL(14,2),
    "priceMid" DECIMAL(14,2),
    "priceMax" DECIMAL(14,2),
    "price" DECIMAL(14,2),
    "ivaPct" INTEGER,
    "costAvg" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" INTEGER,
    "incomeAccountCode" TEXT,
    "expenseAccountCode" TEXT,
    "inventoryAccountCode" TEXT,
    "taxAccountCode" TEXT,
    "taxProfile" "public"."TaxProfile" NOT NULL DEFAULT 'NA',
    "defaultTaxId" INTEGER,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Warehouse" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockMove" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "type" "public"."StockMoveType" NOT NULL,
    "qty" DECIMAL(20,6) NOT NULL,
    "uom" "public"."Unit" NOT NULL DEFAULT 'UN',
    "unitCost" DECIMAL(14,6) NOT NULL,
    "refType" TEXT,
    "refId" INTEGER,
    "note" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockLayer" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "remainingQty" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(14,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "lotCode" TEXT,
    "productionDate" TIMESTAMP(3),
    "moveInId" INTEGER,

    CONSTRAINT "StockLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockConsumption" (
    "id" SERIAL NOT NULL,
    "moveOutId" INTEGER NOT NULL,
    "layerId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "qty" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(14,6) NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Recipe" (
    "id" SERIAL NOT NULL,
    "outputItemId" INTEGER NOT NULL,
    "outputQtyBase" DECIMAL(20,6) NOT NULL DEFAULT 1,
    "outputUom" "public"."Unit",
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecipeComponent" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "componentId" INTEGER NOT NULL,
    "qtyBasePerOut" DECIMAL(20,6) NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "wastePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "componentUom" "public"."Unit" NOT NULL DEFAULT 'UN',

    CONSTRAINT "RecipeComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SalesInvoice" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,
    "thirdPartyId" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "paymentType" "public"."PaymentType" NOT NULL,
    "status" "public"."InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxBase" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "withholdingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "downPaymentAmount" DECIMAL(14,2),
    "creditMarkupPct" INTEGER,
    "note" TEXT,
    "installments" INTEGER,
    "installmentFrequency" "public"."InstallmentFrequency",
    "firstInstallmentDueDate" TIMESTAMP(3),

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SalesInvoiceLine" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "qty" DECIMAL(20,6) NOT NULL,
    "unitPrice" DECIMAL(14,6) NOT NULL,
    "discountPct" INTEGER,
    "vatPct" INTEGER,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "lineVat" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "taxId" INTEGER,

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AccountsReceivable" (
    "id" SERIAL NOT NULL,
    "thirdPartyId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "AccountsReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JournalEntry" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "periodId" INTEGER,
    "journalId" INTEGER,
    "number" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "companyCurrency" TEXT NOT NULL DEFAULT 'COP',
    "currency" TEXT,
    "fxRate" DECIMAL(14,6),
    "reversalId" INTEGER,
    "description" TEXT,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JournalLine" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "accountId" INTEGER,
    "accountCode" TEXT NOT NULL,
    "thirdPartyId" INTEGER,
    "costCenterId" INTEGER,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "bankRef" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "companyCurrency" TEXT NOT NULL DEFAULT 'COP',
    "currency" TEXT,
    "fxRate" DECIMAL(14,6),
    "amountFunc" DECIMAL(14,2),

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PurchaseInvoice" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,
    "thirdPartyId" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "paymentType" "public"."PaymentType" NOT NULL,
    "status" "public"."PurchaseStatus" NOT NULL DEFAULT 'ISSUED',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxBase" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "withholdingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "installments" INTEGER,
    "installmentFrequency" "public"."InstallmentFrequency",
    "firstInstallmentDueDate" TIMESTAMP(3),

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PurchaseInvoiceLine" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "qty" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(14,6) NOT NULL,
    "vatPct" INTEGER,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "lineVat" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "taxId" INTEGER,

    CONSTRAINT "PurchaseInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AccountsPayable" (
    "id" SERIAL NOT NULL,
    "thirdPartyId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "AccountsPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Installment" (
    "id" SERIAL NOT NULL,
    "receivableId" INTEGER,
    "payableId" INTEGER,
    "number" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "public"."InstallmentStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentMethod" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cashAccountCode" TEXT,
    "bankAccountCode" TEXT,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CashReceipt" (
    "id" SERIAL NOT NULL,
    "thirdPartyId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "methodId" INTEGER,

    CONSTRAINT "CashReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReceiptAllocation" (
    "id" SERIAL NOT NULL,
    "receiptId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "installmentId" INTEGER,

    CONSTRAINT "ReceiptAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VendorPayment" (
    "id" SERIAL NOT NULL,
    "thirdPartyId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "methodId" INTEGER,

    CONSTRAINT "VendorPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentAllocation" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "installmentId" INTEGER,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SalesCreditNote" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "thirdPartyId" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "reason" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "SalesCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SalesCreditNoteLine" (
    "id" SERIAL NOT NULL,
    "creditNoteId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "qty" DECIMAL(20,6) NOT NULL,
    "unitPrice" DECIMAL(14,6) NOT NULL,
    "vatPct" INTEGER,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "lineVat" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SalesCreditNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AccountingPeriod" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" INTEGER,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" SERIAL NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "userId" INTEGER,
    "ip" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Journal" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JournalSequence" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "journalId" INTEGER NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JournalSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AccountsMap" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" INTEGER,
    "json" JSONB NOT NULL,

    CONSTRAINT "AccountsMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tax" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "public"."TaxKind" NOT NULL DEFAULT 'VAT',
    "ratePct" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WithholdingRule" (
    "id" SERIAL NOT NULL,
    "type" "public"."WithholdingType" NOT NULL,
    "scope" "public"."RuleScope" NOT NULL DEFAULT 'BOTH',
    "ratePct" DECIMAL(6,4) NOT NULL,
    "minBase" DECIMAL(14,2),
    "fixedAmount" DECIMAL(14,2),
    "ciiuCode" TEXT,
    "municipalityCode" TEXT,
    "onlyForAgents" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithholdingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InvoiceTax" (
    "id" SERIAL NOT NULL,
    "taxId" INTEGER NOT NULL,
    "base" DECIMAL(14,2) NOT NULL,
    "ratePct" DECIMAL(6,4) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salesInvoiceId" INTEGER,
    "purchaseInvoiceId" INTEGER,
    "salesInvoiceLineId" INTEGER,
    "purchaseInvoiceLineId" INTEGER,

    CONSTRAINT "InvoiceTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InvoiceWithholding" (
    "id" SERIAL NOT NULL,
    "type" "public"."WithholdingType" NOT NULL,
    "ruleId" INTEGER,
    "base" DECIMAL(14,2) NOT NULL,
    "ratePct" DECIMAL(6,4),
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salesInvoiceId" INTEGER,
    "purchaseInvoiceId" INTEGER,
    "salesInvoiceLineId" INTEGER,
    "purchaseInvoiceLineId" INTEGER,

    CONSTRAINT "InvoiceWithholding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoaAccount_code_key" ON "public"."CoaAccount"("code");

-- CreateIndex
CREATE INDEX "CoaAccount_class_idx" ON "public"."CoaAccount"("class");

-- CreateIndex
CREATE INDEX "CoaAccount_current_idx" ON "public"."CoaAccount"("current");

-- CreateIndex
CREATE INDEX "CoaAccount_reconcilable_idx" ON "public"."CoaAccount"("reconcilable");

-- CreateIndex
CREATE INDEX "CoaAccount_isBank_idx" ON "public"."CoaAccount"("isBank");

-- CreateIndex
CREATE INDEX "CoaAccount_isCash_idx" ON "public"."CoaAccount"("isCash");

-- CreateIndex
CREATE INDEX "CoaAccount_requiresThirdParty_idx" ON "public"."CoaAccount"("requiresThirdParty");

-- CreateIndex
CREATE INDEX "CoaAccount_requiresCostCenter_idx" ON "public"."CoaAccount"("requiresCostCenter");

-- CreateIndex
CREATE INDEX "CoaAccount_flowType_idx" ON "public"."CoaAccount"("flowType");

-- CreateIndex
CREATE INDEX "CoaAccount_taxProfile_idx" ON "public"."CoaAccount"("taxProfile");

-- CreateIndex
CREATE INDEX "CoaAccount_parentCode_idx" ON "public"."CoaAccount"("parentCode");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_code_key" ON "public"."CostCenter"("code");

-- CreateIndex
CREATE INDEX "CostCenter_active_idx" ON "public"."CostCenter"("active");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ThirdParty_document_key" ON "public"."ThirdParty"("document");

-- CreateIndex
CREATE INDEX "ThirdParty_type_idx" ON "public"."ThirdParty"("type");

-- CreateIndex
CREATE INDEX "ThirdParty_name_idx" ON "public"."ThirdParty"("name");

-- CreateIndex
CREATE INDEX "ThirdParty_active_idx" ON "public"."ThirdParty"("active");

-- CreateIndex
CREATE INDEX "ThirdParty_receivableAccountCode_idx" ON "public"."ThirdParty"("receivableAccountCode");

-- CreateIndex
CREATE INDEX "ThirdParty_payableAccountCode_idx" ON "public"."ThirdParty"("payableAccountCode");

-- CreateIndex
CREATE INDEX "ThirdParty_fiscalRegime_idx" ON "public"."ThirdParty"("fiscalRegime");

-- CreateIndex
CREATE INDEX "ThirdParty_isWithholdingAgent_idx" ON "public"."ThirdParty"("isWithholdingAgent");

-- CreateIndex
CREATE INDEX "ThirdParty_ciiuCode_idx" ON "public"."ThirdParty"("ciiuCode");

-- CreateIndex
CREATE INDEX "ThirdParty_municipalityCode_idx" ON "public"."ThirdParty"("municipalityCode");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "public"."Category"("name");

-- CreateIndex
CREATE INDEX "Category_incomeAccountCode_idx" ON "public"."Category"("incomeAccountCode");

-- CreateIndex
CREATE INDEX "Category_expenseAccountCode_idx" ON "public"."Category"("expenseAccountCode");

-- CreateIndex
CREATE INDEX "Category_inventoryAccountCode_idx" ON "public"."Category"("inventoryAccountCode");

-- CreateIndex
CREATE INDEX "Category_taxAccountCode_idx" ON "public"."Category"("taxAccountCode");

-- CreateIndex
CREATE INDEX "Category_taxProfile_idx" ON "public"."Category"("taxProfile");

-- CreateIndex
CREATE INDEX "Category_defaultTaxId_idx" ON "public"."Category"("defaultTaxId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_sku_key" ON "public"."Item"("sku");

-- CreateIndex
CREATE INDEX "Item_type_idx" ON "public"."Item"("type");

-- CreateIndex
CREATE INDEX "Item_active_idx" ON "public"."Item"("active");

-- CreateIndex
CREATE INDEX "Item_name_idx" ON "public"."Item"("name");

-- CreateIndex
CREATE INDEX "Item_categoryId_idx" ON "public"."Item"("categoryId");

-- CreateIndex
CREATE INDEX "Item_incomeAccountCode_idx" ON "public"."Item"("incomeAccountCode");

-- CreateIndex
CREATE INDEX "Item_expenseAccountCode_idx" ON "public"."Item"("expenseAccountCode");

-- CreateIndex
CREATE INDEX "Item_inventoryAccountCode_idx" ON "public"."Item"("inventoryAccountCode");

-- CreateIndex
CREATE INDEX "Item_taxAccountCode_idx" ON "public"."Item"("taxAccountCode");

-- CreateIndex
CREATE INDEX "Item_taxProfile_idx" ON "public"."Item"("taxProfile");

-- CreateIndex
CREATE INDEX "Item_defaultTaxId_idx" ON "public"."Item"("defaultTaxId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_name_key" ON "public"."Warehouse"("name");

-- CreateIndex
CREATE INDEX "StockMove_itemId_warehouseId_idx" ON "public"."StockMove"("itemId", "warehouseId");

-- CreateIndex
CREATE INDEX "StockMove_ts_idx" ON "public"."StockMove"("ts");

-- CreateIndex
CREATE INDEX "StockMove_type_idx" ON "public"."StockMove"("type");

-- CreateIndex
CREATE INDEX "StockLayer_itemId_warehouseId_idx" ON "public"."StockLayer"("itemId", "warehouseId");

-- CreateIndex
CREATE INDEX "StockLayer_itemId_warehouseId_expiryDate_idx" ON "public"."StockLayer"("itemId", "warehouseId", "expiryDate");

-- CreateIndex
CREATE INDEX "StockLayer_itemId_warehouseId_lotCode_idx" ON "public"."StockLayer"("itemId", "warehouseId", "lotCode");

-- CreateIndex
CREATE INDEX "StockConsumption_moveOutId_idx" ON "public"."StockConsumption"("moveOutId");

-- CreateIndex
CREATE INDEX "StockConsumption_layerId_idx" ON "public"."StockConsumption"("layerId");

-- CreateIndex
CREATE INDEX "StockConsumption_itemId_warehouseId_idx" ON "public"."StockConsumption"("itemId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_outputItemId_key" ON "public"."Recipe"("outputItemId");

-- CreateIndex
CREATE INDEX "Recipe_active_idx" ON "public"."Recipe"("active");

-- CreateIndex
CREATE INDEX "RecipeComponent_recipeId_idx" ON "public"."RecipeComponent"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeComponent_componentId_idx" ON "public"."RecipeComponent"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_number_key" ON "public"."SalesInvoice"("number");

-- CreateIndex
CREATE INDEX "SalesInvoice_thirdPartyId_idx" ON "public"."SalesInvoice"("thirdPartyId");

-- CreateIndex
CREATE INDEX "SalesInvoice_issueDate_idx" ON "public"."SalesInvoice"("issueDate");

-- CreateIndex
CREATE INDEX "SalesInvoice_status_idx" ON "public"."SalesInvoice"("status");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_invoiceId_idx" ON "public"."SalesInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_taxId_idx" ON "public"."SalesInvoiceLine"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountsReceivable_invoiceId_key" ON "public"."AccountsReceivable"("invoiceId");

-- CreateIndex
CREATE INDEX "AccountsReceivable_thirdPartyId_idx" ON "public"."AccountsReceivable"("thirdPartyId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalId_key" ON "public"."JournalEntry"("reversalId");

-- CreateIndex
CREATE INDEX "JournalEntry_date_idx" ON "public"."JournalEntry"("date");

-- CreateIndex
CREATE INDEX "JournalEntry_status_idx" ON "public"."JournalEntry"("status");

-- CreateIndex
CREATE INDEX "JournalEntry_journalId_idx" ON "public"."JournalEntry"("journalId");

-- CreateIndex
CREATE INDEX "JournalEntry_periodId_idx" ON "public"."JournalEntry"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_key" ON "public"."JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_periodId_journalId_number_key" ON "public"."JournalEntry"("periodId", "journalId", "number");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "public"."JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountCode_idx" ON "public"."JournalLine"("accountCode");

-- CreateIndex
CREATE INDEX "JournalLine_thirdPartyId_idx" ON "public"."JournalLine"("thirdPartyId");

-- CreateIndex
CREATE INDEX "JournalLine_costCenterId_idx" ON "public"."JournalLine"("costCenterId");

-- CreateIndex
CREATE INDEX "JournalLine_reconciled_idx" ON "public"."JournalLine"("reconciled");

-- CreateIndex
CREATE INDEX "JournalLine_bankRef_idx" ON "public"."JournalLine"("bankRef");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_number_key" ON "public"."PurchaseInvoice"("number");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_thirdPartyId_idx" ON "public"."PurchaseInvoice"("thirdPartyId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_issueDate_idx" ON "public"."PurchaseInvoice"("issueDate");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_status_idx" ON "public"."PurchaseInvoice"("status");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceLine_invoiceId_idx" ON "public"."PurchaseInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceLine_taxId_idx" ON "public"."PurchaseInvoiceLine"("taxId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountsPayable_invoiceId_key" ON "public"."AccountsPayable"("invoiceId");

-- CreateIndex
CREATE INDEX "AccountsPayable_thirdPartyId_idx" ON "public"."AccountsPayable"("thirdPartyId");

-- CreateIndex
CREATE INDEX "Installment_receivableId_idx" ON "public"."Installment"("receivableId");

-- CreateIndex
CREATE INDEX "Installment_payableId_idx" ON "public"."Installment"("payableId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_name_key" ON "public"."PaymentMethod"("name");

-- CreateIndex
CREATE INDEX "PaymentMethod_active_idx" ON "public"."PaymentMethod"("active");

-- CreateIndex
CREATE INDEX "PaymentMethod_accountNumber_idx" ON "public"."PaymentMethod"("accountNumber");

-- CreateIndex
CREATE INDEX "PaymentMethod_cashAccountCode_idx" ON "public"."PaymentMethod"("cashAccountCode");

-- CreateIndex
CREATE INDEX "PaymentMethod_bankAccountCode_idx" ON "public"."PaymentMethod"("bankAccountCode");

-- CreateIndex
CREATE INDEX "CashReceipt_thirdPartyId_date_idx" ON "public"."CashReceipt"("thirdPartyId", "date");

-- CreateIndex
CREATE INDEX "CashReceipt_methodId_idx" ON "public"."CashReceipt"("methodId");

-- CreateIndex
CREATE INDEX "ReceiptAllocation_invoiceId_idx" ON "public"."ReceiptAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "ReceiptAllocation_installmentId_idx" ON "public"."ReceiptAllocation"("installmentId");

-- CreateIndex
CREATE INDEX "VendorPayment_thirdPartyId_date_idx" ON "public"."VendorPayment"("thirdPartyId", "date");

-- CreateIndex
CREATE INDEX "VendorPayment_methodId_idx" ON "public"."VendorPayment"("methodId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "public"."PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_installmentId_idx" ON "public"."PaymentAllocation"("installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesCreditNote_number_key" ON "public"."SalesCreditNote"("number");

-- CreateIndex
CREATE INDEX "SalesCreditNote_invoiceId_idx" ON "public"."SalesCreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "SalesCreditNote_thirdPartyId_idx" ON "public"."SalesCreditNote"("thirdPartyId");

-- CreateIndex
CREATE INDEX "SalesCreditNote_issueDate_idx" ON "public"."SalesCreditNote"("issueDate");

-- CreateIndex
CREATE INDEX "SalesCreditNote_status_idx" ON "public"."SalesCreditNote"("status");

-- CreateIndex
CREATE INDEX "SalesCreditNoteLine_creditNoteId_idx" ON "public"."SalesCreditNoteLine"("creditNoteId");

-- CreateIndex
CREATE INDEX "AccountingPeriod_status_idx" ON "public"."AccountingPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_year_month_key" ON "public"."AccountingPeriod"("year", "month");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "public"."AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_ts_idx" ON "public"."AuditLog"("ts");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "public"."AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "Journal_code_key" ON "public"."Journal"("code");

-- CreateIndex
CREATE INDEX "Journal_isActive_idx" ON "public"."Journal"("isActive");

-- CreateIndex
CREATE INDEX "JournalSequence_journalId_idx" ON "public"."JournalSequence"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalSequence_year_month_journalId_key" ON "public"."JournalSequence"("year", "month", "journalId");

-- CreateIndex
CREATE UNIQUE INDEX "Tax_code_key" ON "public"."Tax"("code");

-- CreateIndex
CREATE INDEX "Tax_active_idx" ON "public"."Tax"("active");

-- CreateIndex
CREATE INDEX "Tax_kind_idx" ON "public"."Tax"("kind");

-- CreateIndex
CREATE INDEX "WithholdingRule_type_idx" ON "public"."WithholdingRule"("type");

-- CreateIndex
CREATE INDEX "WithholdingRule_scope_idx" ON "public"."WithholdingRule"("scope");

-- CreateIndex
CREATE INDEX "WithholdingRule_active_idx" ON "public"."WithholdingRule"("active");

-- CreateIndex
CREATE INDEX "WithholdingRule_ciiuCode_idx" ON "public"."WithholdingRule"("ciiuCode");

-- CreateIndex
CREATE INDEX "WithholdingRule_municipalityCode_idx" ON "public"."WithholdingRule"("municipalityCode");

-- CreateIndex
CREATE INDEX "WithholdingRule_onlyForAgents_idx" ON "public"."WithholdingRule"("onlyForAgents");

-- CreateIndex
CREATE INDEX "InvoiceTax_salesInvoiceId_idx" ON "public"."InvoiceTax"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "InvoiceTax_purchaseInvoiceId_idx" ON "public"."InvoiceTax"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "InvoiceTax_salesInvoiceLineId_idx" ON "public"."InvoiceTax"("salesInvoiceLineId");

-- CreateIndex
CREATE INDEX "InvoiceTax_purchaseInvoiceLineId_idx" ON "public"."InvoiceTax"("purchaseInvoiceLineId");

-- CreateIndex
CREATE INDEX "InvoiceTax_taxId_idx" ON "public"."InvoiceTax"("taxId");

-- CreateIndex
CREATE INDEX "InvoiceWithholding_type_idx" ON "public"."InvoiceWithholding"("type");

-- CreateIndex
CREATE INDEX "InvoiceWithholding_ruleId_idx" ON "public"."InvoiceWithholding"("ruleId");

-- CreateIndex
CREATE INDEX "InvoiceWithholding_salesInvoiceId_idx" ON "public"."InvoiceWithholding"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "InvoiceWithholding_purchaseInvoiceId_idx" ON "public"."InvoiceWithholding"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "InvoiceWithholding_salesInvoiceLineId_idx" ON "public"."InvoiceWithholding"("salesInvoiceLineId");

-- CreateIndex
CREATE INDEX "InvoiceWithholding_purchaseInvoiceLineId_idx" ON "public"."InvoiceWithholding"("purchaseInvoiceLineId");

-- AddForeignKey
ALTER TABLE "public"."Category" ADD CONSTRAINT "Category_defaultTaxId_fkey" FOREIGN KEY ("defaultTaxId") REFERENCES "public"."Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Item" ADD CONSTRAINT "Item_defaultTaxId_fkey" FOREIGN KEY ("defaultTaxId") REFERENCES "public"."Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockMove" ADD CONSTRAINT "StockMove_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockMove" ADD CONSTRAINT "StockMove_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockLayer" ADD CONSTRAINT "StockLayer_moveInId_fkey" FOREIGN KEY ("moveInId") REFERENCES "public"."StockMove"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockLayer" ADD CONSTRAINT "StockLayer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockLayer" ADD CONSTRAINT "StockLayer_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockConsumption" ADD CONSTRAINT "StockConsumption_moveOutId_fkey" FOREIGN KEY ("moveOutId") REFERENCES "public"."StockMove"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockConsumption" ADD CONSTRAINT "StockConsumption_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "public"."StockLayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockConsumption" ADD CONSTRAINT "StockConsumption_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockConsumption" ADD CONSTRAINT "StockConsumption_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recipe" ADD CONSTRAINT "Recipe_outputItemId_fkey" FOREIGN KEY ("outputItemId") REFERENCES "public"."Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecipeComponent" ADD CONSTRAINT "RecipeComponent_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "public"."Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecipeComponent" ADD CONSTRAINT "RecipeComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "public"."Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalesInvoice" ADD CONSTRAINT "SalesInvoice_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "public"."Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountsReceivable" ADD CONSTRAINT "AccountsReceivable_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalEntry" ADD CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "public"."AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalEntry" ADD CONSTRAINT "JournalEntry_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "public"."Journal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalEntry" ADD CONSTRAINT "JournalEntry_reversalId_fkey" FOREIGN KEY ("reversalId") REFERENCES "public"."JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "public"."JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."CoaAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalLine" ADD CONSTRAINT "JournalLine_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalLine" ADD CONSTRAINT "JournalLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "public"."CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "public"."Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountsPayable" ADD CONSTRAINT "AccountsPayable_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountsPayable" ADD CONSTRAINT "AccountsPayable_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Installment" ADD CONSTRAINT "Installment_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "public"."AccountsReceivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Installment" ADD CONSTRAINT "Installment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "public"."AccountsPayable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashReceipt" ADD CONSTRAINT "CashReceipt_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "public"."PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashReceipt" ADD CONSTRAINT "CashReceipt_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "public"."CashReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptAllocation" ADD CONSTRAINT "ReceiptAllocation_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "public"."Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VendorPayment" ADD CONSTRAINT "VendorPayment_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "public"."PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VendorPayment" ADD CONSTRAINT "VendorPayment_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."VendorPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "public"."Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalesCreditNote" ADD CONSTRAINT "SalesCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalesCreditNote" ADD CONSTRAINT "SalesCreditNote_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "public"."ThirdParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalesCreditNoteLine" ADD CONSTRAINT "SalesCreditNoteLine_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "public"."SalesCreditNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalesCreditNoteLine" ADD CONSTRAINT "SalesCreditNoteLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalSequence" ADD CONSTRAINT "JournalSequence_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "public"."Journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceTax" ADD CONSTRAINT "InvoiceTax_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "public"."Tax"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceTax" ADD CONSTRAINT "InvoiceTax_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "public"."SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceTax" ADD CONSTRAINT "InvoiceTax_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "public"."PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceTax" ADD CONSTRAINT "InvoiceTax_salesInvoiceLineId_fkey" FOREIGN KEY ("salesInvoiceLineId") REFERENCES "public"."SalesInvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceTax" ADD CONSTRAINT "InvoiceTax_purchaseInvoiceLineId_fkey" FOREIGN KEY ("purchaseInvoiceLineId") REFERENCES "public"."PurchaseInvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceWithholding" ADD CONSTRAINT "InvoiceWithholding_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "public"."WithholdingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceWithholding" ADD CONSTRAINT "InvoiceWithholding_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "public"."SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceWithholding" ADD CONSTRAINT "InvoiceWithholding_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "public"."PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceWithholding" ADD CONSTRAINT "InvoiceWithholding_salesInvoiceLineId_fkey" FOREIGN KEY ("salesInvoiceLineId") REFERENCES "public"."SalesInvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceWithholding" ADD CONSTRAINT "InvoiceWithholding_purchaseInvoiceLineId_fkey" FOREIGN KEY ("purchaseInvoiceLineId") REFERENCES "public"."PurchaseInvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
