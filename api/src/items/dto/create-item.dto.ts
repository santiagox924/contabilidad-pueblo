import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class CreateItemDto {
  @Matches(/^[A-Z0-9\-_.]{3,30}$/)
  sku!: string;

  @IsString()
  @Length(3, 120)
  name!: string;

  @IsIn(['PRODUCT', 'SERVICE'])
  type!: 'PRODUCT' | 'SERVICE';

  @IsOptional()
  @Matches(/^[A-Z]{2,5}$/)
  unit?: string; // UN, KG, LT, MES...

  @IsOptional()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  ivaPct?: number; // 0, 5, 19...

  // costAvg se calcula luego; no se expone aquí.
}
