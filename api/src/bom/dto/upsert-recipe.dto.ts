// api/src/bom/dto/upsert-recipe.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
  ValidateIf,
  IsString,
} from 'class-validator';
import { Unit } from '@prisma/client';

export class BomComponentDto {
  @IsOptional()
  @IsInt()
  componentItemId?: number;

  @ValidateIf((o) => o.componentItemId == null)
  @IsString()
  componentSku?: string;

  @IsNumber()
  @IsPositive()
  qty!: number;

  /**
   * Unidad opcional con la que fue capturada la cantidad del componente.
   * Si no viene, el servicio usará el displayUnit del ítem componente.
   * Soporta todas las familias: COUNT/WEIGHT/VOLUME/LENGTH/AREA.
   * COUNT: UN, DZ, PKG, BOX, PR, ROLL
   * WEIGHT: MG, G, KG, LB
   * VOLUME: ML, L, M3, CM3, OZ_FL, GAL
   * LENGTH: MM, CM, M, KM, IN, FT, YD
   * AREA: CM2, M2, IN2, FT2, YD2
   */
  @IsOptional()
  @IsEnum(Unit)
  unit?: Unit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  wastePct?: number;

  @IsOptional()
  @IsBoolean()
  optional?: boolean;
}

export class UpsertRecipeDto {
  @IsOptional()
  @IsInt()
  parentItemId?: number;

  @ValidateIf((o) => o.parentItemId == null)
  @IsString()
  parentSku?: string;

  /** Nombre interno/opcional de la receta */
  @IsOptional()
  @IsString()
  name?: string;

  /** Activa/inactiva */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * Cantidad base producida por ejecución.
   * Se guarda en baseUnit del ítem padre (el servicio normaliza).
   * Por defecto en DB es 1.
   */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  outputQtyBase?: number;

  /**
   * Unidad preferida para visualizar el rendimiento de la receta (UI).
   * No afecta cálculo interno (que siempre usa baseUnit del ítem padre).
   */
  @IsOptional()
  @IsEnum(Unit)
  outputUom?: Unit;

  /** Lista de componentes (insumos/semiterminados) */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BomComponentDto)
  components!: BomComponentDto[];
}

// Compatibilidad con controladores antiguos que importaban CreateRecipeDto:
export class CreateRecipeDto extends UpsertRecipeDto {}
