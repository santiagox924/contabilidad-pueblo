// api/src/accounting/dto/reverse-entry.dto.ts

import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ReverseEntryDto {
  @IsInt()
  @Min(1)
  id: number; // ID del asiento a revertir

  @IsOptional()
  @IsString()
  reason?: string; // Motivo o nota de reversa (opcional)
}
