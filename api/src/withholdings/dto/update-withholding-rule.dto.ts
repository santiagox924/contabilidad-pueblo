// api/src/withholdings/dto/update-withholding-rule.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateWithholdingRuleDto } from './create-withholding-rule.dto';

export class UpdateWithholdingRuleDto extends PartialType(
  CreateWithholdingRuleDto,
) {}
