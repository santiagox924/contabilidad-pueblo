import {
  IsInt,
  IsDateString,
  ValidateNested,
  IsArray,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

class JournalLineDto {
  @IsInt()
  accountId: number;

  @IsInt()
  debit: number;

  @IsInt()
  credit: number;

  @IsOptional()
  description?: string;
}

export class PostEntryDto {
  @IsInt()
  journalId: number;

  @IsDateString()
  date: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}
