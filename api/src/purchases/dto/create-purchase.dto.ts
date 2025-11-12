// api/src/purchases/dto/create-purchase.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Unit, PaymentType } from '@prisma/client';

/** Línea de compra (no afecta inventario directamente). */
export class PurchaseLineDto {
  @IsInt()
  itemId!: number;

  @IsNumber()
  @IsPositive()
  qty!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  vatPct?: number;

  /**
   * Unidad opcional para trazabilidad de la línea.
   * No afecta inventario en este endpoint.
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
}

export class CreatePurchaseDto {
  /** Consecutivo opcional; si no viene, el servicio puede autogenerarlo. */
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

  /** Nota libre */
  @IsOptional()
  @IsNotEmpty()
  note?: string;

  /** Líneas de detalle de la compra */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}
