import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TaxKind } from '@prisma/client';

export class CreateTaxDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(TaxKind)
  @IsOptional()
  kind?: TaxKind = TaxKind.VAT;

  @IsNumber()
  @Min(0)
  ratePct!: number; // ej: 19, 5, 0

  @IsBoolean()
  @IsOptional()
  active?: boolean = true;
}
