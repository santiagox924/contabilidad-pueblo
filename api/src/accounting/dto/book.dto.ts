// api/src/accounting/dto/book.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** Agrupación del libro: por factura o por día */
export type BookGroup = 'invoice' | 'day';

/** Tipo de libro: ventas o compras */
export type BookKind = 'SALES' | 'PURCHASES';

/** Mapa de IVA por tasa. Ej: { vat_19: 1234.56, vat_5: 78.9 } */
export type VatByRate = Record<string, number>;

/** Fila del libro (por factura o por día, según `group`) */
export class BookRowDto {
  @IsDateString()
  date!: string;

  /** Número de documento cuando group='invoice' (vacío cuando group='day') */
  @IsOptional()
  @IsString()
  number?: string;

  /** ID del tercero (cuando aplica). Puede venir vacío en group='day' */
  @IsOptional()
  @IsString()
  thirdPartyId?: string;

  /** Nombre del tercero (cuando aplica). Puede venir vacío en group='day' */
  @IsOptional()
  @IsString()
  thirdPartyName?: string;

  /** Base gravable acumulada en la fila */
  @IsNumber()
  taxBase!: number;

  /** IVA acumulado discriminado por tasa */
  @IsObject()
  vatByRate!: VatByRate;

  /** Retenciones acumuladas (sufridas en ventas / practicadas en compras) */
  @IsNumber()
  withholdings!: number;

  /** Total del documento o del día según agrupación */
  @IsNumber()
  total!: number;
}

/** Totales del libro para el período consultado */
export class BookTotalsDto {
  /** Base gravable total */
  @IsNumber()
  taxBase!: number;

  /** IVA total discriminado por tasa */
  @IsObject()
  vatByRate!: VatByRate;

  /** Retenciones totales */
  @IsNumber()
  withholdings!: number;

  /** Total del período */
  @IsNumber()
  total!: number;
}

/** Respuesta del endpoint de libros (ventas/compras) */
export class BookResponseDto {
  /** Fecha inicial aplicada (normalizada por el servicio) */
  @IsDateString()
  from!: string;

  /** Fecha final aplicada (normalizada por el servicio) */
  @IsDateString()
  to!: string;

  /** Tipo de libro: ventas o compras */
  @IsEnum(['SALES', 'PURCHASES'])
  kind!: BookKind;

  /** Agrupación solicitada: por factura o por día */
  @IsEnum(['invoice', 'day'])
  group!: BookGroup;

  /** Filas del libro */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookRowDto)
  rows!: BookRowDto[];

  /** Totales del libro */
  @ValidateNested()
  @Type(() => BookTotalsDto)
  totals!: BookTotalsDto;
}

/** (Opcional) DTO para query de libros desde el controlador */
export class BookQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(['invoice', 'day'])
  group?: BookGroup;
}
