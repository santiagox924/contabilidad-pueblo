// api/src/inventory/dto/create-move.dto.ts
import { IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { StockMoveType, Unit } from '@prisma/client';

export class CreateMoveDto {
  /** Ítem afectado por el movimiento */
  @IsInt()
  itemId!: number;

  /** Bodega origen/destino */
  @IsInt()
  warehouseId!: number;

  /** Tipo de movimiento: PURCHASE / SALE / ADJUSTMENT / TRANSFER_IN / TRANSFER_OUT */
  @IsEnum(StockMoveType)
  type!: StockMoveType;

  /**
   * Cantidad movida (en la unidad especificada por `uom` o en displayUnit del ítem).
   * Siempre > 0.
   */
  @IsNumber()
  @Min(0.0001)
  qty!: number;

  /**
   * Unidad de medida usada en la captura del movimiento.
   * Si no viene, se tomará la displayUnit configurada en el ítem.
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

  /** Costo unitario (opcional, solo en movimientos de entrada) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  /** Tipo de documento que origina el movimiento (ej: "PURCHASE_INVOICE") */
  @IsOptional()
  refType?: string;

  /** Id del documento de referencia */
  @IsOptional()
  refId?: number;

  /** Nota libre */
  @IsOptional()
  note?: string;
}
