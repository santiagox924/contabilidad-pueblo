// api/src/accounting/dto/close-period.dto.ts
import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsIn,
  IsBoolean,
  IsString,
} from 'class-validator';

export class ClosePeriodDto {
  @IsInt()
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
  lockAfterClose?: boolean;

  @IsOptional()
  @IsString()
  lockReason?: string;

  @IsOptional()
  @IsString()
  requiredRole?: string;
}
