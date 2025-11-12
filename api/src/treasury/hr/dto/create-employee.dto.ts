import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { EmploymentStatus } from '@prisma/client';

export class CreateEmployeeDto {
  @IsInt()
  thirdPartyId!: number;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  status?: EmploymentStatus;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  department?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsDateString()
  terminationDate?: string;

  @IsOptional()
  @IsInt()
  defaultCostCenterId?: number;

  @IsOptional()
  @IsString()
  @Length(4, 15)
  payableAccountCode?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}
