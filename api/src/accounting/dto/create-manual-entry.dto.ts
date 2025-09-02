import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';

class ManualLineDto {
  @IsString() accountCode!: string;   // ej. "5105", "1105"
  @IsOptional() @IsInt() thirdPartyId?: number;
  @IsNumber() @IsPositive() debit?: number;
  @IsNumber() @IsPositive() credit?: number;
  @IsOptional() @IsString() description?: string;
}

export class CreateManualEntryDto {
  @IsString() sourceType!: string;  // "MANUAL"
  @IsOptional() @IsInt() sourceId?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Date) date?: Date;

  @IsArray() @ValidateNested({ each: true }) @Type(() => ManualLineDto)
  lines!: ManualLineDto[];
}
