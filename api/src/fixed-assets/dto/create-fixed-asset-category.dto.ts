import { PartialType } from '@nestjs/mapped-types';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { DEPRECIATION_METHOD_VALUES } from './create-fixed-asset.dto';

export class CreateFixedAssetCategoryDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(DEPRECIATION_METHOD_VALUES)
  depreciationMethod!: string;

  @IsInt()
  @Min(1)
  usefulLifeMonths!: number;

  @IsOptional()
  @IsNumber()
  residualRate?: number;

  @IsString()
  assetAccountCode!: string;

  @IsString()
  accumulatedDepreciationAccountCode!: string;

  @IsString()
  depreciationExpenseAccountCode!: string;

  @IsOptional()
  @IsString()
  disposalGainAccountCode?: string;

  @IsOptional()
  @IsString()
  disposalLossAccountCode?: string;

  @IsOptional()
  @IsString()
  impairmentAccountCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultCostCenterId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFixedAssetCategoryDto extends PartialType(
  CreateFixedAssetCategoryDto,
) {}
