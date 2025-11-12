// api/src/sales/dto/create-sales-invoice.dto.ts
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

export class WithholdingInputDto {
  /** Tipo de retención: ReteFuente, ReteIVA, ReteICA */
  @IsIn(['RTF', 'RIVA', 'RICA'])
  type!: WithholdingType;

  /** Base sobre la cual aplicar la retención; si no viene, se usa la base de la línea (sin IVA) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  base?: number;

  /** Porcentaje de la retención (ej. 2.5, 15, 9.66) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  ratePct?: number;

  /** Opcional: id de la regla aplicada (si viene de motor de reglas) */
  @IsOptional()
  @IsInt()
  ruleId?: number;
}

export class SalesLineDto {
  @IsInt()
  itemId!: number;

  @IsNumber()
  @IsPositive()
  qty!: number;

  /**
   * UOM opcional para trazabilidad de la línea.
   * El descuento de stock (si aplica) se hará en base en el service.
   * Soporta todas las familias:
   *  - COUNT: UN, DZ, PKG, BOX, PR, ROLL
   *  - WEIGHT: MG, G, KG, LB
   *  - VOLUME: ML, L, M3, CM3, OZ_FL, GAL
   *  - LENGTH: MM, CM, M, KM, IN, FT, YD
   *  - AREA: CM2, M2, IN2, FT2, YD2
   */
  @IsOptional()
  @IsEnum(Unit)
  uom?: Unit;

  /**
   * Precio unitario (opcional). Si no viene y viene 'lineTotal', se infiere.
   * Si no viene ninguno, se toma default del ítem/categoría.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  /** Permitir enviar directamente el total de la línea (con o sin IVA según priceIncludesTax) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  lineTotal?: number;

  /**
   * Identificador del impuesto (IVA u otro) a aplicar a la línea.
   * Si no viene, el servicio puede resolver por default de item/categoría/perfil.
   */
  @IsOptional()
  @IsInt()
  taxId?: number;

  /**
   * Porcentaje de impuesto (alias: IVA). Si ambos (taxPct y vatPct) vienen, el servicio puede priorizar taxPct.
   * Ej: 0, 5, 19
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPct?: number;

  /** Compatibilidad: mismo significado que taxPct */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPct?: number;

  /** ¿El precio/total enviados incluyen el IVA? Afecta el cálculo de base/IVA. */
  @IsOptional()
  @IsBoolean()
  priceIncludesTax?: boolean;

  /** % de descuento por línea (antes de impuestos) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct?: number;

  /**
   * Retenciones aplicables a la línea.
   * Si no se envían, el motor de reglas puede calcularlas a nivel línea/factura.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WithholdingInputDto)
  withholdings?: WithholdingInputDto[];
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

  @IsOptional()
  @IsNumber()
  @Min(0)
  downPaymentAmount?: number;
}

export class CreateSalesInvoiceDto {
  /** Cliente */
  @IsInt()
  thirdPartyId!: number;

  /** Tipo de pago: CASH o CREDIT */
  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  /** Consecutivo opcional; si no viene, el sistema lo genera */
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

  /** Líneas de detalle */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesLineDto)
  lines!: SalesLineDto[];

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

  /** Plan de cuotas (solo para CREDIT) */
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditPlanDto)
  creditPlan?: CreditPlanDto;

  /** Nota libre */
  @IsOptional()
  @IsString()
  note?: string;
}
