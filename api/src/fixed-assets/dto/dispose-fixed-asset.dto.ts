import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class DisposeFixedAssetDto {
  @IsOptional()
  @IsDateString()
  movementDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  proceeds?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  costCenterId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  thirdPartyId?: number;

  @IsOptional()
  @IsString()
  counterpartyAccountCode?: string;

  @IsOptional()
  @IsString()
  writeOffAccountCode?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsBoolean()
  postToAccounting?: boolean;
}
