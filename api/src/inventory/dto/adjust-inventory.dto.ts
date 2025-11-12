import { StockAdjustmentReason, Unit } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

/**
 * DTO para el endpoint POST /inventory/adjust
 * - Permite IN/OUT
 * - qty siempre en la unidad `uom` (o displayUnit del ítem si no se pasa)
 */
export class AdjustInventoryDto {
  @IsInt()
  itemId!: number;

  @IsInt()
  warehouseId!: number;

  // Prisma solo tiene ADJUSTMENT; usamos direction para IN/OUT
  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';

  @IsNumber()
  @Min(0.0001)
  qty!: number;

  @IsOptional()
  @IsEnum(Unit)
  uom?: Unit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number; // requerido cuando IN

  @IsOptional()
  note?: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string; // yyyy-mm-dd o ISO completa

  @IsOptional()
  lotCode?: string;

  @IsOptional()
  @IsISO8601()
  productionDate?: string;

  @IsOptional()
  @IsEnum(StockAdjustmentReason)
  reason?: StockAdjustmentReason;
}
