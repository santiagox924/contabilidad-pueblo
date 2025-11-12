import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsString,
  IsIn,
  IsBoolean,
} from 'class-validator';

export class LockPeriodDto {
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
  @IsBoolean()
  lock?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  requiredRole?: string;
}
