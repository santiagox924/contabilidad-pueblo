// api/src/accounting/dto/books.dto.ts
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { RangeDto } from './range.dto';

export enum JournalStatusDto {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

export class GeneralJournalQueryDto extends RangeDto {
  @IsOptional()
  @IsString()
  journalCode?: string;

  @IsOptional()
  @IsEnum(JournalStatusDto)
  status?: JournalStatusDto;

  @IsOptional()
  @IsInt()
  thirdPartyId?: number;

  @IsOptional()
  @IsInt()
  costCenterId?: number;

  @IsOptional()
  @IsString()
  accountCode?: string;
}

export class AuxLedgerAccountQueryDto extends RangeDto {
  @IsString()
  accountCode!: string;

  @IsOptional()
  @IsEnum(JournalStatusDto)
  status?: JournalStatusDto;

  @IsOptional()
  @IsString()
  journalCode?: string;

  @IsOptional()
  @IsInt()
  thirdPartyId?: number;

  @IsOptional()
  @IsInt()
  costCenterId?: number;
}

export class AuxLedgerThirdPartyQueryDto extends RangeDto {
  @IsInt()
  thirdPartyId!: number;

  @IsOptional()
  @IsEnum(JournalStatusDto)
  status?: JournalStatusDto;

  @IsOptional()
  @IsString()
  accountCode?: string;

  @IsOptional()
  @IsString()
  journalCode?: string;

  @IsOptional()
  @IsInt()
  costCenterId?: number;
}

export class AuxLedgerCostCenterQueryDto extends RangeDto {
  @IsInt()
  costCenterId!: number;

  @IsOptional()
  @IsEnum(JournalStatusDto)
  status?: JournalStatusDto;

  @IsOptional()
  @IsString()
  accountCode?: string;

  @IsOptional()
  @IsString()
  journalCode?: string;

  @IsOptional()
  @IsInt()
  thirdPartyId?: number;
}

export class BooksExportFormatDto {
  @IsOptional()
  @IsString()
  format?: 'csv' | 'xlsx';
}
