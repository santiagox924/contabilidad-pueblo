// api/src/withholdings/dto/create-withholding-rule.dto.ts
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RuleScope, WithholdingType } from '@prisma/client';

export class CreateWithholdingRuleDto {
  @IsEnum(WithholdingType)
  type!: WithholdingType; // RTF | RIVA | RICA

  @IsEnum(RuleScope)
  @IsOptional()
  scope?: RuleScope = RuleScope.BOTH;

  // Si usas porcentaje:
  @IsNumber()
  @IsOptional()
  @Min(0)
  ratePct?: number;

  // Base mínima (opcional)
  @IsNumber()
  @IsOptional()
  @Min(0)
  minBase?: number | null;

  // O un valor fijo (opcional); si lo envías, ratePct puede ignorarse
  @IsNumber()
  @IsOptional()
  @Min(0)
  fixedAmount?: number | null;

  // Segmentación por actividad/municipio (opcional)
  @IsString()
  @IsOptional()
  ciiuCode?: string | null;

  @IsString()
  @IsOptional()
  municipalityCode?: string | null;

  // Solo si la contraparte es agente retenedor
  @IsBoolean()
  @IsOptional()
  onlyForAgents?: boolean = false;

  @IsBoolean()
  @IsOptional()
  active?: boolean = true;
}
