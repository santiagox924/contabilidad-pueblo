// api/src/categories/dto/create-category.dto.ts
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { TaxProfile } from '@prisma/client';

export class CreateCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(TaxProfile)
  taxProfile?: TaxProfile;

  @IsOptional()
  @IsInt()
  defaultTaxId?: number | null;

  @IsOptional()
  @IsString()
  incomeAccountCode?: string | null;

  @IsOptional()
  @IsString()
  expenseAccountCode?: string | null;

  @IsOptional()
  @IsString()
  inventoryAccountCode?: string | null;

  @IsOptional()
  @IsString()
  taxAccountCode?: string | null;

  @IsOptional()
  @IsString()
  purchaseTaxAccountCode?: string | null;
}
