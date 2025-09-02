import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CreditLineDto {
  @IsInt() itemId!: number;
  @Min(0.000001) qty!: number;
  @Min(0) unitPrice!: number;
  @IsOptional() @Min(0) vatPct?: number; // 0/5/19...
}

export class CreateCreditNoteDto {
  @IsInt() invoiceId!: number;
  @IsOptional() @IsString() reason?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreditLineDto)
  lines!: CreditLineDto[];
}
