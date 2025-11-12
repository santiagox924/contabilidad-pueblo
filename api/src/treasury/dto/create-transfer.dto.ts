// api/src/treasury/dto/create-transfer.dto.ts
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

/**
 * Transferencia entre cuentas bancarias:
 *  - fromAccountCode: código contable de la cuenta banco origen
 *  - toAccountCode:   código contable de la cuenta banco destino
 *  - amount:          monto a transferir (> 0)
 *  - memo (opcional): descripción libre
 *  - date (opcional): fecha ISO (yyyy-mm-dd o ISO completa)
 */
export class CreateTransferDto {
  @Matches(/^[0-9]{3,20}$/, {
    message:
      'fromAccountCode debe ser un código contable numérico (3 a 20 dígitos)',
  })
  fromAccountCode!: string;

  @Matches(/^[0-9]{3,20}$/, {
    message:
      'toAccountCode debe ser un código contable numérico (3 a 20 dígitos)',
  })
  toAccountCode!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'amount debe ser mayor que 0' })
  amount!: number;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsDateString({}, { message: 'date debe ser una fecha ISO válida' })
  date?: string;
}
