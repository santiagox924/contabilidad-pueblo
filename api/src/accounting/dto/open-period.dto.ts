import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsIn,
  IsDateString,
  IsString,
} from 'class-validator';

export class OpenPeriodDto {
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
  label?: string;

  @IsOptional()
  @IsDateString()
  start?: string;

  @IsOptional()
  @IsDateString()
  end?: string;

  @IsOptional()
  @IsString()
  requiredRole?: string;

  @IsOptional()
  @IsDateString()
  allowBackPostUntil?: string;
}
