// api/src/items/dto/create-item.dto.ts
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  Validate,
} from 'class-validator';
import { ItemType, Unit, UnitKind, TaxProfile } from '@prisma/client';
import { UnitsCoherentForItemDto } from '../validators/uom.validators';

export const CANONICAL_BASE_BY_KIND: Record<UnitKind, Unit> = {
  COUNT: Unit.UN,
  WEIGHT: Unit.G,
  VOLUME: Unit.ML,
  LENGTH: Unit.MM,
  AREA: Unit.CM2,
};

export const UNITS_BY_KIND: Record<UnitKind, Unit[]> = {
  COUNT: [Unit.UN, Unit.DZ, Unit.PKG, Unit.BOX, Unit.PR, Unit.ROLL],
  WEIGHT: [Unit.MG, Unit.G, Unit.KG, Unit.LB],
  VOLUME: [Unit.ML, Unit.L, Unit.M3, Unit.CM3, Unit.OZ_FL, Unit.GAL],
  LENGTH: [Unit.MM, Unit.CM, Unit.M, Unit.KM, Unit.IN, Unit.FT, Unit.YD],
  AREA: [Unit.CM2, Unit.M2, Unit.IN2, Unit.FT2, Unit.YD2],
};

export class CreateItemDto {
  @Matches(/^[A-Z0-9\-_.]{3,30}$/)
  sku!: string;

  @IsString()
  @Length(3, 120)
  name!: string;

  @IsEnum(ItemType)
  type!: ItemType;

  @IsOptional()
  @IsEnum(UnitKind)
  unitKind?: UnitKind;

  @IsOptional()
  @IsEnum(Unit)
  baseUnit?: Unit;

  @IsOptional()
  @IsEnum(Unit)
  displayUnit?: Unit;

  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  ivaPct?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  defaultDiscountPct?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costAvg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMid?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @IsString()
  incomeAccountCode?: string;

  @IsOptional()
  @IsString()
  expenseAccountCode?: string;

  @IsOptional()
  @IsString()
  inventoryAccountCode?: string;

  @IsOptional()
  @IsString()
  taxAccountCode?: string;

  @IsOptional()
  @IsString()
  purchaseTaxAccountCode?: string;

  // ===== NUEVOS (Punto 5): parametrización fiscal por ítem =====
  @IsOptional()
  @IsEnum(TaxProfile)
  taxProfile?: TaxProfile;

  @IsOptional()
  @IsInt()
  defaultTaxId?: number;

  /** 🔔 Disparador de validación cruzada (no es dato real) */
  @Validate(UnitsCoherentForItemDto)
  private readonly __unitsCheck?: any;
}
