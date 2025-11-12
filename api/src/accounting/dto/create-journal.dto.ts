import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateJournalDto {
  @IsString()
  code: string; // GENERAL, SALES, PURCHASES, TREASURY, INVENTORY

  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
