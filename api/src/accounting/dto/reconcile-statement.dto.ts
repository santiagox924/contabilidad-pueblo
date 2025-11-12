import {
  IsInt,
  Min,
  Max,
  IsOptional,
  IsIn,
  IsDateString,
} from 'class-validator';

export class ReconcileStatementDto {
  @IsInt()
  @Min(1900)
  @Max(3000)
  year!: number;

  @IsOptional()
  @IsIn(['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW'])
  statement?: 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW';

  @IsOptional()
  @IsIn(['OFFICIAL', 'DRAFT'])
  version?: 'OFFICIAL' | 'DRAFT';

  @IsOptional()
  @IsDateString()
  asOf?: string;
}
