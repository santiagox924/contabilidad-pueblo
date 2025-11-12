import { Type } from 'class-transformer';
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
  IsIn,
  ValidateNested,
} from 'class-validator';
export const DEPRECIATION_METHOD_VALUES = [
  'NONE',
  'STRAIGHT_LINE',
  'DECLINING_BALANCE',
] as const;

export type DepreciationMethodDto = (typeof DEPRECIATION_METHOD_VALUES)[number];

export class CreateFixedAssetDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  categoryId!: number;

  @IsDateString()
  acquisitionDate!: string;

  @IsNumber()
  @IsPositive()
  acquisitionCost!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  residualValue?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usefulLifeMonths?: number;

  @IsOptional()
  @IsIn(DEPRECIATION_METHOD_VALUES)
  depreciationMethod?: DepreciationMethodDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  decliningBalanceRate?: number;

  @IsOptional()
  @IsDateString()
  depreciationStart?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  costCenterId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  thirdPartyId?: number;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  locationId?: number;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  policyNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  policyId?: number;

  @IsOptional()
  @IsString()
  supportUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsString()
  counterpartyAccountCode?: string;

  @IsOptional()
  @IsBoolean()
  postToAccounting?: boolean;
}

export class CreateFixedAssetBatchDto {
  @ValidateNested({ each: true })
  @Type(() => CreateFixedAssetDto)
  assets!: CreateFixedAssetDto[];
}
