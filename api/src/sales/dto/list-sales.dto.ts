// src/sales/dto/list-sales.dto.ts
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaymentType, InvoiceStatus } from '@prisma/client';

export class ListSalesQueryDto {
  @Transform(({ value }) => (value !== undefined ? Number(value) : 1))
  @IsInt()
  @Min(1)
  page: number = 1;

  @Transform(({ value }) =>
    value !== undefined ? Math.min(100, Math.max(1, Number(value))) : 10,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 10;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @Transform(({ value }) =>
    value !== undefined && value !== '' ? Number(value) : undefined,
  )
  @IsOptional()
  @IsPositive()
  thirdPartyId?: number;

  // 👇 Nuevo: filtrar por método de pago usado en recibos vinculados
  @Transform(({ value }) =>
    value !== undefined && value !== '' ? Number(value) : undefined,
  )
  @IsOptional()
  @IsPositive()
  methodId?: number;

  @IsOptional()
  @IsEnum(PaymentType, { message: 'paymentType inválido' })
  paymentType?: PaymentType;

  @IsOptional()
  @IsEnum(InvoiceStatus, { message: 'status inválido' })
  status?: InvoiceStatus;

  @IsOptional()
  @IsIn(['issueDate', 'number', 'total'])
  sort?: 'issueDate' | 'number' | 'total' = 'issueDate';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}
