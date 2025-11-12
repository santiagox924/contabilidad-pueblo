import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { EmploymentContractType, PayrollFrequency } from '@prisma/client';

export class CreateEmploymentContractDto {
  @IsEnum(EmploymentContractType)
  contractType!: EmploymentContractType;

  @IsOptional()
  @IsString()
  @Length(3, 50)
  code?: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsNumber()
  @Min(0)
  salaryAmount!: number;

  @IsEnum(PayrollFrequency)
  salaryFrequency!: PayrollFrequency;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  workingHours?: string;

  @IsOptional()
  @IsDateString()
  probationEnd?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
