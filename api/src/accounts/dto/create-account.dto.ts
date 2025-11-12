import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { AccountClass, FlowType, TaxProfile } from '@prisma/client';

export class CreateAccountDto {
  @IsString()
  @Matches(/^[0-9]{3,20}$/)
  code!: string;

  @IsString()
  @Length(3, 120)
  name!: string;

  @IsIn(['D', 'C'])
  nature!: 'D' | 'C';

  // obligatorio con el nuevo schema
  @IsEnum(AccountClass)
  class!: AccountClass;

  // opcionales
  @IsOptional() @IsBoolean() current?: boolean;
  @IsOptional() @IsBoolean() reconcilable?: boolean;
  @IsOptional() @IsBoolean() isBank?: boolean;
  @IsOptional() @IsBoolean() isCash?: boolean;
  @IsOptional() @IsBoolean() isDetailed?: boolean;
  @IsOptional() @IsString() parentCode?: string | null;
  @IsOptional() @IsBoolean() requiresThirdParty?: boolean;
  @IsOptional() @IsBoolean() requiresCostCenter?: boolean;
  @IsOptional() @IsEnum(FlowType) flowType?: FlowType;
  @IsOptional() @IsEnum(TaxProfile) taxProfile?: TaxProfile;
  @IsOptional() @IsNumber() vatRate?: number | null;
}
