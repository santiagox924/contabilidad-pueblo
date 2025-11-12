import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

class PayrollLineDto {
  @IsString()
  accountCode!: string;

  @IsOptional()
  @IsInt()
  thirdPartyId?: number;

  @IsOptional()
  @IsInt()
  costCenterId?: number;

  @IsOptional()
  @IsNumber()
  debit?: number;

  @IsOptional()
  @IsNumber()
  credit?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class PayrollEntryDto {
  @IsString()
  type!: string; // RECOGNITION, PAYMENT, CONTRIBUTION, ADVANCE

  @IsOptional()
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Date)
  date?: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollLineDto)
  lines!: PayrollLineDto[];

  @IsOptional()
  @IsInt()
  paymentMethodId?: number;
}

export class PayrollSimpleDto {
  @IsOptional()
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Date)
  date?: Date;

  // montos desglosados
  @IsOptional()
  @IsNumber()
  salary?: number;

  @IsOptional()
  @IsNumber()
  salaryIntegral?: number;

  @IsOptional()
  @IsNumber()
  jornales?: number;

  @IsOptional()
  @IsNumber()
  overtime?: number;

  @IsOptional()
  @IsNumber()
  commissions?: number;

  @IsOptional()
  @IsNumber()
  viaticos?: number;

  @IsOptional()
  @IsNumber()
  incapacities?: number;

  @IsOptional()
  @IsNumber()
  transportAllowance?: number;

  @IsOptional()
  @IsNumber()
  extraLegalBonuses?: number;

  @IsOptional()
  @IsNumber()
  auxilios?: number;

  @IsOptional()
  @IsNumber()
  bonificaciones?: number;

  // Campos legados (compatibilidad)
  @IsOptional()
  @IsNumber()
  transport?: number;

  @IsOptional()
  @IsNumber()
  extras?: number;

  @IsOptional()
  @IsNumber()
  retention?: number;

  @IsOptional()
  @IsNumber()
  eps?: number;

  @IsOptional()
  @IsNumber()
  pension?: number;

  @IsOptional()
  @IsNumber()
  epsEmployer?: number;

  @IsOptional()
  @IsNumber()
  arlEmployer?: number;

  @IsOptional()
  @IsNumber()
  ccfEmployer?: number;

  @IsOptional()
  @IsNumber()
  arl?: number;

  @IsOptional()
  @IsNumber()
  ccf?: number;

  @IsOptional()
  @IsNumber()
  embargoes?: number;

  @IsOptional()
  @IsNumber()
  libranzas?: number;

  @IsOptional()
  @IsNumber()
  sindicatos?: number;

  @IsOptional()
  @IsNumber()
  cooperativas?: number;

  @IsOptional()
  @IsNumber()
  fondos?: number;

  @IsOptional()
  @IsNumber()
  otrosDescuentos?: number;

  // Employer (patronal) contributions - opcionales; si se proporcionan, se registran como gasto del empleador
  @IsOptional()
  @IsNumber()
  employerEps?: number;

  @IsOptional()
  @IsNumber()
  employerPension?: number;

  @IsOptional()
  @IsNumber()
  employerArl?: number;

  @IsOptional()
  @IsNumber()
  employerCcf?: number;

  // Provisiones / prestaciones sociales (opcional)
  @IsOptional()
  @IsNumber()
  provisionsCesantias?: number;

  @IsOptional()
  @IsNumber()
  provisionsInterestCesantias?: number;

  @IsOptional()
  @IsNumber()
  provisionsPrima?: number;

  @IsOptional()
  @IsNumber()
  provisionsVacations?: number;

  @IsOptional()
  @IsNumber()
  provisionsTotal?: number;

  @IsOptional()
  @IsNumber()
  salaryPayable?: number;

  @IsOptional()
  @IsString()
  bankAccountCode?: string; // account code for bank/cash (e.g., '111005' or '110505')

  @IsOptional()
  @IsInt()
  paymentMethodId?: number;

  @IsOptional()
  @IsNumber()
  advanceAmount?: number;

  // Auto-calculate withholding (retención en la fuente) using a flat rate if requested.
  @IsOptional()
  autoCalculateRetention?: boolean;

  @IsOptional()
  @IsNumber()
  withholdingRate?: number; // e.g., 0.1 for 10%
}
