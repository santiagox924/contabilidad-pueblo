import { IsDateString, IsOptional } from 'class-validator';

export class RangeDto {
  @IsOptional() @IsDateString() from?: string; // ISO: 2025-09-01
  @IsOptional() @IsDateString() to?: string;   // ISO: 2025-09-30
}

export class LedgerQueryDto extends RangeDto {}

export class AsOfDto {
  @IsDateString()
  asOf!: string; // fecha de corte (inclusive)
}
