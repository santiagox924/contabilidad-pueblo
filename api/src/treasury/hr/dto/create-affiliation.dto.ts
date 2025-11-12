import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { EmployeeAffiliationType } from '@prisma/client';

export class CreateAffiliationDto {
  @IsEnum(EmployeeAffiliationType)
  kind!: EmployeeAffiliationType;

  @IsInt()
  thirdPartyId!: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}
