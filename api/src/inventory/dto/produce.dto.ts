import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class ProduceDto {
  @IsInt()
  @Min(1)
  itemId!: number; // producto terminado a producir (p.ej. salsa especial)

  @IsInt()
  @Min(1)
  warehouseId!: number; // bodega donde se consumen insumos y entra el terminado

  // cantidad a producir en la unidad "visible" del ítem (si tu servicio usa base unit, ajusta allí)
  @IsPositive()
  qty!: number;

  // opcional: nota/lote/fecha de expiración, etc.
  @IsOptional()
  @IsString()
  note?: string;

  // si al producir permites que falten insumos (quedando negativo en insumos base)
  @IsOptional()
  allowNegative?: boolean;
}
