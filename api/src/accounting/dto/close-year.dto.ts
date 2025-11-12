// api/src/accounting/dto/close-year.dto.ts

import { IsInt, Min, Max } from 'class-validator';

/**
 * DTO para solicitar el cierre de un ejercicio fiscal completo.
 * Valida que el año esté en un rango razonable.
 */
export class CloseYearDto {
  @IsInt()
  @Min(1900)
  @Max(3000)
  year!: number;
}
