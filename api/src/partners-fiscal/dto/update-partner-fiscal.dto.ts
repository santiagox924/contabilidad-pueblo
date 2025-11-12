// api/src/partners-fiscal/dto/update-partner-fiscal.dto.ts
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { FiscalRegime, TaxProfile } from '@prisma/client';

export class UpdatePartnerFiscalDto {
  @IsEnum(FiscalRegime)
  @IsOptional()
  fiscalRegime?: FiscalRegime;

  @IsBoolean()
  @IsOptional()
  isWithholdingAgent?: boolean;

  // Permitir limpiar con '' (el servicio lo convierte a null)
  @IsString()
  @IsOptional()
  ciiuCode?: string | null;

  @IsString()
  @IsOptional()
  municipalityCode?: string | null;

  // ==== NUEVOS (Punto 5): perfil/forzado de IVA por tercero ====
  @IsEnum(TaxProfile)
  @IsOptional()
  taxProfile?: TaxProfile;

  @IsInt()
  @IsOptional()
  defaultVatId?: number;
}
