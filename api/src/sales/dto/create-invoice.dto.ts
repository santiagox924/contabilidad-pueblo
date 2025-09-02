import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, Min, ValidateNested } from 'class-validator';

class InvoiceLineDto {
  @IsInt() itemId!: number;

  @IsNumber() @IsPositive()
  qty!: number;

  @IsNumber() @Min(0)
  unitPrice!: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  discountPct?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  vatPct?: number;
}

export class CreateInvoiceDto {
  @IsInt() thirdPartyId!: number;

  @IsIn(['CASH', 'CREDIT'])
  paymentType!: 'CASH' | 'CREDIT';

  @IsOptional() @IsDateString()
  dueDate?: string;

  @IsOptional() @IsString()
  note?: string;

  @IsArray() @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}
