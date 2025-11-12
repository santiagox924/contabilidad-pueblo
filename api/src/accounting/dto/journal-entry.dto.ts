import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { RangeDto } from './range.dto';

export class JournalEntryLineDto {
  @IsString()
  accountCode!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  thirdPartyId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  debit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  credit?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateJournalEntryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  journalId?: number;

  @IsOptional()
  @IsString()
  journalCode?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalEntryLineDto)
  lines!: JournalEntryLineDto[];

  @IsOptional()
  @IsInt()
  paymentMethodId?: number;
}

export class UpdateJournalEntryDto extends CreateJournalEntryDto {}

export class JournalListDto extends RangeDto {
  @IsOptional()
  @IsIn(['DRAFT', 'POSTED', 'REVERSED'])
  status?: 'DRAFT' | 'POSTED' | 'REVERSED';

  @IsOptional()
  @IsInt()
  journalId?: number;

  @IsOptional()
  @IsString()
  journalCode?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  take?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
