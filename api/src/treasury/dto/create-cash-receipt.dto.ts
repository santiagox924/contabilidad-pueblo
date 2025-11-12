// api/src/treasury/dto/create-cash-receipt.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceiptAllocationDto {
  @IsInt()
  invoiceId!: number;

  @IsOptional()
  @IsInt()
  installmentId?: number;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export enum ReceiptRescheduleStrategy {
  KEEP = 'KEEP',
  MOVE_NEAREST = 'MOVE_NEAREST',
}

export class CreateCashReceiptDto {
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

  @IsEnum(ReceiptRescheduleStrategy)
  @IsOptional()
  reschedule?: ReceiptRescheduleStrategy;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  applyToReceivable?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  postAccounting?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationDto)
  allocations!: ReceiptAllocationDto[];
}
