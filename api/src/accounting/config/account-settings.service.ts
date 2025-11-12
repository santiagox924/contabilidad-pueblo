// api/src/accounting/config/account-settings.service.ts
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCOUNTS, AccountKey } from './accounts.map';

export type AccountScope = 'PURCHASES';

type AccountDefinition = {
  key: AccountKey;
  label: string;
  description?: string;
  scope: AccountScope;
};

type AccountDetails = {
  id: number | null;
  code: string;
  name: string | null;
  nature: string | null;
  class: string | null;
  requiresThirdParty: boolean;
  requiresCostCenter: boolean;
};

type AccountSettingRow = {
  key: AccountKey;
  label: string;
  description?: string;
  accountCode: string;
  defaultCode: string;
  isDefault: boolean;
  account: AccountDetails;
};

const DEFINITIONS: AccountDefinition[] = [
  {
    key: 'inventory',
    label: 'Inventario (mercancías)',
    description:
      'Cuenta que recibe el costo de bienes cuando la compra es de productos gestionados en inventario.',
    scope: 'PURCHASES',
  },
  {
    key: 'cogs',
    label: 'Costo (COGS)',
    description:
      'Cuenta de costo usada cuando el ítem tiene inventario o costo de venta asociado.',
    scope: 'PURCHASES',
  },
  {
    key: 'purchaseExpense',
    label: 'Gasto directo de compra',
    description:
      'Cuenta alternativa cuando la línea no usa inventario (servicios u otros gastos).',
    scope: 'PURCHASES',
  },
  {
    key: 'purchaseVat',
    label: 'IVA descontable compras',
    description:
      'IVA crédito registrado al recibir facturas de proveedores responsables de IVA.',
    scope: 'PURCHASES',
  },
  {
    key: 'ap',
    label: 'Cuentas por pagar (Proveedores)',
    description:
      'Cuenta que se acredita cuando se registra la obligación con el proveedor.',
    scope: 'PURCHASES',
  },
  {
    key: 'RET_RTF_PURCH_LIAB',
    label: 'Retefuente por pagar (Compras)',
    description: 'Pasivo para retefuente practicada a proveedores.',
    scope: 'PURCHASES',
  },
  {
    key: 'RET_RICA_PURCH_LIAB',
    label: 'ReteICA por pagar (Compras)',
    description: 'Pasivo para reteICA practicada a proveedores.',
    scope: 'PURCHASES',
  },
  {
    key: 'RET_RIVA_PURCH_LIAB',
    label: 'ReteIVA por pagar (Compras)',
    description: 'Pasivo para reteIVA practicada a proveedores.',
    scope: 'PURCHASES',
  },
];

@Injectable()
export class AccountSettingsService implements OnModuleInit {
  private overrides = new Map<AccountKey, string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.prisma.accountingAccountSetting.findMany();
    for (const row of rows) {
      const key = row.key as AccountKey;
      if (this.isValidKey(key)) {
        this.overrides.set(key, row.accountCode);
      }
    }
  }

  async listByScope(scope: AccountScope): Promise<AccountSettingRow[]> {
    const defs = DEFINITIONS.filter((def) => def.scope === scope);
    const pairs = defs.map((def) => ({
      key: def.key,
      code: this.getAccountCodeSync(def.key),
      defaultCode: ACCOUNTS[def.key] ?? '',
    }));

    const uniqueCodes = Array.from(
      new Set(pairs.map((p) => p.code).filter(Boolean)),
    );
    const accounts = await this.prisma.coaAccount.findMany({
      where: uniqueCodes.length ? { code: { in: uniqueCodes } } : undefined,
    });
    const accMap = new Map<string, (typeof accounts)[number]>(
      accounts.map((acc) => [acc.code, acc]),
    );

    return defs.map((def) => {
      const pair = pairs.find((p) => p.key === def.key)!;
      const detail = accMap.get(pair.code);
      const account: AccountDetails = {
        id: detail?.id ?? null,
        code: pair.code,
        name: detail?.name ?? null,
        nature: detail?.nature ?? null,
        class: detail?.class ?? null,
        requiresThirdParty: detail?.requiresThirdParty ?? false,
        requiresCostCenter: detail?.requiresCostCenter ?? false,
      };
      return {
        key: def.key,
        label: def.label,
        description: def.description,
        accountCode: pair.code,
        defaultCode: pair.defaultCode,
        isDefault: pair.code === pair.defaultCode,
        account,
      } satisfies AccountSettingRow;
    });
  }

  getAccountCodeSync(key: AccountKey): string {
    return this.overrides.get(key) ?? (ACCOUNTS[key] as string);
  }

  async getAccountCode(key: AccountKey): Promise<string> {
    if (!this.isValidKey(key)) {
      throw new BadRequestException(`Cuenta no conocida: ${key}`);
    }
    const cached = this.overrides.get(key);
    if (cached) return cached;

    const row = await this.prisma.accountingAccountSetting.findUnique({
      where: { key },
    });
    if (row?.accountCode) {
      this.overrides.set(key, row.accountCode);
      return row.accountCode;
    }

    const fallback = ACCOUNTS[key];
    if (!fallback) {
      throw new BadRequestException(
        `No hay cuenta por defecto configurada para ${key} en accounts.map.ts`,
      );
    }
    return fallback;
  }

  async setAccountCode(
    key: string,
    accountCode: string,
  ): Promise<AccountSettingRow> {
    if (!this.isValidKey(key)) {
      throw new BadRequestException(`Cuenta no soportada: ${key}`);
    }
    const normalized = key;
    if (!accountCode || !accountCode.trim()) {
      throw new BadRequestException('El código de cuenta es obligatorio');
    }
    const trimmed = accountCode.trim();

    const account = await this.prisma.coaAccount.findUnique({
      where: { code: trimmed },
    });
    if (!account) {
      throw new BadRequestException(
        `La cuenta ${trimmed} no existe en el plan contable.`,
      );
    }

    await this.prisma.accountingAccountSetting.upsert({
      where: { key: normalized },
      update: { accountCode: trimmed },
      create: { key: normalized, accountCode: trimmed },
    });

    this.overrides.set(normalized, trimmed);

    const def = DEFINITIONS.find((d) => d.key === normalized);

    return {
      key: normalized,
      label: def?.label ?? normalized,
      description: def?.description,
      accountCode: trimmed,
      defaultCode: ACCOUNTS[normalized] ?? '',
      isDefault: trimmed === (ACCOUNTS[normalized] ?? ''),
      account: {
        id: account.id,
        code: trimmed,
        name: account.name,
        nature: account.nature,
        class: account.class,
        requiresThirdParty: account.requiresThirdParty,
        requiresCostCenter: account.requiresCostCenter,
      },
    } satisfies AccountSettingRow;
  }

  private isValidKey(key: string): key is AccountKey {
    return Object.prototype.hasOwnProperty.call(ACCOUNTS, key);
  }
}
