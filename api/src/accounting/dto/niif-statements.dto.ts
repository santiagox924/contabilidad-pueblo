// api/src/accounting/dto/niif-statements.dto.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';
import { RangeDto } from './range.dto';

export class NiifBalanceQueryDto {
  @IsDateString()
  asOf!: string;

  @IsOptional()
  @IsDateString()
  previousAsOf?: string;
}

export class NiifIncomeQueryDto extends RangeDto {
  @IsOptional()
  @IsDateString()
  previousFrom?: string;

  @IsOptional()
  @IsDateString()
  previousTo?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  accumulateYear?: boolean;
}

export class NiifCashFlowQueryDto extends RangeDto {
  @IsOptional()
  @IsDateString()
  previousFrom?: string;

  @IsOptional()
  @IsDateString()
  previousTo?: string;
}

export type NiifStatementNodeDto = {
  id: string;
  label: string;
  amount: number;
  previousAmount?: number | null;
  children?: NiifStatementNodeDto[];
  notes?: string;
};

type UnmappedBucket = { code: string; name: string; balance: number };

export type NiifStatementResponseMeta = {
  unmapped?: {
    current: UnmappedBucket[];
    previous: UnmappedBucket[];
  };
  checks?: Record<string, number>;
};

export type NiifBalanceStatementDto = {
  asOf: string;
  previousAsOf?: string | null;
  currency: string;
  sections: NiifStatementNodeDto[];
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
  };
  meta?: NiifStatementResponseMeta;
};

export type NiifIncomeStatementDto = {
  from: string;
  to: string;
  previousFrom?: string | null;
  previousTo?: string | null;
  currency: string;
  sections: NiifStatementNodeDto[];
  totals: {
    netIncome: number;
  };
  meta?: NiifStatementResponseMeta;
};

export type NiifCashFlowStatementDto = {
  from: string;
  to: string;
  previousFrom?: string | null;
  previousTo?: string | null;
  currency: string;
  sections: NiifStatementNodeDto[];
  totals: {
    netChange: number;
  };
  meta?: NiifStatementResponseMeta;
};
