import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, Max, Min, ValidateNested } from 'class-validator';

class PurchaseLineDto {
  @IsInt() itemId!: number;
  @IsNumber() @IsPositive() qty!: number;
  @IsNumber() @Min(0) unitCost!: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) vatPct?: number;
}

export class CreatePurchaseDto {
  @IsInt() thirdPartyId!: number;

  @IsIn(['CASH', 'CREDIT'])
  paymentType!: 'CASH' | 'CREDIT';

  @IsOptional() @IsDateString()
  dueDate?: string;

  @IsOptional() @IsNotEmpty()
  note?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}
