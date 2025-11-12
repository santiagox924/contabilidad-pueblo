// api/src/parties/parties.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FiscalRegime, PartyType, TaxProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { ACCOUNTS } from '../accounting/config/accounts.map';

const PARTY_ROLE_VALUES = new Set<PartyType>(
  Object.values(PartyType) as PartyType[],
);

const RECEIVABLE_PRIORITY: PartyType[] = [
  PartyType.CLIENT,
  PartyType.PROVIDER,
  PartyType.EMPLOYEE,
  PartyType.OTHER,
];

const PAYABLE_PRIORITY: PartyType[] = [
  PartyType.PROVIDER,
  PartyType.CLIENT,
  PartyType.EMPLOYEE,
  PartyType.OTHER,
];

const ORDERED_ROLES: PartyType[] = [
  PartyType.CLIENT,
  PartyType.PROVIDER,
  PartyType.EMPLOYEE,
  PartyType.OTHER,
];

const ROLES_WITH_RECEIVABLE = new Set<PartyType>([
  PartyType.CLIENT,
  PartyType.OTHER,
]);

const ROLES_WITH_PAYABLE = new Set<PartyType>([
  PartyType.PROVIDER,
  PartyType.EMPLOYEE,
  PartyType.OTHER,
]);

type RoleAccountColumns = {
  clientReceivableAccountCode: string | null;
  providerPayableAccountCode: string | null;
  employeePayableAccountCode: string | null;
  otherReceivableAccountCode: string | null;
  otherPayableAccountCode: string | null;
};

type RoleAccountInput = Partial<RoleAccountColumns>;

@Injectable()
export class PartiesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  findAll(role?: PartyType) {
    const where: any = { active: true };
    if (role) {
      where.roles = { has: role };
    }
    return this.prisma.thirdParty.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        type: true,
        roles: true,
        personKind: true,
        idType: true,
        legalRepName: true,
        document: true,
        email: true,
        phone: true,
        address: true,
        city: true,
      },
    });
  }

  async findOne(id: number) {
    const party = await this.prisma.thirdParty.findUnique({ where: { id } });
    if (!party || !party.active)
      throw new NotFoundException('Tercero no encontrado');
    return party;
  }

  /**
   * Buscar tercero por documento exacto (trim).
   * Devuelve null si no hay coincidencia.
   */
  async findByDocument(document: string) {
    const doc = (document ?? '').trim();
    if (!doc) return null;
    return this.prisma.thirdParty.findFirst({
      where: { active: true, document: doc },
    });
  }

  async create(dto: CreatePartyDto, userId?: number) {
    // NATURAL puede tener NIT; no se fuerza CC
    const personKind = dto.personKind ?? 'NATURAL';
    const idType = dto.idType ?? (personKind === 'JURIDICAL' ? 'NIT' : 'CC');
    const responsibilities = Array.isArray((dto as any).responsibilities)
      ? (dto as any).responsibilities
      : [];

    const roles = this.normalizeRoles(dto.roles, dto.type);
    const primaryRole = roles[0];

    const taxProfile = dto.taxProfile ?? this.defaultTaxProfile(primaryRole);
    const fiscalRegime =
      dto.fiscalRegime ?? this.defaultFiscalRegime(taxProfile);
    const defaultVatId = await this.resolveDefaultVatId({
      incoming: dto.defaultVatId,
      taxProfile,
    });

    const receivableOverride =
      dto.receivableAccountCode === undefined
        ? undefined
        : this.nullable(dto.receivableAccountCode);
    const payableOverride =
      dto.payableAccountCode === undefined
        ? undefined
        : this.nullable(dto.payableAccountCode);

    const accountResult = this.computeRoleAccountColumns({
      roles,
      primaryRole,
      input: dto as RoleAccountInput,
      fallbackReceivable: receivableOverride,
      fallbackPayable: payableOverride,
    });

    const receivableAccountCode =
      receivableOverride !== undefined
        ? receivableOverride
        : accountResult.generalReceivable;

    const payableAccountCode =
      payableOverride !== undefined
        ? payableOverride
        : accountResult.generalPayable;

    const {
      clientReceivableAccountCode,
      providerPayableAccountCode,
      employeePayableAccountCode,
      otherReceivableAccountCode,
      otherPayableAccountCode,
    } = accountResult.columns;

    const ciiuCode = this.normalizeCode(dto.ciiuCode);
    const municipalityCode = this.normalizeMunicipality(dto.municipalityCode);

    try {
      const data: any = {
        type: primaryRole,
        roles,
        personKind,
        idType,
        legalRepName: this.nullable(dto.legalRepName),
        responsibilities, // ← lista (por defecto [])
        document: this.normalizeDocument(dto.document),
        name: dto.name,
        email: this.nullable(dto.email),
        phone: this.nullable(dto.phone),
        address: this.nullable(dto.address),
        city: this.nullable(dto.city),
        paymentTermsDays: dto.paymentTermsDays ?? null,
        active: dto.active ?? true,

        fiscalRegime,
        isWithholdingAgent: dto.isWithholdingAgent ?? false,
        ciiuCode,
        municipalityCode,
        taxProfile,
        defaultVatId,
        receivableAccountCode,
        payableAccountCode,
        clientReceivableAccountCode,
        providerPayableAccountCode,
        employeePayableAccountCode,
        otherReceivableAccountCode,
        otherPayableAccountCode,
      };

      const created = await this.prisma.thirdParty.create({
        data,
      });

      await this.audit.log({
        entity: 'ThirdParty',
        entityId: created.id,
        action: 'CREATE',
        userId,
        changes: { after: created },
      });

      return created;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        // Índice único en document
        throw new ConflictException('El documento ya está registrado');
      }
      throw e;
    }
  }

  async update(id: number, dto: UpdatePartyDto, userId?: number) {
    const before = await this.prisma.thirdParty.findUnique({ where: { id } });
    if (!before || !before.active)
      throw new NotFoundException('Tercero no encontrado');

    const existingRoles = Array.isArray((before as any).roles)
      ? ((before as any).roles as PartyType[])
      : undefined;

    const responsibilities =
      (dto as any).responsibilities === undefined
        ? undefined
        : Array.isArray((dto as any).responsibilities)
          ? (dto as any).responsibilities
          : [];

    const incomingRoles = dto.roles as (PartyType | string)[] | undefined;

    const requestedPrimary =
      (dto.type as PartyType | undefined) ??
      (Array.isArray(incomingRoles) && incomingRoles.length > 0
        ? (incomingRoles[0] as PartyType)
        : undefined) ??
      before.type;

    const roles = this.normalizeRoles(
      incomingRoles,
      requestedPrimary,
      incomingRoles === undefined ? existingRoles : undefined,
    );
    const primaryRole = roles[0];

    const taxProfile =
      dto.taxProfile ??
      before.taxProfile ??
      this.defaultTaxProfile(primaryRole);
    const fiscalRegime =
      dto.fiscalRegime ??
      before.fiscalRegime ??
      this.defaultFiscalRegime(taxProfile);
    const defaultVatId = await this.resolveDefaultVatId({
      incoming: dto.defaultVatId,
      current: before.defaultVatId,
      taxProfile,
    });

    const receivableAccountCode =
      dto.receivableAccountCode === undefined
        ? undefined
        : this.nullable(dto.receivableAccountCode);

    const payableAccountCode =
      dto.payableAccountCode === undefined
        ? undefined
        : this.nullable(dto.payableAccountCode);

    const previousRoleAccounts: RoleAccountColumns = {
      clientReceivableAccountCode:
        (before as any).clientReceivableAccountCode ?? null,
      providerPayableAccountCode:
        (before as any).providerPayableAccountCode ?? null,
      employeePayableAccountCode:
        (before as any).employeePayableAccountCode ?? null,
      otherReceivableAccountCode:
        (before as any).otherReceivableAccountCode ?? null,
      otherPayableAccountCode: (before as any).otherPayableAccountCode ?? null,
    };

    const accountResult = this.computeRoleAccountColumns({
      roles,
      primaryRole,
      input: dto as RoleAccountInput,
      previous: previousRoleAccounts,
      fallbackReceivable: receivableAccountCode,
      fallbackPayable: payableAccountCode,
    });

    const computedReceivable =
      receivableAccountCode !== undefined
        ? receivableAccountCode
        : accountResult.generalReceivable;

    const computedPayable =
      payableAccountCode !== undefined
        ? payableAccountCode
        : accountResult.generalPayable;

    const {
      clientReceivableAccountCode,
      providerPayableAccountCode,
      employeePayableAccountCode,
      otherReceivableAccountCode,
      otherPayableAccountCode,
    } = accountResult.columns;

    const ciiuCode =
      dto.ciiuCode === undefined
        ? before.ciiuCode
        : this.normalizeCode(dto.ciiuCode);
    const municipalityCode =
      dto.municipalityCode === undefined
        ? before.municipalityCode
        : this.normalizeMunicipality(dto.municipalityCode);

    try {
      const data: any = {
        type: primaryRole,
        roles,
        personKind: dto.personKind ?? undefined,
        idType: dto.idType ?? undefined,
        legalRepName:
          dto.legalRepName === undefined
            ? undefined
            : this.nullable(dto.legalRepName),
        responsibilities, // si viene, se asigna; si no, no cambia
        document:
          dto.document === undefined
            ? undefined
            : this.normalizeDocument(dto.document),
        name: dto.name ?? undefined,
        email: dto.email === undefined ? undefined : this.nullable(dto.email),
        phone: dto.phone === undefined ? undefined : this.nullable(dto.phone),
        address:
          dto.address === undefined ? undefined : this.nullable(dto.address),
        city: dto.city === undefined ? undefined : this.nullable(dto.city),
        paymentTermsDays:
          dto.paymentTermsDays === undefined ? undefined : dto.paymentTermsDays,
        active: dto.active ?? undefined,

        fiscalRegime,
        isWithholdingAgent:
          dto.isWithholdingAgent ?? before.isWithholdingAgent ?? false,
        ciiuCode,
        municipalityCode,
        taxProfile,
        defaultVatId,
        receivableAccountCode: computedReceivable,
        payableAccountCode: computedPayable,
        clientReceivableAccountCode,
        providerPayableAccountCode,
        employeePayableAccountCode,
        otherReceivableAccountCode,
        otherPayableAccountCode,
      };

      const after = await this.prisma.thirdParty.update({
        where: { id },
        data,
      });

      await this.audit.log({
        entity: 'ThirdParty',
        entityId: id,
        action: 'UPDATE',
        userId,
        changes: { before, after },
      });

      return after;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('El documento ya está registrado');
      }
      throw e;
    }
  }

  async remove(id: number, userId?: number) {
    const before = await this.prisma.thirdParty.findUnique({ where: { id } });
    if (!before || !before.active)
      throw new NotFoundException('Tercero no encontrado');

    const after = await this.prisma.thirdParty.update({
      where: { id },
      data: { active: false },
    });

    await this.audit.log({
      entity: 'ThirdParty',
      entityId: id,
      action: 'DELETE',
      userId,
      changes: { before, after },
    });

    return { ok: true };
  }

  private defaultTaxProfile(type: PartyType): TaxProfile {
    if (type === 'CLIENT' || type === 'PROVIDER')
      return TaxProfile.IVA_RESPONSABLE;
    return TaxProfile.NA;
  }

  private roleHasReceivable(role: PartyType): boolean {
    return ROLES_WITH_RECEIVABLE.has(role);
  }

  private roleHasPayable(role: PartyType): boolean {
    return ROLES_WITH_PAYABLE.has(role);
  }

  private computeRoleAccountColumns(params: {
    roles: PartyType[];
    primaryRole: PartyType;
    input?: RoleAccountInput;
    previous?: RoleAccountColumns | null;
    fallbackReceivable?: string | null | undefined;
    fallbackPayable?: string | null | undefined;
  }): {
    columns: RoleAccountColumns;
    generalReceivable: string | null;
    generalPayable: string | null;
  } {
    const {
      roles,
      primaryRole,
      input,
      previous,
      fallbackReceivable,
      fallbackPayable,
    } = params;

    const roleSet = new Set<PartyType>(roles);
    const source = input ?? {};
    const prev = previous ?? null;

    const clientReceivableAccountCode = roleSet.has(PartyType.CLIENT)
      ? this.pickAccountValue({
          requested: (source as any).clientReceivableAccountCode,
          previous: prev?.clientReceivableAccountCode,
          fallback: fallbackReceivable,
          defaultValue: this.defaultReceivableAccount([PartyType.CLIENT]),
        })
      : null;

    const providerPayableAccountCode = roleSet.has(PartyType.PROVIDER)
      ? this.pickAccountValue({
          requested: (source as any).providerPayableAccountCode,
          previous: prev?.providerPayableAccountCode,
          fallback: fallbackPayable,
          defaultValue: this.defaultPayableAccount([PartyType.PROVIDER]),
        })
      : null;

    const employeePayableAccountCode = roleSet.has(PartyType.EMPLOYEE)
      ? this.pickAccountValue({
          requested: (source as any).employeePayableAccountCode,
          previous: prev?.employeePayableAccountCode,
          fallback: fallbackPayable,
          defaultValue: this.defaultPayableAccount([PartyType.EMPLOYEE]),
        })
      : null;

    const otherReceivableAccountCode = roleSet.has(PartyType.OTHER)
      ? this.pickAccountValue({
          requested: (source as any).otherReceivableAccountCode,
          previous: prev?.otherReceivableAccountCode,
          fallback: fallbackReceivable,
          defaultValue: this.defaultReceivableAccount([PartyType.OTHER]),
        })
      : null;

    const otherPayableAccountCode = roleSet.has(PartyType.OTHER)
      ? this.pickAccountValue({
          requested: (source as any).otherPayableAccountCode,
          previous: prev?.otherPayableAccountCode,
          fallback: fallbackPayable,
          defaultValue: this.defaultPayableAccount([PartyType.OTHER]),
        })
      : null;

    const columns: RoleAccountColumns = {
      clientReceivableAccountCode,
      providerPayableAccountCode,
      employeePayableAccountCode,
      otherReceivableAccountCode,
      otherPayableAccountCode,
    };

    const perRoleReceivable: Partial<Record<PartyType, string | null>> = {
      [PartyType.CLIENT]: clientReceivableAccountCode,
      [PartyType.OTHER]: otherReceivableAccountCode,
    };

    const perRolePayable: Partial<Record<PartyType, string | null>> = {
      [PartyType.PROVIDER]: providerPayableAccountCode,
      [PartyType.EMPLOYEE]: employeePayableAccountCode,
      [PartyType.OTHER]: otherPayableAccountCode,
    };

    const generalReceivable = this.pickGeneralAccount({
      primaryRole,
      roles,
      perRole: perRoleReceivable,
      explicit: fallbackReceivable,
      fallback: this.defaultReceivableAccount(roles),
    });

    const generalPayable = this.pickGeneralAccount({
      primaryRole,
      roles,
      perRole: perRolePayable,
      explicit: fallbackPayable,
      fallback: this.defaultPayableAccount(roles),
    });

    return { columns, generalReceivable, generalPayable };
  }

  private pickAccountValue(params: {
    requested?: string | null;
    previous?: string | null;
    fallback?: string | null | undefined;
    defaultValue: string | null;
  }): string | null {
    const { requested, previous, fallback, defaultValue } = params;

    if (requested !== undefined) return this.nullable(requested);
    if (fallback !== undefined) return this.nullable(fallback ?? null);
    if (previous !== undefined) return this.nullable(previous);
    return this.nullable(defaultValue ?? null);
  }

  private pickGeneralAccount(params: {
    primaryRole: PartyType;
    roles: PartyType[];
    perRole: Partial<Record<PartyType, string | null>>;
    explicit?: string | null | undefined;
    fallback: string | null;
  }): string | null {
    const { primaryRole, roles, perRole, explicit, fallback } = params;
    const order: PartyType[] = [];

    const addRole = (role: PartyType) => {
      if (!order.includes(role)) order.push(role);
    };

    addRole(primaryRole);
    for (const role of roles) addRole(role);
    for (const role of ORDERED_ROLES) addRole(role);

    for (const role of order) {
      const candidate = perRole[role];
      if (candidate) return candidate;
    }

    if (explicit !== undefined) return this.nullable(explicit ?? null);
    return this.nullable(fallback ?? null);
  }

  private defaultFiscalRegime(taxProfile: TaxProfile): FiscalRegime {
    return taxProfile === TaxProfile.IVA_RESPONSABLE
      ? FiscalRegime.RESPONSABLE_IVA
      : FiscalRegime.NO_RESPONSABLE_IVA;
  }

  private normalizeRoles(
    raw: (PartyType | string)[] | undefined,
    primary: PartyType,
    fallback?: PartyType[],
  ): PartyType[] {
    const normalized: PartyType[] = [];

    const push = (value: any) => {
      const role = value as PartyType | undefined;
      if (!role) return;
      if (!PARTY_ROLE_VALUES.has(role)) return;
      if (!normalized.includes(role)) normalized.push(role);
    };

    push(primary);

    const source =
      Array.isArray(raw) && raw.length > 0
        ? raw
        : Array.isArray(fallback) && fallback.length > 0
          ? fallback
          : [];

    for (const role of source) push(role);

    if (!normalized.length) push(primary);

    return normalized.length ? normalized : [primary];
  }

  private defaultReceivableAccount(roles: PartyType[]): string {
    for (const role of RECEIVABLE_PRIORITY) {
      if (roles.includes(role)) {
        return ACCOUNTS.ar;
      }
    }
    return ACCOUNTS.ar;
  }

  private defaultPayableAccount(roles: PartyType[]): string {
    for (const role of PAYABLE_PRIORITY) {
      if (roles.includes(role)) {
        return ACCOUNTS.ap;
      }
    }
    return ACCOUNTS.ap;
  }

  private nullable(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private normalizeDocument(value?: string | null): string | null {
    const doc = this.nullable(value);
    return doc ? doc.toUpperCase() : null;
  }

  private normalizeCode(value?: string | null): string | null {
    const code = this.nullable(value);
    return code ? code.toUpperCase() : null;
  }

  private normalizeMunicipality(value?: string | null): string | null {
    const code = this.nullable(value);
    if (!code) return null;
    const digits = code.replace(/[^0-9]/g, '');
    return digits.length ? digits.padStart(5, '0').slice(0, 5) : null;
  }

  private async resolveDefaultVatId(params: {
    incoming?: number | null;
    current?: number | null;
    taxProfile: TaxProfile;
  }): Promise<number | null> {
    const { incoming, current, taxProfile } = params;
    if (taxProfile !== TaxProfile.IVA_RESPONSABLE) return null;
    if (incoming === null) return null;
    if (incoming !== undefined) {
      await this.ensureTaxExists(incoming);
      return incoming;
    }
    if (current != null) return current;
    return this.findTaxIdByCode('IVA19');
  }

  private async ensureTaxExists(id: number) {
    const exists = await this.prisma.tax.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Tax ${id} no existe`);
  }

  private async findTaxIdByCode(code: string): Promise<number | null> {
    const tax = await this.prisma.tax.findUnique({
      where: { code },
      select: { id: true },
    });
    return tax?.id ?? null;
  }
}
