export type Party = {
  id: number;
  type: "CLIENT" | "PROVIDER" | "EMPLOYEE" | "OTHER";
  document?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  paymentTermsDays?: number | null;
  active: boolean;
};

export type Item = {
  id: number;
  sku: string;
  name: string;
  type: "PRODUCT" | "SERVICE";
  unit: string;
  price?: number | null;
  ivaPct?: number | null;
  active: boolean;
};
export type SalesInvoiceLine = {
  id: number;
  itemId: number;
  qty: number;
  unitPrice: number;
  discountPct?: number | null;
  vatPct?: number | null;
  lineSubtotal: number;
  lineVat: number;
  lineTotal: number;
  item?: { id: number; sku: string; name: string } | null;
};

export type SalesInvoice = {
  id: number;
  number: number;
  thirdPartyId: number;
  issueDate: string;
  dueDate?: string | null;
  paymentType: "CASH" | "CREDIT";
  status: "ISSUED" | "VOID";
  subtotal: number;
  tax: number;
  total: number;
  note?: string | null;
  lines: SalesInvoiceLine[];
  thirdParty?: {
    id: number;
    name: string;
    document?: string | null;
    email?: string | null;
  } | null;
};