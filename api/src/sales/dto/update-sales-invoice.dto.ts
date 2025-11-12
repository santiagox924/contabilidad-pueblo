// api/src/sales/dto/update-sales-invoice.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentType, Unit, InstallmentFrequency } from '@prisma/client';

/** Tipos de retención manejados en ventas (Colombia) */
export type WithholdingType = 'RTF' | 'RIVA' | 'RICA';

export class UpdateWithholdingInputDto {
  @IsIn(['RTF', 'RIVA', 'RICA'])
  type!: WithholdingType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  base?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  ratePct?: number;

  @IsOptional()
  @IsInt()
  ruleId?: number;
}

export class UpdateSalesLineDto {
  @IsInt()
  itemId!: number;

  @IsNumber()
  @IsPositive()
  qty!: number;

  @IsOptional()
  @IsEnum(Unit)
  uom?: Unit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  /** Permitir enviar directamente el total de la línea (con o sin IVA según priceIncludesTax) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  lineTotal?: number;

  /** Impuesto por id (IVA u otros) */
  @IsOptional()
  @IsInt()
  taxId?: number;

  /** Porcentaje de impuesto; si viene junto a vatPct, el servicio puede priorizar taxPct */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPct?: number;

  /** Alias común de taxPct */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPct?: number;

  /** ¿El precio/total enviados incluyen el IVA? */
  @IsOptional()
  @IsBoolean()
  priceIncludesTax?: boolean;

  /** % de descuento por línea (antes de impuestos) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct?: number;

  /** Retenciones de la línea (explícitas) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWithholdingInputDto)
  withholdings?: UpdateWithholdingInputDto[];
}

export class UpdateCreditPlanDto {
  @IsEnum(InstallmentFrequency)
  frequency!: InstallmentFrequency;

  @IsInt()
  @Min(1)
  installments!: number;

  @IsOptional()
  @IsDateString()
  firstDueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  downPaymentAmount?: number;
}

export class UpdateSalesInvoiceDto {
  /** Cliente (opcional en update; si cambia, el servicio re-ajusta CxC) */
  @IsOptional()
  @IsInt()
  thirdPartyId?: number;

  /** Tipo de pago: CASH o CREDIT */
  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  /** Consecutivo (generalmente no se cambia; permitido si tu negocio lo contempla) */
  @IsOptional()
  @IsInt()
  number?: number;

  /** % de recargo para crédito */
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditMarkupPct?: number;

  /** Fecha de emisión */
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  /** Fecha de vencimiento (si aplica) */
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /**
   * Totales a nivel factura (opcionales, el backend recalcula de todas formas):
   *  - taxTotal: suma de IVA/imp. por factura
   *  - withholdingTotal: suma de retenciones por factura
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxTotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  withholdingTotal?: number;

  /** Líneas de detalle — REQUERIDAS en update según tu servicio */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSalesLineDto)
  lines!: UpdateSalesLineDto[];

  /** Plan de cuotas (solo para CREDIT) */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCreditPlanDto)
  creditPlan?: UpdateCreditPlanDto;

  /** Nota libre */
  @IsOptional()
  @IsString()
  note?: string;
}

export { UpdateSalesInvoiceDto as default };
