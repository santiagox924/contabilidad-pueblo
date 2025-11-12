// api/src/accounting/dto/regulatory.dto.ts
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { WithholdingType } from '@prisma/client';
import { RangeDto } from './range.dto';

export const DIAN_MAGNETIC_FORMAT_CODES = ['1001', '1003'] as const;
export type DianMagneticFormatCode =
  (typeof DIAN_MAGNETIC_FORMAT_CODES)[number];

export enum DianVatScopeDto {
  SALES = 'SALES',
  PURCHASES = 'PURCHASES',
}

export class DianVatQueryDto extends RangeDto {
  @IsOptional()
  @IsEnum(DianVatScopeDto)
  scope?: DianVatScopeDto;
}

export enum DianWithholdingScopeDto {
  SALES = 'SALES',
  PURCHASES = 'PURCHASES',
}

export class DianWithholdingQueryDto extends RangeDto {
  @IsOptional()
  @IsEnum(DianWithholdingScopeDto)
  scope?: DianWithholdingScopeDto;

  @IsOptional()
  @IsEnum(WithholdingType)
  type?: WithholdingType;
}

export class DianMagneticQueryDto extends RangeDto {
  @IsInt()
  @Min(2000)
  year!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(DIAN_MAGNETIC_FORMAT_CODES, { each: true })
  formats?: DianMagneticFormatCode[];
}

export class DianMagneticExportQueryDto extends DianMagneticQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(DIAN_MAGNETIC_FORMAT_CODES)
  formatCode?: DianMagneticFormatCode;
}
