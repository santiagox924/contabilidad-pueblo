import { TaxKind } from '@prisma/client';

export class TaxEntity {
  id!: number;
  code!: string;
  name!: string;
  kind!: TaxKind;
  ratePct!: number;
  active!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
