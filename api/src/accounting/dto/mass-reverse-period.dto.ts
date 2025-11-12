import { IsInt, Min, Max, IsOptional, IsString, IsIn } from 'class-validator';

export class MassReversePeriodDto {
  @IsInt()
  @Min(2000)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(13)
  month!: number;

  @IsOptional()
  @IsIn(['REGULAR', 'ADJUSTMENT', 'SPECIAL'])
  type?: 'REGULAR' | 'ADJUSTMENT' | 'SPECIAL';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  sourceTypePrefix?: string;
}
