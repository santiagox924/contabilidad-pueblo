// api/src/categories/dto/update-category.dto.ts
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { TaxProfile } from '@prisma/client';

export class UpdateCategoryDto {
  @IsOptional()
  @IsEnum(TaxProfile)
  taxProfile?: TaxProfile;

  @IsOptional()
  @IsInt()
  defaultTaxId?: number;

  @IsOptional()
  @IsString()
  incomeAccountCode?: string;

  @IsOptional()
  @IsString()
  expenseAccountCode?: string;

  @IsOptional()
  @IsString()
  inventoryAccountCode?: string;

  @IsOptional()
  @IsString()
  taxAccountCode?: string;

  @IsOptional()
  @IsString()
  purchaseTaxAccountCode?: string;
}
