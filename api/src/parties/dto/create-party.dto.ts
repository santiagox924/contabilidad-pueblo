// api/src/parties/dto/create-party.dto.ts
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { FiscalRegime, TaxProfile } from '@prisma/client';

/**
 * CreatePartyDto
 * - Permite NIT en persona NATURAL (no se restringe)
 * - Para persona JURIDICAL puedes enviar responsibilities: string[]
 */
export class CreatePartyDto {
  @IsIn(['CLIENT', 'PROVIDER', 'EMPLOYEE', 'OTHER'])
  type!: 'CLIENT' | 'PROVIDER' | 'EMPLOYEE' | 'OTHER';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['CLIENT', 'PROVIDER', 'EMPLOYEE', 'OTHER'], { each: true })
  roles?: ('CLIENT' | 'PROVIDER' | 'EMPLOYEE' | 'OTHER')[];

  // ===== NUEVOS CAMPOS =====
  @IsIn(['NATURAL', 'JURIDICAL'])
  personKind!: 'NATURAL' | 'JURIDICAL';

  @IsIn(['NIT', 'CC', 'PASSPORT', 'OTHER'])
  idType!: 'NIT' | 'CC' | 'PASSPORT' | 'OTHER';

  @IsOptional()
  @Matches(/^[A-Za-z0-9\-\._]{4,30}$/)
  document?: string;

  @IsString()
  @Length(3, 120)
  name!: string;

  // Representante legal opcional (principalmente para persona jurídica)
  @IsOptional()
  @IsString()
  @Length(3, 120)
  legalRepName?: string;

  /**
   * Responsabilidades fiscales (régimen simple, común, no responsable de IVA, etc.)
   * Se acepta en cualquier persona; normalmente lo usará JURIDICAL.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibilities?: string[];

  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // ===== Parametrización fiscal y contable =====
  @IsOptional()
  @IsEnum(FiscalRegime)
  fiscalRegime?: FiscalRegime;

  @IsOptional()
  @IsBoolean()
  isWithholdingAgent?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Z]{3,8}$/)
  ciiuCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{5}$/)
  municipalityCode?: string;

  @IsOptional()
  @IsEnum(TaxProfile)
  taxProfile?: TaxProfile;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultVatId?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4,10}$/)
  receivableAccountCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4,10}$/)
  payableAccountCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4,10}$/)
  clientReceivableAccountCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4,10}$/)
  providerPayableAccountCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4,10}$/)
  employeePayableAccountCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4,10}$/)
  otherReceivableAccountCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4,10}$/)
  otherPayableAccountCode?: string;

  // ===== Parametrización de nómina: qué conceptos aplican a este empleado =====
  @IsOptional()
  @IsBoolean()
  appliesSalary?: boolean; // Sueldos y salarios

  @IsOptional()
  @IsBoolean()
  appliesWithholding?: boolean; // 237005 Retención en la fuente

  @IsOptional()
  @IsBoolean()
  appliesEps?: boolean; // 237010 Aportes EPS por pagar

  @IsOptional()
  @IsBoolean()
  appliesPension?: boolean; // 237015 Aportes pensión por pagar

  @IsOptional()
  @IsBoolean()
  appliesArl?: boolean; // 237020 ARL por pagar

  @IsOptional()
  @IsBoolean()
  appliesCcf?: boolean; // 237025 Caja de Compensación Familiar
}
