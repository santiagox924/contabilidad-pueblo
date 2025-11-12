// api/src/sales/dto/create-sales-invoice-with-payments.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  ValidateNested,
} from 'class-validator';
import { CreateSalesInvoiceWithStockDto } from './create-sales-invoice-with-stock.dto';

class PaymentSplitDto {
  @IsInt()
  thirdPartyId!: number; // puede ser el cliente u otra persona que paga

  // ID del método de pago (catálogo PaymentMethod)
  @IsInt()
  methodId!: number;

  @IsNumber()
  @IsPositive()
  amount!: number; // monto de este pago

  @IsOptional()
  note?: string;
}

export class CreateSalesInvoiceWithPaymentsDto extends CreateSalesInvoiceWithStockDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  payments!: PaymentSplitDto[]; // suma = total (o parcial si es crédito/abono)
}
