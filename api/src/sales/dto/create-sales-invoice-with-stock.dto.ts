// api/src/sales/dto/create-sales-invoice-with-stock.dto.ts
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CreateSalesInvoiceDto,
  SalesLineDto,
} from './create-sales-invoice.dto';

export class SalesLineWithStockDto extends SalesLineDto {
  /** Bodega por línea (si no viene, se usa la bodega por defecto del encabezado) */
  @IsOptional()
  @IsInt()
  @Min(1)
  warehouseId?: number;
}

export class CreateSalesInvoiceWithStockDto extends CreateSalesInvoiceDto {
  /** Bodega por defecto para todas las líneas (PRODUCTOS). Las líneas pueden sobreescribirla. */
  @IsOptional()
  @IsInt()
  @Min(1)
  warehouseId?: number;

  /** Permite vender sin stock (inventario negativo) */
  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;

  /** Reutilizamos validadores del DTO base para 'lines', cambiando el tipo a SalesLineWithStockDto */
  @ValidateNested({ each: true })
  @Type(() => SalesLineWithStockDto)
  declare lines: SalesLineWithStockDto[];
}
