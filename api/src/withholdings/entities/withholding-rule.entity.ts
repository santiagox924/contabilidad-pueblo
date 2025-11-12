import { RuleScope, WithholdingType } from '@prisma/client';

export class WithholdingRuleEntity {
  id!: number;
  type!: WithholdingType;
  scope!: RuleScope;
  ratePct!: number | null;
  minBase!: number | null;
  fixedAmount!: number | null;
  ciiuCode!: string | null;
  municipalityCode!: string | null;
  onlyForAgents!: boolean;
  active!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
