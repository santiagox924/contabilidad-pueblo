// api/src/sales/entities/sales-invoice-line.entity.ts
import { Unit } from '@prisma/client';

export class SalesInvoiceLineEntity {
  id!: number;
  invoiceId!: number;

  itemId!: number;

  // ======= Cantidades / UOM =======
  qty!: number;
  /** UOM informativa de la línea (la conversión a base la maneja el service) */
  uom?: Unit | null;

  // ======= Precios / descuentos =======
  /** Precio unitario en la UOM de la línea */
  unitPrice!: number;
  /** % de descuento antes de impuestos */
  discountPct?: number | null;

  // ======= Impuestos (por línea) =======
  /** % de IVA aplicado a la línea (alias de taxPct si lo usas así) */
  vatPct?: number | null;
  /** Bandera para indicar si unitPrice/lineTotal incluyen IVA */
  priceIncludesTax?: boolean | null;
  /** (Opcional) Id del impuesto configurado para la línea */
  taxId?: number | null;

  // ======= Totales calculados (línea) =======
  /** Base de la línea (sin IVA, con descuento) */
  lineSubtotal!: number;
  /** IVA de la línea */
  lineVat!: number;
  /** Total de la línea (base + IVA) */
  lineTotal!: number;

  createdAt!: Date;
  updatedAt!: Date;
}
