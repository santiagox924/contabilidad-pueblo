// api/src/sales/entities/sales-invoice.entity.ts
import { PaymentType, InstallmentFrequency } from '@prisma/client';
import { SalesInvoiceLineEntity } from './sales-invoice-line.entity';

/** Desglose de impuestos (por factura) */
export class InvoiceTaxEntity {
  id!: number;
  invoiceId!: number;
  /** 'IVA' u otros tipos que puedas soportar en el futuro */
  kind!: 'IVA' | string;
  /** Porcentaje aplicado (ej. 0, 5, 19) */
  ratePct!: number;
  /** Valor del impuesto para esa tasa */
  amount!: number;
}

/** Desglose de retenciones (por factura) */
export class InvoiceWithholdingEntity {
  id!: number;
  invoiceId!: number;
  /** Tipo de retención: RTF (fuente) | RIVA | RICA */
  type!: 'RTF' | 'RIVA' | 'RICA';
  /** Base sobre la que se calculó la retención */
  base!: number;
  /** Porcentaje aplicado (ej. 2.5, 15, 9.66) */
  ratePct!: number;
  /** Valor retenido */
  amount!: number;
  /** Regla utilizada (si viene del motor de reglas) */
  ruleId?: number | null;
}

export class SalesInvoiceEntity {
  // ======= Campos base =======
  id!: number;
  number!: number;
  thirdPartyId!: number;

  issueDate!: Date;
  dueDate?: Date | null;

  paymentType!: PaymentType; // CASH | CREDIT
  status!: 'ISSUED' | 'VOID';

  // ======= Totales =======
  /** Base (sin IVA) */
  subtotal!: number;
  /** Total de IVA (consolidado) */
  tax!: number;
  /** Total factura (con markup si aplica) */
  total!: number;

  /** % de recargo de crédito (si aplica) */
  creditMarkupPct?: number | null;
  /** Abono inicial si crédito */
  downPaymentAmount?: number | null;

  // ======= Crédito / cuotas =======
  installments?: number | null;
  installmentFrequency?: InstallmentFrequency | null;
  firstInstallmentDueDate?: Date | null;

  // ======= Texto libre =======
  note?: string | null;

  createdAt!: Date;
  updatedAt!: Date;

  // ======= Relaciones =======
  lines!: SalesInvoiceLineEntity[];

  /** Desglose por tasa (IVA u otros) */
  taxes?: InvoiceTaxEntity[];
  /** Desglose de retenciones por tipo (RTF/RIVA/RICA) */
  withholdings?: InvoiceWithholdingEntity[];

  /** (Opcional) Totales pre-calculados a nivel factura si tu schema los tiene */
  taxTotal?: number;
  withholdingTotal?: number;
}
