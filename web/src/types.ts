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
