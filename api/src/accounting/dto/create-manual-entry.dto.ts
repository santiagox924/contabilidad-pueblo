// api/src/accounting/dto/create-manual-entry.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

class ManualLineDto {
  @IsString()
  accountCode!: string; // ej. "5105", "1105"

  @IsOptional()
  @IsInt()
  thirdPartyId?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  debit?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  credit?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateManualEntryDto {
  @IsString()
  sourceType!: string; // "MANUAL" u otro

  @IsOptional()
  @IsInt()
  sourceId?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Date)
  date?: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualLineDto)
  lines!: ManualLineDto[];
}
