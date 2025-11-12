// api/src/purchases/dto/create-purchase-invoice.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
  IsString,
} from 'class-validator';
import {
  PaymentType,
  InstallmentFrequency,
  Unit,
  WithholdingType,
} from '@prisma/client';

/**
 * Retención explícita por línea.
 * - Puedes enviar `amount` (monto fijo) o `rate` (porcentaje). Si vienen ambos, el servicio prioriza `amount`.
 * - La base se calcula en backend:
 *   RTF/RICA → base = lineSubtotal;  RIVA → base = lineVat.
 */
export class PurchaseLineWithholdingInput {
  @IsEnum(WithholdingType)
  type!: WithholdingType; // 'RTF' | 'RIVA' | 'RICA'

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class PurchaseLineDto {
  @IsInt()
  itemId!: number;

  /** Requerido solo para endpoint /with-stock (el service valida que venga). */
  @IsOptional()
  @IsInt()
  warehouseId?: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  qty!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  vatPct?: number;

  /** Indica si el unitCost incluye IVA (true) o no (false). Opcional. */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  priceIncludesTax?: boolean;
  /**
   * UoM usada para registrar el movimiento de inventario.
   * Si no viene, se usa la displayUnit del ítem.
   * Familias soportadas (ejemplos):
   *  - COUNT: UN
   *  - WEIGHT: MG, G, KG, LB
   *  - VOLUME: ML, L, CM3, M3, OZ_FL, GAL
   *  - LENGTH: MM, CM, M, KM, IN, FT, YD
   *  - AREA: MM2, CM2, M2, HA, KM2
   */
  @IsOptional()
  @IsEnum(Unit)
  uom?: Unit;

  // Metadatos de capa (opcionales)
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  lotCode?: string;

  @IsOptional()
  @IsDateString()
  productionDate?: string;

  /** Retenciones explícitas por línea (opcional). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineWithholdingInput)
  withholdings?: PurchaseLineWithholdingInput[];
}

export class CreditPlanDto {
  @IsEnum(InstallmentFrequency)
  frequency!: InstallmentFrequency;

  @IsInt()
  @Min(1)
  installments!: number;

  @IsOptional()
  @IsDateString()
  firstDueDate?: string;
}

export class CreatePurchaseInvoiceDto {
  /** Consecutivo opcional; si no viene, el servicio autogenera. */
  @IsOptional()
  @IsInt()
  number?: number;

  /** Tercero proveedor */
  @IsInt()
  thirdPartyId!: number;

  /** Tipo de pago: CASH o CREDIT */
  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  /** Fecha de emisión; si no viene, el servicio usará "hoy". */
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  /** Fecha de vencimiento (para pagos a crédito). */
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Líneas de detalle (pueden afectar inventario si usas /with-stock). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];

  /** Plan de cuotas (solo para paymentType = CREDIT). */
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditPlanDto)
  creditPlan?: CreditPlanDto;

  /** Nota libre */
  @IsOptional()
  @IsString()
  note?: string;
}
