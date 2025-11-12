// src/bom/dto/explode.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  ValidateNested,
} from 'class-validator';

export class DemandLineDto {
  /** Ítem a producir/vender */
  @IsInt()
  itemId!: number;

  /** Cantidad solicitada en baseUnit del ítem */
  @IsNumber()
  @IsPositive()
  qty!: number;
}

export class ExplodeRequestDto {
  /** Demanda: uno o varios ítems finales */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DemandLineDto)
  items!: DemandLineDto[];

  /**
   * Bodega a considerar para “consumir” stock ya preparado de intermedios.
   * Si se informa, la explosión intentará cubrir con stock del producto padre
   * y sólo “baja” a componentes por el remanente.
   */
  @IsOptional()
  @IsInt()
  warehouseId?: number;
}
