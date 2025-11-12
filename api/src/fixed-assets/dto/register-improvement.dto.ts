import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class RegisterImprovementDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsDateString()
  movementDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  costCenterId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  thirdPartyId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  extendLifeMonths?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  residualIncrease?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  decliningRateOverride?: number;

  @IsOptional()
  @IsString()
  counterpartyAccountCode?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsBoolean()
  postToAccounting?: boolean;
}
