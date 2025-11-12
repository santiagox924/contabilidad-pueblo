import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';

/**
 * Reglas:
 * - name: requerido
 * - accountName, accountNumber: opcionales (informativos)
 * - cashAccountCode / bankAccountCode: opcionales, pero al menos UNO debe existir
 *   (si vienen ambos vacíos, el service lanzará BadRequest explicando que falta parametrización)
 *
 * Sugerencia de formato de cuenta contable:
 * - Hasta 20 caracteres, dígitos y separadores simples (., -)
 *   Ej: "110505", "111005-NEQUI", "110505.01"
 */
export class CreatePaymentMethodDto {
  @IsString()
  @MaxLength(100)
  name!: string;

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
