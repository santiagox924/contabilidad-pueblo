// api/src/treasury/dto/create-vendor-payment.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class PaymentAllocationDto {
  @IsInt()
  invoiceId!: number;

  @IsOptional()
  @IsInt()
  installmentId?: number;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class CreateVendorPaymentDto {
  @IsInt()
  thirdPartyId!: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  // ID del método de pago (catálogo PaymentMethod)
  @IsOptional()
  @IsInt()
  methodId?: number;

  @IsNumber()
  @Min(0.01)
  total!: number;

  @IsOptional()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
}
