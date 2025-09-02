import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMoveDto {
  @IsInt() itemId!: number;
  @IsInt() warehouseId!: number;

  @IsIn(['PURCHASE', 'SALE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT'])
  type!: 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT';

  // Cantidad POSITIVA; el servicio pone el signo según type
  @IsNumber() @Min(0.0001)
  qty!: number;

  // En ENTRADAS (PURCHASE, ADJUSTMENT+, TRANSFER_IN) es requerida.
  // En SALIDAS la ignoramos (se calcula FIFO).
  @IsOptional()
  @IsNumber() @Min(0)
  unitCost?: number;

  @IsOptional() @IsString() refType?: string;
  @IsOptional() @IsInt() refId?: number;
  @IsOptional() @IsString() note?: string;
}
