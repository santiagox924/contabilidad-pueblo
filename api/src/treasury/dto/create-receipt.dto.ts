import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class ReceiptAllocDto {
  @IsInt() invoiceId!: number;
  @IsNumber() @IsPositive() amount!: number;
}

export class CreateReceiptDto {
  @IsInt() thirdPartyId!: number;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocDto)
  allocations!: ReceiptAllocDto[];
}
