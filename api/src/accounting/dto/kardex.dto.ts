import { IsInt, IsOptional, IsDateString } from 'class-validator';

export class KardexDto {
  @IsInt()
  itemId: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
