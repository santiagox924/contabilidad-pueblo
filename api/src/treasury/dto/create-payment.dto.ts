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

class PaymentAllocDto {
  @IsInt() invoiceId!: number;
  @IsNumber() @IsPositive() amount!: number;
}

export class CreatePaymentDto {
  @IsInt() thirdPartyId!: number;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocDto)
  allocations!: PaymentAllocDto[];
}
