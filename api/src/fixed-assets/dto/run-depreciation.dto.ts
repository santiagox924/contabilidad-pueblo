import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RunDepreciationDto {
  @IsInt()
  @Min(2000)
  @Max(9999)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsBoolean()
  autoSchedule?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;

  @IsOptional()
  @IsBoolean()
  postToAccounting?: boolean;

  @IsOptional()
  @IsBoolean()
  allowRepeat?: boolean;

  @IsOptional()
  @IsBoolean()
  reversePrevious?: boolean;
}
