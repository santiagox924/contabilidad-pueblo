import { PartialType } from '@nestjs/mapped-types';
import { CreatePaymentMethodDto } from './create-payment-method.dto';
import {
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  IsBoolean,
} from 'class-validator';

export class UpdatePaymentMethodDto extends PartialType(
  CreatePaymentMethodDto,
) {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9A-Za-z.\-]+$/, {
    message:
      'cashAccountCode solo puede contener dígitos, letras, punto o guion',
  })
  cashAccountCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9A-Za-z.\-]+$/, {
    message:
      'bankAccountCode solo puede contener dígitos, letras, punto o guion',
  })
  bankAccountCode?: string;
}
