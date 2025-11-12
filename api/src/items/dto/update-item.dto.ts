// api/src/items/dto/update-item.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateItemDto } from './create-item.dto';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  Min,
  Validate,
} from 'class-validator';
import { UnitsCoherentForItemDto } from '../validators/uom.validators';

export class UpdateItemDto extends PartialType(CreateItemDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMid?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMax?: number;

  /** 🔔 Disparador de validación cruzada */
  @Validate(UnitsCoherentForItemDto)
  private readonly __unitsCheckUpdate?: any;

}
