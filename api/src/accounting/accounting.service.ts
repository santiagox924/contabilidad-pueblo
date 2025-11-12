// api/src/accounting/accounting.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ItemType,
  PartyType,
  PaymentType,
  Prisma,
  StockAdjustmentReason,
  WithholdingType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTS } from './config/accounts.map';
import { AccountSettingsService } from './config/account-settings.service';
import {
  NIIF_BALANCE_STRUCTURE,
  NIIF_CASH_FLOW_STRUCTURE,
  NIIF_INCOME_STRUCTURE,
  NIIF_DEFAULT_CURRENCY,
  NiifNodeConfig,
  NiifMatcher,
} from './config/niif-structure';
import { ClosePeriodDto } from './dto/close-period.dto';
import { CloseYearDto } from './dto/close-year.dto';
import { CreateManualEntryDto } from './dto/create-manual-entry.dto';
import {
  CreateJournalEntryDto,
  JournalEntryLineDto,
  JournalListDto,
  UpdateJournalEntryDto,
} from './dto/journal-entry.dto';
import { LockPeriodDto } from './dto/lock-period.dto';
import { MassReversePeriodDto } from './dto/mass-reverse-period.dto';
import { OpenPeriodDto } from './dto/open-period.dto';
import { ReconcileStatementDto } from './dto/reconcile-statement.dto';
import {
  AuxLedgerAccountQueryDto,
  AuxLedgerCostCenterQueryDto,
  AuxLedgerThirdPartyQueryDto,
  GeneralJournalQueryDto,
  JournalStatusDto,
} from './dto/books.dto';
import {
  DIAN_MAGNETIC_FORMAT_CODES,
  DianMagneticFormatCode,
} from './dto/regulatory.dto';
import {
  NiifBalanceQueryDto,
  NiifIncomeQueryDto,
  NiifCashFlowQueryDto,
  NiifBalanceStatementDto,
  NiifIncomeStatementDto,
  NiifCashFlowStatementDto,
  NiifStatementNodeDto,
  NiifStatementResponseMeta,
} from './dto/niif-statements.dto';

const ROLE_LOOKUP_ORDER: PartyType[] = [
  PartyType.CLIENT,
  PartyType.PROVIDER,
  PartyType.EMPLOYEE,
  PartyType.OTHER,
];

type Dt = Date | string;

export type AccountingLineInput = {
  accountCode: string;
  debit?: number | Prisma.Decimal | null;
  credit?: number | Prisma.Decimal | null;
  thirdPartyId?: number | null;
  costCenterId?: number | null;
  description?: string | null;
};

export type AccountingEntryInput = {
  date: Date;
  sourceType: string;
  sourceId: number;
  description?: string | null;
  lines: AccountingLineInput[];
  status?: 'DRAFT' | 'POSTED';
  journalCodeOverride?: string;
  paymentMethodId?: number | null;
};

type VatProfile = 'GRAVADO' | 'EXCLUIDO' | 'EXENTO' | 'NO_CAUSA';
type VatKind = 'SALES' | 'PURCHASES';
type AgingScope = 'AR' | 'AP';

type BookAggRow = {
  date: string;
  number: string | number;
  thirdPartyId: string | number;
  thirdPartyName: string;
  thirdPartyDocument: string;
  thirdPartyDv: string | null;
  thirdPartyIdType: string | null;
  taxBase: number;
  vatByRate: Record<string, number>;
  withholdings: number;
  total: number;
};

type DianVatScope = 'SALES' | 'PURCHASES';

type DianVatRow = {
  date: string;
  documentNumber: string | number;
  thirdPartyId: string | number;
  thirdPartyDocument: string;
  thirdPartyDv: string | null;
  thirdPartyIdType: string | null;
  thirdPartyName: string;
  taxBase: number;
  vatByRate: Record<string, number>;
  vatTotal: number;
  withholdings: number;
  total: number;
};

type DianWithholdingScope = 'SALES' | 'PURCHASES';

type DianWithholdingRow = {
  date: string;
  documentNumber: string | number | null;
  invoiceId: number | null;
  invoiceType: DianWithholdingScope;
  thirdPartyId: number | string | null;
  thirdPartyDocument: string;
  thirdPartyDv: string | null;
  thirdPartyIdType: string | null;
  thirdPartyName: string;
  withholdingType: WithholdingType;
  ruleId: number | null;
  ruleCiiuCode: string | null;
  ruleMunicipalityCode: string | null;
  base: number;
  ratePct: number | null;
  amount: number;
};

type DianWithholdingTotals = {
  base: number;
  amount: number;
  count: number;
  byType: Partial<Record<WithholdingType, { base: number; amount: number }>>;
};

type DianWithholdingReport = {
  from: string | null | Date;
  to: string | null | Date;
  scope: DianWithholdingScope;
  typeFilter: WithholdingType | null;
  rows: DianWithholdingRow[];
  totals: DianWithholdingTotals;
};

type DianVatReport = {
  from: Date | null;
  to: Date | null;
  scope: DianVatScope;
  rows: DianVatRow[];
  totals: {
    taxBase: number;
    vatTotal: number;
    withholdings: number;
    total: number;
    vatByRate: Record<string, number>;
  };
};

type DianMagneticFormatReport = {
  code: DianMagneticFormatCode;
  columns: string[];
  rows: Array<Record<string, any>>;
  totals: Record<string, number>;
};

type DianMagneticReport = {
  year: number;
  from: Date | null;
  to: Date | null;
  formats: Partial<Record<DianMagneticFormatCode, DianMagneticFormatReport>>;
};

type GeneralJournalRow = {
  entryId: number;
  entryDate: Date;
  entryStatus: string;
  journalCode: string;
  journalName: string | null;
  entryNumber: number | null;
  sourceType: string;
  sourceId: number | string | null;
  accountCode: string;
  accountName: string;
  accountNature: string;
  lineId: number;
  lineDescription: string | null;
  entryDescription: string | null;
  thirdPartyId: number | null;
  thirdPartyDocument: string | null;
  thirdPartyName: string | null;
  costCenterId: number | null;
  costCenterCode: string | null;
  costCenterName: string | null;
  debit: number;
  credit: number;
};

type AuxLedgerRow = GeneralJournalRow & {
  balance: number;
};

type LedgerFilters = {
  status?: JournalStatusDto;
  journalCode?: string;
  thirdPartyId?: number;
  costCenterId?: number;
  accountCode?: string;
};

type JournalEntryLineWithRefs = {
  id: number;
  accountCode: string;
  debit: Prisma.Decimal | number | null;
  credit: Prisma.Decimal | number | null;
  description: string | null;
  thirdPartyId: number | null;
  costCenterId: number | null;
  account?: { id: number; code: string; name: string; nature: string } | null;
  thirdParty?: { id: number; name: string; document: string | null } | null;
  costCenter?: { id: number; code: string; name: string } | null;
};

type JournalEntryWithDetail = {
  id: number;
  date: Date;
  status: string;
  number: string | number | null;
  sourceType: string;
  sourceId: number | string | null;
  description: string | null;
  journal?: { id: number; code: string; name: string } | null;
  period?: { id: number; year: number; month: number; status: string } | null;
  lines: JournalEntryLineWithRefs[];
};

type JournalEntryWithAggregates = {
  id: number;
  date: Date;
  status: string;
  number: string | number | null;
  sourceType: string;
  sourceId: number | string | null;
  description: string | null;
  journal?: { id: number; code: string; name: string } | null;
  lines: Array<{
    debit: Prisma.Decimal | number | null;
    credit: Prisma.Decimal | number | null;
  }>;
};
type RawInvoice = {
  id: number;
  number: string | number | null;
  issueDate: Date | string | null;
  thirdPartyId: number | null;
  thirdParty?: {
    id: number;
    name: string;
    document: string | null;
    idType: string;
    personKind: string;
    type: string;
  } | null;
  subtotal?: Prisma.Decimal | number | null;
  total?: Prisma.Decimal | number | null;
  taxes?: Array<{
    ratePct: Prisma.Decimal | number | string | null;
    amount: Prisma.Decimal | number | null;
    base: Prisma.Decimal | number | null;
  }>;
  withholdings?: Array<{
    type: string;
    amount: Prisma.Decimal | number | null;
  }>;
};

type AccountAggregate = {
  code: string;
  name: string;
  nature: string;
  debit: number;
  credit: number;
  balance: number;
};

type StatementBuildContext = {
  current: Map<string, AccountAggregate>;
  previous?: Map<string, AccountAggregate>;
  assignedCurrent: Set<string>;
  assignedPrevious: Set<string>;
};

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountSettings: AccountSettingsService,
  ) {}

  // ------------------------------
  // Utils
  // ------------------------------
  private num(x: unknown): number {
    if (x == null) return 0;
    if (x instanceof Prisma.Decimal) return x.toNumber();
    const anyX = x as any;
    if (anyX && typeof anyX.toNumber === 'function') return anyX.toNumber();
    const n = Number(anyX);
    return Number.isFinite(n) ? n : 0;
  }

  private parseRange(from?: Dt, to?: Dt) {
    const gte = from ? new Date(from) : new Date('1970-01-01');
    const lte = to ? new Date(to) : new Date();
    if (isNaN(gte.getTime()) || isNaN(lte.getTime())) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    return { gte, lte };
  }

  private normalizeJournalLines(
    raw: JournalEntryLineDto[],
  ): AccountingLineInput[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('Debe enviar al menos una línea contable');
    }

    return raw.map((line, idx) => {
      const accountCode = String(line.accountCode ?? '').trim();
      if (!accountCode) {
        throw new BadRequestException(
          `Línea ${idx + 1}: cuenta contable requerida`,
        );
      }

      const debit = line.debit != null ? Number(line.debit) : 0;
      const credit = line.credit != null ? Number(line.credit) : 0;
      if (!Number.isFinite(debit) || debit < 0) {
        throw new BadRequestException(`Línea ${idx + 1}: débito inválido`);
      }
      if (!Number.isFinite(credit) || credit < 0) {
        throw new BadRequestException(`Línea ${idx + 1}: crédito inválido`);
      }
      if (debit > 0 && credit > 0) {
        throw new BadRequestException(
          `Línea ${idx + 1}: sólo debe tener valor en débito o crédito`,
        );
      }
      if (debit === 0 && credit === 0) {
        throw new BadRequestException(
          `Línea ${idx + 1}: indica un valor en débito o crédito`,
        );
      }

      const thirdPartyId =
        line.thirdPartyId != null ? Number(line.thirdPartyId) : null;
      if (
        thirdPartyId != null &&
        (!Number.isInteger(thirdPartyId) || thirdPartyId <= 0)
      ) {
        throw new BadRequestException(`Línea ${idx + 1}: tercero inválido`);
      }

      return {
        accountCode,
        debit: Math.round(debit * 100) / 100,
        credit: Math.round(credit * 100) / 100,
        thirdPartyId,
        costCenterId: null,
        description: line.description
          ? String(line.description).trim() || null
          : null,
      };
    });
  }

  private ensureLinesBalanced(lines: AccountingLineInput[]) {
    if (lines.length < 2) {
      throw new BadRequestException(
        'El asiento debe tener al menos dos líneas',
      );
    }

    const D = Prisma.Decimal;
    const totalDebit = lines.reduce(
      (acc, l) => acc.plus(new D(l.debit ?? 0)),
      new D(0),
    );
    const totalCredit = lines.reduce(
      (acc, l) => acc.plus(new D(l.credit ?? 0)),
      new D(0),
    );
    if (!totalDebit.eq(totalCredit)) {
      throw new BadRequestException(
        'El asiento no está balanceado (débitos ≠ créditos)',
      );
    }
  }

  private computeTotals(lines: Array<{ debit: any; credit: any }>) {
    return lines.reduce(
      (acc, l) => {
        acc.debit += this.num(l.debit);
        acc.credit += this.num(l.credit);
        return acc;
      },
      { debit: 0, credit: 0 },
    );
  }

  private mapJournalEntry(entry: JournalEntryWithDetail) {
    const totals = this.computeTotals(entry.lines);
    return {
      id: entry.id,
      date: entry.date,
      status: entry.status,
      number: entry.number,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      description: entry.description ?? null,
      journal: entry.journal
        ? {
            id: entry.journal.id,
            code: entry.journal.code,
            name: entry.journal.name,
          }
        : null,
      period: entry.period
        ? {
            id: entry.period.id,
            year: entry.period.year,
            month: entry.period.month,
            status: entry.period.status,
          }
        : null,
      totals,
      lines: entry.lines.map((ln: JournalEntryLineWithRefs) => ({
        id: ln.id,
        accountCode: ln.accountCode,
        accountName: ln.account?.name ?? null,
        thirdParty: ln.thirdParty
          ? {
              id: ln.thirdParty.id,
              name: ln.thirdParty.name,
              document: ln.thirdParty.document ?? null,
            }
          : null,
        costCenter: ln.costCenter
          ? {
              id: ln.costCenter.id,
              code: ln.costCenter.code,
              name: ln.costCenter.name,
            }
          : null,
        debit: this.num(ln.debit),
        credit: this.num(ln.credit),
        description: ln.description ?? null,
      })),
    };
  }

  private mapJournalEntrySummary(entry: JournalEntryWithAggregates) {
    const totals = this.computeTotals(entry.lines);
    return {
      id: entry.id,
      date: entry.date,
      status: entry.status,
      number: entry.number,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      description: entry.description ?? null,
      journal: entry.journal
        ? {
            id: entry.journal.id,
            code: entry.journal.code,
            name: entry.journal.name,
          }
        : null,
      totals,
    };
  }

  private accountBalance(nature: string, debit: number, credit: number) {
    return nature === 'C' ? credit - debit : debit - credit;
  }

  private round2(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toIso(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private previousInstant(date: Date) {
    return new Date(date.getTime() - 1);
  }

  private matchesNiif(code: string, matcher: NiifMatcher): boolean {
    if (matcher.codes && matcher.codes.includes(code)) return true;
    if (
      matcher.prefixes &&
      matcher.prefixes.some((prefix) => code.startsWith(prefix))
    ) {
      if (matcher.excludePrefixes?.some((ex) => code.startsWith(ex))) {
        return false;
      }
      return true;
    }
    return false;
  }

  private firstDayOfYear(date: Date) {
    return new Date(date.getFullYear(), 0, 1);
  }

  private buildDateFilter(range: { gte?: Date; lte?: Date }) {
    const filter: Prisma.DateTimeFilter = {};
    if (range.gte) filter.gte = range.gte;
    if (range.lte) filter.lte = range.lte;
    return filter;
  }

  private normalizeStatus(status?: JournalStatusDto) {
    return status ?? JournalStatusDto.POSTED;
  }

  private buildJournalLineWhere(
    range: { gte?: Date; lte?: Date },
    filters: LedgerFilters,
  ): Prisma.JournalLineWhereInput {
    const status = this.normalizeStatus(filters.status);
    const entryWhere: Prisma.JournalEntryWhereInput = {
      date: this.buildDateFilter(range),
      status,
    };

    if (filters.journalCode) {
      entryWhere.journal = { code: filters.journalCode } as any;
    }

    const where: Prisma.JournalLineWhereInput = {
      entry: { is: entryWhere } as any,
    };

    if (filters.thirdPartyId != null) where.thirdPartyId = filters.thirdPartyId;
    if (filters.costCenterId != null) where.costCenterId = filters.costCenterId;
    if (filters.accountCode) where.accountCode = filters.accountCode;

    return where;
  }

  private mapLineToRow(line: {
    id: number;
    debit: Prisma.Decimal | number | null;
    credit: Prisma.Decimal | number | null;
    description: string | null;
    accountCode: string;
    account?: { code: string; name: string; nature: string } | null;
    thirdParty?: { id: number; document: string | null; name: string } | null;
    costCenter?: { id: number; code: string; name: string } | null;
    entry: {
      id: number;
      date: Date;
      status: string;
      number: number | null;
      sourceType: string;
      sourceId: number | string | null;
      description: string | null;
      journal: { code: string; name: string | null } | null;
    };
  }): GeneralJournalRow {
    const accountCode = line.account?.code ?? line.accountCode;
    const accountName = line.account?.name ?? '';
    const accountNature = line.account?.nature ?? 'D';
    return {
      entryId: line.entry.id,
      entryDate: line.entry.date,
      entryStatus: line.entry.status,
      journalCode: line.entry.journal?.code ?? 'GENERAL',
      journalName: line.entry.journal?.name ?? null,
      entryNumber: line.entry.number ?? null,
      sourceType: line.entry.sourceType,
      sourceId: line.entry.sourceId,
      accountCode,
      accountName,
      accountNature,
      lineId: line.id,
      lineDescription: line.description ?? null,
      entryDescription: line.entry.description ?? null,
      thirdPartyId: line.thirdParty?.id ?? null,
      thirdPartyDocument: line.thirdParty?.document ?? null,
      thirdPartyName: line.thirdParty?.name ?? null,
      costCenterId: line.costCenter?.id ?? null,
      costCenterCode: line.costCenter?.code ?? null,
      costCenterName: line.costCenter?.name ?? null,
      debit: this.num(line.debit),
      credit: this.num(line.credit),
    };
  }

  private async fetchLedgerRows(
    range: { gte: Date; lte: Date },
    filters: LedgerFilters,
  ) {
    const lines = await this.prisma.journalLine.findMany({
      where: this.buildJournalLineWhere(range, filters),
      orderBy: [
        { entry: { date: 'asc' } },
        { entry: { number: 'asc' } },
        { id: 'asc' },
      ],
      select: {
        id: true,
        debit: true,
        credit: true,
        description: true,
        accountCode: true,
        account: { select: { code: true, name: true, nature: true } },
        thirdParty: { select: { id: true, document: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        entry: {
          select: {
            id: true,
            date: true,
            status: true,
            number: true,
            sourceType: true,
            sourceId: true,
            description: true,
            journal: { select: { code: true, name: true } },
          },
        },
      },
    });

    return lines.map((line) => this.mapLineToRow(line));
  }

  private async computeOpeningMap(rangeStart: Date, filters: LedgerFilters) {
    const before = this.previousInstant(rangeStart);
    const where = this.buildJournalLineWhere({ lte: before }, filters);

    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountCode'],
      where,
      _sum: { debit: true, credit: true },
    });

    if (!grouped.length)
      return new Map<
        string,
        { balance: number; name: string; nature: string }
      >();

    const accounts = await this.prisma.coaAccount.findMany({
      where: { code: { in: grouped.map((g) => g.accountCode) } },
      select: { code: true, name: true, nature: true },
    });
    const accMeta = new Map(accounts.map((acc) => [acc.code, acc]));

    const result = new Map<
      string,
      { balance: number; name: string; nature: string }
    >();
    for (const item of grouped) {
      const meta = accMeta.get(item.accountCode);
      const nature = meta?.nature ?? 'D';
      const name = meta?.name ?? '';
      const sumDebit = this.num(item._sum?.debit);
      const sumCredit = this.num(item._sum?.credit);
      const balance = this.accountBalance(nature, sumDebit, sumCredit);
      result.set(item.accountCode, { balance, name, nature });
    }
    return result;
  }

  private async collectAccountAggregates(
    dateFilter: { gte?: Date; lte?: Date },
    predicate?: (code: string) => boolean,
  ) {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: {
          status: 'POSTED',
          date: this.buildDateFilter(dateFilter),
        },
      },
      select: {
        accountCode: true,
        debit: true,
        credit: true,
        account: {
          select: { code: true, name: true, nature: true },
        },
      },
    });

    const map = new Map<string, AccountAggregate>();
    for (const line of lines) {
      const code = line.account?.code ?? line.accountCode;
      if (predicate && !predicate(code)) continue;
      const current = map.get(code) ?? {
        code,
        name: line.account?.name ?? '',
        nature: line.account?.nature ?? 'D',
        debit: 0,
        credit: 0,
        balance: 0,
      };
      current.debit += this.num(line.debit);
      current.credit += this.num(line.credit);
      map.set(code, current);
    }

    for (const agg of map.values()) {
      agg.balance = this.accountBalance(agg.nature, agg.debit, agg.credit);
    }

    return map;
  }

  private async cashBalanceAsOf(date: Date) {
    const map = await this.collectAccountAggregates({ lte: date }, (code) =>
      code.startsWith('11'),
    );
    let total = 0;
    for (const agg of map.values()) total += agg.balance;
    return this.round2(total);
  }

  private async computeCashDelta(from: Date, to: Date) {
    const openingDate = this.previousInstant(from);
    const opening = await this.cashBalanceAsOf(openingDate);
    const closing = await this.cashBalanceAsOf(to);
    const delta = this.round2(closing - opening);
    return { opening, closing, delta };
  }

  private collectMatches(
    node: NiifNodeConfig,
    ctx: StatementBuildContext,
  ): { current: number; previous: number } {
    if (!node.matchers?.length) {
      return { current: 0, previous: 0 };
    }

    const allCodes = new Set<string>();
    for (const code of ctx.current.keys()) allCodes.add(code);
    if (ctx.previous) {
      for (const code of ctx.previous.keys()) allCodes.add(code);
    }

    let currentAmount = 0;
    let previousAmount = 0;
    const multiplier = node.multiplier ?? 1;

    for (const code of allCodes) {
      const matches = node.matchers.some((matcher) =>
        this.matchesNiif(code, matcher),
      );
      if (!matches) continue;

      if (!ctx.assignedCurrent.has(code) && ctx.current.has(code)) {
        currentAmount += (ctx.current.get(code)?.balance ?? 0) * multiplier;
        ctx.assignedCurrent.add(code);
      }

      if (
        ctx.previous &&
        !ctx.assignedPrevious.has(code) &&
        ctx.previous.has(code)
      ) {
        previousAmount += (ctx.previous.get(code)?.balance ?? 0) * multiplier;
        ctx.assignedPrevious.add(code);
      }
    }

    return { current: currentAmount, previous: previousAmount };
  }

  private buildNiifNode(
    node: NiifNodeConfig,
    ctx: StatementBuildContext,
    includePrevious: boolean,
  ): NiifStatementNodeDto {
    const children = node.children
      ?.map((child) => this.buildNiifNode(child, ctx, includePrevious))
      .filter((child) => child); // mantiene nodos aún con valor cero

    const matchResult = this.collectMatches(node, ctx);

    const childCurrent = children?.reduce((sum, c) => sum + c.amount, 0) ?? 0;
    const childPrev =
      children?.reduce((sum, c) => sum + (c.previousAmount ?? 0), 0) ?? 0;

    const amount = this.round2(childCurrent + matchResult.current);
    const previous = includePrevious
      ? this.round2(childPrev + matchResult.previous)
      : undefined;

    const result: NiifStatementNodeDto = {
      id: node.id,
      label: node.label,
      amount,
      notes: node.notes,
    };

    if (children && children.length) {
      result.children = children;
    }

    if (includePrevious) {
      result.previousAmount = previous ?? 0;
    }

    return result;
  }

  private buildNiifTree(
    configs: NiifNodeConfig[],
    ctx: StatementBuildContext,
    includePrevious: boolean,
  ) {
    return configs.map((node) =>
      this.buildNiifNode(node, ctx, includePrevious),
    );
  }

  private buildUnmappedMeta(
    ctx: StatementBuildContext,
    predicate?: (code: string) => boolean,
  ): NiifStatementResponseMeta | undefined {
    const build = (
      map: Map<string, AccountAggregate>,
      assigned: Set<string>,
    ) => {
      const rows = [] as { code: string; name: string; balance: number }[];
      for (const agg of map.values()) {
        if (predicate && !predicate(agg.code)) continue;
        if (assigned.has(agg.code)) continue;
        if (Math.abs(agg.balance) < 0.005) continue;
        rows.push({
          code: agg.code,
          name: agg.name,
          balance: this.round2(agg.balance),
        });
      }
      return rows.sort((a, b) => a.code.localeCompare(b.code));
    };

    const current = build(ctx.current, ctx.assignedCurrent);
    const previous = ctx.previous
      ? build(ctx.previous, ctx.assignedPrevious)
      : [];

    if (!current.length && (!ctx.previous || !previous.length)) {
      return undefined;
    }

    return {
      unmapped: {
        current,
        previous,
      },
    };
  }

  private findNodeAmount(nodes: NiifStatementNodeDto[], id: string): number {
    for (const node of nodes) {
      if (node.id === id) return node.amount;
      if (node.children?.length) {
        const found = this.findNodeAmount(node.children, id);
        if (Number.isFinite(found)) return found;
      }
    }
    return 0;
  }

  private startOfMonth(y: number, m: number) {
    return new Date(y, m - 1, 1, 0, 0, 0, 0);
  }
  private endOfMonth(y: number, m: number) {
    return new Date(y, m, 0, 23, 59, 59, 999);
  }

  // ------------------------------
  // Periods & numbering helpers
  // ------------------------------
  private async assertOpenPeriod(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const period = (await this.prisma.accountingPeriod.findFirst({
      where: { year, month, type: 'REGULAR' } as any,
    })) as any;

    if (!period) return;

    if (period.status === 'CLOSED' || period.status === 'LOCKED') {
      throw new BadRequestException(
        `El período ${year}-${String(month).padStart(2, '0')} está ${period.status}`,
      );
    }

    if (period.allowBackPostUntil && date > period.allowBackPostUntil) {
      throw new BadRequestException(
        `El período ${year}-${String(month).padStart(2, '0')} ya no permite registrar movimientos con fecha ${date.toISOString().slice(0, 10)}`,
      );
    }
  }

  private async getOrCreatePeriodByDate(
    tx: Prisma.TransactionClient,
    date: Date,
  ) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const start = this.startOfMonth(year, month);
    const end = this.endOfMonth(year, month);
    const period = await tx.accountingPeriod.upsert({
      where: { year_month_type: { year, month, type: 'REGULAR' } } as any,
      update: { start, end } as any,
      create: {
        year,
        month,
        type: 'REGULAR',
        start,
        end,
        status: 'OPEN',
      } as any,
    } as any);
    return period;
  }

  private journalCodeFor(sourceType: string): string {
    if (sourceType.startsWith('SALE')) return 'SALES';
    if (sourceType.startsWith('PURCHASE')) return 'PURCHASES';
    if (sourceType.startsWith('CASH_') || sourceType.startsWith('VENDOR_'))
      return 'TREASURY';
    if (sourceType.startsWith('STOCK') || sourceType.startsWith('INVENTORY'))
      return 'INVENTORY';
    return 'GENERAL';
  }

  private async getOrCreateJournalByCode(
    tx: Prisma.TransactionClient,
    code: string,
  ) {
    const found = await tx.journal.findUnique({ where: { code } });
    if (found) return found;
    return tx.journal.create({
      data: {
        code,
        name: code.charAt(0) + code.slice(1).toLowerCase(),
        isActive: true,
      },
    });
  }

  private async allocateNumber(
    tx: Prisma.TransactionClient,
    periodId: number,
    date: Date,
    journalId: number,
  ): Promise<{ number: number; display: string }> {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const seq = await tx.journalSequence.upsert({
      where: { year_month_journalId: { year: y, month: m, journalId } as any },
      update: { current: { increment: 1 } },
      create: { year: y, month: m, journalId, current: 1 },
    });
    const n = seq.current;
    const display = `${y}-${String(m).padStart(2, '0')}/${String(n).padStart(6, '0')}`;
    return { number: n, display };
  }

  private async log(
    action: string,
    entity: string,
    entityId: number,
    changes?: any,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          entity,
          entityId,
          changes: changes ?? null,
        },
      });
    } catch {
      // no-op
    }
  }

  // ------------------------------
  // Account resolution helpers
  // ------------------------------
  private async resolveIncomeAccountCode(itemId?: number | null) {
    if (itemId) {
      const item = await this.prisma.item.findUnique({
        where: { id: itemId },
        select: {
          incomeAccountCode: true,
          category: { select: { incomeAccountCode: true } },
        },
      });
      if (item?.incomeAccountCode) return item.incomeAccountCode;
      if (item?.category?.incomeAccountCode)
        return item.category.incomeAccountCode;
    }
    return this.accountSettings.getAccountCodeSync('salesIncome');
  }

  private async resolveExpenseOrCogsAccountCode(itemId?: number | null) {
    if (itemId) {
      const item = await this.prisma.item.findUnique({
        where: { id: itemId },
        select: {
          expenseAccountCode: true,
          category: { select: { expenseAccountCode: true } },
        },
      });
      if (item?.expenseAccountCode) return item.expenseAccountCode;
      if (item?.category?.expenseAccountCode)
        return item.category.expenseAccountCode;
    }
    const cogs = this.accountSettings.getAccountCodeSync('cogs');
    const expense = this.accountSettings.getAccountCodeSync('purchaseExpense');
    return cogs ?? expense;
  }

  private async resolveInventoryAccountCode(itemId?: number | null) {
    if (itemId) {
      const item = await this.prisma.item.findUnique({
        where: { id: itemId },
        select: {
          inventoryAccountCode: true,
          category: { select: { inventoryAccountCode: true } },
        },
      });
      if (item?.inventoryAccountCode) return item.inventoryAccountCode;
      if (item?.category?.inventoryAccountCode)
        return item.category.inventoryAccountCode;
    }
    return this.accountSettings.getAccountCodeSync('inventory');
  }

  private async resolveVatAccountCode(
    itemId?: number | null,
    type: 'SALE' | 'PURCHASE' = 'SALE',
  ) {
    const salesDefault = this.accountSettings.getAccountCodeSync('salesVat');
    const purchaseDefault = this.accountSettings.getAccountCodeSync('purchaseVat');

    if (itemId) {
      const item = await this.prisma.item.findUnique({
        where: { id: itemId },
        select: {
          taxAccountCode: true,
          purchaseTaxAccountCode: true,
          category: { select: { taxAccountCode: true } },
        },
      });
      // For SALES prefer explicit item/category taxAccountCode when present
      if (type === 'SALE') {
        if (item?.taxAccountCode) return item.taxAccountCode;
        if (item?.category?.taxAccountCode) return item.category.taxAccountCode;
        return salesDefault;
      }

      // For PURCHASE, if item/category explicitly set a tax account that is the
      // same as the sales default, ignore it and use the purchase default so that
      // purchases post to the dedicated purchase VAT account by default.
      if (type === 'PURCHASE') {
        // If the item explicitly sets a purchaseTaxAccountCode, prefer it.
        if (item?.purchaseTaxAccountCode) return item.purchaseTaxAccountCode;
        // Otherwise fall back to explicit taxAccountCode if it does not equal sales default.
        const itemAcct = item?.taxAccountCode ?? item?.category?.taxAccountCode ?? null;
        if (itemAcct && itemAcct !== salesDefault) return itemAcct;
        return purchaseDefault;
      }
    }

    return type === 'SALE' ? salesDefault : purchaseDefault;
  }

  private async resolveReceivableAccountCode(
    thirdPartyId?: number | null,
    role: PartyType = PartyType.CLIENT,
  ): Promise<string> {
    if (thirdPartyId) {
      const tp = (await this.prisma.thirdParty.findUnique({
        where: { id: thirdPartyId },
        select: {
          type: true,
          roles: true,
          receivableAccountCode: true,
          clientReceivableAccountCode: true,
          otherReceivableAccountCode: true,
        } as any,
      })) as any;
      if (tp) {
        const roles = Array.isArray(tp.roles) ? (tp.roles as PartyType[]) : [];
        const lookupOrder = this.buildRoleLookupOrder(
          role,
          roles,
          tp.type as PartyType,
        );
        for (const candidate of lookupOrder) {
          let code: string | null | undefined;
          if (candidate === PartyType.CLIENT) {
            code = tp.clientReceivableAccountCode;
          } else if (candidate === PartyType.OTHER) {
            code = tp.otherReceivableAccountCode;
          } else {
            code = null;
          }
          if (code) return code;
        }
        if (tp.receivableAccountCode) return tp.receivableAccountCode;
      }
    }
    return this.accountSettings.getAccountCodeSync('ar');
  }

  private async resolvePayableAccountCode(
    thirdPartyId?: number | null,
    role: PartyType = PartyType.PROVIDER,
  ): Promise<string> {
    if (thirdPartyId) {
      const tp = (await this.prisma.thirdParty.findUnique({
        where: { id: thirdPartyId },
        select: {
          type: true,
          roles: true,
          payableAccountCode: true,
          providerPayableAccountCode: true,
          employeePayableAccountCode: true,
          otherPayableAccountCode: true,
        } as any,
      })) as any;
      if (tp) {
        const roles = Array.isArray(tp.roles) ? (tp.roles as PartyType[]) : [];
        const lookupOrder = this.buildRoleLookupOrder(
          role,
          roles,
          tp.type as PartyType,
        );
        for (const candidate of lookupOrder) {
          let code: string | null | undefined;
          if (candidate === PartyType.PROVIDER) {
            code = tp.providerPayableAccountCode;
          } else if (candidate === PartyType.EMPLOYEE) {
            code = tp.employeePayableAccountCode;
          } else if (candidate === PartyType.OTHER) {
            code = tp.otherPayableAccountCode;
          } else {
            code = null;
          }
          if (code) return code;
        }
        if (tp.payableAccountCode) return tp.payableAccountCode;
      }
    }
    return this.accountSettings.getAccountCodeSync('ap');
  }

  private buildRoleLookupOrder(
    primary: PartyType,
    roles: PartyType[],
    legacyType: PartyType,
  ): PartyType[] {
    const order: PartyType[] = [];
    const push = (role: PartyType) => {
      if (!order.includes(role)) order.push(role);
    };
    push(primary);
    for (const role of roles) push(role);
    push(legacyType);
    for (const role of ROLE_LOOKUP_ORDER) push(role);
    return order;
  }

  private async resolveTreasuryAccountCode(
    methodId?: number | null,
    prefer: 'cash' | 'bank' = 'bank',
  ) {
    if (methodId) {
      const pm = await this.prisma.paymentMethod.findUnique({
        where: { id: methodId },
        select: { cashAccountCode: true, bankAccountCode: true },
      });
      if (prefer === 'cash') {
        if (pm?.cashAccountCode) return pm.cashAccountCode;
        if (pm?.bankAccountCode) return pm.bankAccountCode;
      } else {
        if (pm?.bankAccountCode) return pm.bankAccountCode;
        if (pm?.cashAccountCode) return pm.cashAccountCode;
      }
    }
    return prefer === 'cash'
      ? (this.accountSettings.getAccountCodeSync('cash') ??
          this.accountSettings.getAccountCodeSync('bank'))
      : (this.accountSettings.getAccountCodeSync('bank') ??
          this.accountSettings.getAccountCodeSync('cash'));
  }

  // ——— NUEVO: mapeo de cuentas para retenciones
  private async resolveWithholdingAccountCode(
    type: WithholdingType,
    context: 'SALE' | 'PURCHASE',
  ): Promise<string> {
    if (context === 'SALE') {
      if (type === 'RTF')
        return this.accountSettings.getAccountCode('RET_RTF_SALES_ASSET');
      if (type === 'RICA')
        return this.accountSettings.getAccountCode('RET_RICA_SALES_ASSET');
      if (type === 'RIVA')
        return this.accountSettings.getAccountCode('RET_RIVA_SALES_ASSET');
    } else {
      if (type === 'RTF')
        return this.accountSettings.getAccountCode('RET_RTF_PURCH_LIAB');
      if (type === 'RICA')
        return this.accountSettings.getAccountCode('RET_RICA_PURCH_LIAB');
      if (type === 'RIVA')
        return this.accountSettings.getAccountCode('RET_RIVA_PURCH_LIAB');
    }
    throw new BadRequestException(`Tipo de retención no soportado: ${type}`);
  }

  private async validateAccountPosting(
    tx: Prisma.TransactionClient,
    accountCode: string,
    line: Pick<AccountingLineInput, 'thirdPartyId' | 'costCenterId'>,
  ) {
    let account = await tx.coaAccount.findUnique({
      where: { code: accountCode },
    });
    if (!account)
      throw new BadRequestException(`Cuenta ${accountCode} no existe`);

    if (account.isDetailed === false) {
      const child = await tx.coaAccount.findFirst({
        where: { parentCode: account.code, isDetailed: true },
        orderBy: { code: 'asc' },
      });
      if (!child) {
        throw new BadRequestException(
          `La cuenta ${account.code} no permite movimientos directos (no es detallada)`,
        );
      }
      account = child;
    }

    if (account.requiresThirdParty && !line.thirdPartyId) {
      throw new BadRequestException(
        `La cuenta ${account.code} exige tercero (thirdPartyId)`,
      );
    }
    if (account.requiresCostCenter && !line.costCenterId) {
      throw new BadRequestException(
        `La cuenta ${account.code} exige centro de costos (costCenterId)`,
      );
    }

    return account;
  }

  // ------------------------------
  // VAT helpers
  // ------------------------------
  private async getVatSetupForItem(
    itemId?: number | null,
  ): Promise<{ profile: VatProfile; rate: number }> {
    const profile: VatProfile = 'GRAVADO';
    const rate = 0.19;
    return { profile, rate };
  }

  private async calcVat(params: {
    type: 'SALE' | 'PURCHASE';
    itemId?: number | null;
    base: number;
  }) {
    const { rate } = await this.getVatSetupForItem(params.itemId);
    const amount =
      Math.round((params.base * rate + Number.EPSILON) * 100) / 100;
    const accountCode = await this.resolveVatAccountCode(
      params.itemId ?? null,
      params.type,
    );
    return { amount, accountCode };
  }

  // ------------------------------
  // Entry creation (idempotent + numbering)
  // ------------------------------
  private async ensureIdempotency(
    tx: Prisma.TransactionClient,
    sourceType: string,
    sourceId: number,
  ) {
    const existing = await tx.journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType, sourceId } as any },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe un asiento para ${sourceType}#${sourceId} (id ${existing.id})`,
      );
    }
  }

  private async createEntry(
    tx: Prisma.TransactionClient,
    params: AccountingEntryInput,
  ) {
    await this.assertOpenPeriod(params.date);
    await this.ensureIdempotency(tx, params.sourceType, params.sourceId);

    const D = Prisma.Decimal;
    const totalDebit = params.lines.reduce(
      (acc, line) => acc.plus(new D(line.debit ?? 0)),
      new D(0),
    );
    const totalCredit = params.lines.reduce(
      (acc, line) => acc.plus(new D(line.credit ?? 0)),
      new D(0),
    );
    if (!totalDebit.eq(totalCredit)) {
      throw new BadRequestException(
        'El asiento no cuadra (débitos ≠ créditos)',
      );
    }

    const period = await this.getOrCreatePeriodByDate(tx, params.date);
    const journalCode =
      params.journalCodeOverride ?? this.journalCodeFor(params.sourceType);
    const journal = await this.getOrCreateJournalByCode(tx, journalCode);

    const entry = await tx.journalEntry.create({
      data: {
        date: params.date,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        description: params.description ?? null,
        status: params.status ?? 'POSTED',
        paymentMethodId: params.paymentMethodId ?? null,
        periodId: period.id,
        journalId: journal.id,
      },
    });

    for (const line of params.lines) {
      const accountCode = (line.accountCode || '').trim();
      if (!accountCode) {
        throw new BadRequestException('accountCode requerido en cada línea');
      }
      const account = await this.validateAccountPosting(tx, accountCode, line);
      await tx.journalLine.create({
        data: {
          entryId: entry.id,
          accountId: account?.id ?? null,
          accountCode: account.code,
          thirdPartyId: line.thirdPartyId ?? null,
          costCenterId: line.costCenterId ?? null,
          debit: (line.debit ?? 0) as any,
          credit: (line.credit ?? 0) as any,
          description: line.description ?? null,
        },
      });
    }

    if ((params.status ?? 'POSTED') === 'POSTED') {
      const { number } = await this.allocateNumber(
        tx,
        period.id,
        params.date,
        journal.id,
      );
      await tx.journalEntry.update({
        where: { id: entry.id },
        data: { number },
      });
    }

    await this.log('POST', 'JournalEntry', entry.id, {
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
    });
    return entry;
  }

  public async createEntryWithTransaction(params: AccountingEntryInput) {
    return this.prisma.$transaction((tx) => this.createEntry(tx, params));
  }

  public async createEntryWithExistingTransaction(
    tx: Prisma.TransactionClient,
    params: AccountingEntryInput,
  ) {
    return this.createEntry(tx, params);
  }

  // ------------------------------
  // Public reports (trial, ledger, P&L, BS)
  // ------------------------------
  async trialBalance(from?: Dt, to?: Dt) {
    const { gte, lte } = this.parseRange(from, to);
    const lines = await this.prisma.journalLine.findMany({
      where: { entry: { date: { gte, lte } } },
      select: {
        accountCode: true,
        debit: true,
        credit: true,
        account: { select: { id: true, code: true, name: true, nature: true } },
      },
    });

    const map = new Map<
      string,
      {
        code: string;
        name: string;
        nature: string;
        debit: number;
        credit: number;
      }
    >();
    for (const l of lines) {
      const code = l.account?.code ?? l.accountCode;
      const cur = map.get(code) ?? {
        code,
        name: l.account?.name ?? '',
        nature: l.account?.nature ?? 'D',
        debit: 0,
        credit: 0,
      };
      cur.debit += this.num(l.debit);
      cur.credit += this.num(l.credit);
      map.set(code, cur);
    }

    const rows = [...map.values()]
      .map((r) => {
        const balance = this.accountBalance(r.nature, r.debit, r.credit);
        const balanceSide =
          balance >= 0 ? r.nature : r.nature === 'D' ? 'C' : 'D';
        return { ...r, balance, balanceSide };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    const totals = rows.reduce(
      (acc, r) => ({
        debit: acc.debit + r.debit,
        credit: acc.credit + r.credit,
      }),
      { debit: 0, credit: 0 },
    );
    return { from: gte, to: lte, count: rows.length, totals, rows };
  }

  async ledger(accountCode: string, from?: Dt, to?: Dt) {
    if (!accountCode) throw new BadRequestException('accountCode requerido');
    const { gte, lte } = this.parseRange(from, to);

    const account = await this.prisma.coaAccount.findUnique({
      where: { code: accountCode },
    });
    if (!account)
      throw new BadRequestException(`Cuenta ${accountCode} no existe`);

    const lines = await this.prisma.journalLine.findMany({
      where: { accountCode, entry: { date: { gte, lte } } },
      orderBy: [{ entry: { date: 'asc' } }, { id: 'asc' }],
      select: {
        debit: true,
        credit: true,
        description: true,
        entry: {
          select: {
            date: true,
            sourceType: true,
            sourceId: true,
            description: true,
          },
        },
      },
    });

    let run = 0;
    const rows = lines.map((l) => {
      const d = this.num(l.debit);
      const c = this.num(l.credit);
      const delta = this.accountBalance(account.nature, d, c);
      run += delta;
      return {
        date: l.entry.date,
        sourceType: l.entry.sourceType,
        sourceId: l.entry.sourceId,
        description: l.description || l.entry.description || null,
        debit: d,
        credit: c,
        runBalance: run,
      };
    });

    return {
      from: gte,
      to: lte,
      account: {
        code: account.code,
        name: account.name,
        nature: account.nature,
      },
      opening: 0,
      closing: run,
      rows,
    };
  }

  async incomeStatement(from?: Dt, to?: Dt) {
    const { gte, lte } = this.parseRange(from, to);
    const revenuePrefixes = ['41', '42', '43', '47'];
    const cogsPrefixes = ['61'];
    const expensePrefixes = ['51', '52', '53', '54', '55', '57', '58'];

    const lines = await this.prisma.journalLine.findMany({
      where: { entry: { date: { gte, lte } } },
      select: { accountCode: true, debit: true, credit: true },
    });
    const starts = (code: string, prefixes: string[]) =>
      prefixes.some((p) => code.startsWith(p));

    let revenue = 0,
      cogs = 0,
      expenses = 0;
    for (const l of lines) {
      const code = l.accountCode;
      const d = this.num(l.debit),
        c = this.num(l.credit);
      if (starts(code, revenuePrefixes)) revenue += c - d;
      else if (starts(code, cogsPrefixes)) cogs += d - c;
      else if (starts(code, expensePrefixes)) expenses += d - c;
    }

    const grossProfit = revenue - cogs;
    const operatingIncome = grossProfit - expenses;
    const netIncome = operatingIncome;
    return {
      from: gte,
      to: lte,
      revenue,
      cogs,
      grossProfit,
      expenses,
      operatingIncome,
      netIncome,
    };
  }

  async balanceSheet(asOf?: Dt) {
    const lte = asOf ? new Date(asOf) : new Date();
    if (isNaN(lte.getTime())) throw new BadRequestException('asOf inválido');

    const lines = await this.prisma.journalLine.findMany({
      where: { entry: { date: { lte } } },
      select: {
        accountCode: true,
        debit: true,
        credit: true,
        account: { select: { nature: true } },
      },
    });

    const byCode = new Map<
      string,
      { code: string; nature: string; debit: number; credit: number }
    >();
    for (const l of lines) {
      const code = l.accountCode;
      const cur = byCode.get(code) ?? {
        code,
        nature: l.account?.nature ?? 'D',
        debit: 0,
        credit: 0,
      };
      cur.debit += this.num(l.debit);
      cur.credit += this.num(l.credit);
      byCode.set(code, cur);
    }

    let assets = 0,
      liabilities = 0,
      equity = 0,
      rev = 0,
      cogs = 0,
      exp = 0;
    for (const r of byCode.values()) {
      const top = r.code.charAt(0);
      const bal = this.accountBalance(r.nature, r.debit, r.credit);
      if (top === '1') assets += bal;
      else if (top === '2')
        liabilities +=
          r.nature === 'C' ? r.credit - r.debit : -(r.debit - r.credit);
      else if (top === '3')
        equity += r.nature === 'C' ? r.credit - r.debit : -(r.debit - r.credit);
      else if (top === '4') rev += r.credit - r.debit;
      else if (top === '5') exp += r.debit - r.credit;
      else if (top === '6') cogs += r.debit - r.credit;
    }

    const resultOfPeriod = rev - cogs - exp;
    const equityTotal = equity + resultOfPeriod;
    return {
      asOf: lte,
      assets,
      liabilities,
      equityBeforeResult: equity,
      resultOfPeriod,
      equityTotal,
      check: assets - (liabilities + equityTotal),
    };
  }

  async niifBalanceStatement(
    dto: NiifBalanceQueryDto,
  ): Promise<NiifBalanceStatementDto> {
    const asOf = dto.asOf ? new Date(dto.asOf) : null;
    if (!asOf || isNaN(asOf.getTime())) {
      throw new BadRequestException('asOf inválido');
    }

    const previousAsOf = dto.previousAsOf ? new Date(dto.previousAsOf) : null;
    if (previousAsOf && isNaN(previousAsOf.getTime())) {
      throw new BadRequestException('previousAsOf inválido');
    }

    const predicate = (code: string) => {
      const first = code.charAt(0);
      return first === '1' || first === '2' || first === '3';
    };

    const currentMap = await this.collectAccountAggregates(
      { lte: asOf },
      predicate,
    );
    const previousMap = previousAsOf
      ? await this.collectAccountAggregates({ lte: previousAsOf }, predicate)
      : undefined;

    const ctx: StatementBuildContext = {
      current: currentMap,
      previous: previousMap,
      assignedCurrent: new Set<string>(),
      assignedPrevious: new Set<string>(),
    };

    const sections = this.buildNiifTree(
      NIIF_BALANCE_STRUCTURE,
      ctx,
      Boolean(previousMap),
    );

    const totals = {
      assets: this.findNodeAmount(sections, 'assets'),
      liabilities: this.findNodeAmount(sections, 'liabilities'),
      equity: this.findNodeAmount(sections, 'equity'),
    };

    const meta = this.buildUnmappedMeta(ctx, predicate);

    return {
      asOf: this.toIso(asOf),
      previousAsOf: previousAsOf ? this.toIso(previousAsOf) : null,
      currency: NIIF_DEFAULT_CURRENCY,
      sections,
      totals,
      meta,
    };
  }

  async niifIncomeStatement(
    dto: NiifIncomeQueryDto,
  ): Promise<NiifIncomeStatementDto> {
    if (!dto.from || !dto.to) {
      throw new BadRequestException('Debe indicar from y to');
    }

    const { gte, lte } = this.parseRange(dto.from, dto.to);
    const effectiveFrom = dto.accumulateYear ? this.firstDayOfYear(lte) : gte;

    const predicate = (code: string) => {
      const first = code.charAt(0);
      return first === '4' || first === '5' || first === '6';
    };

    const currentMap = await this.collectAccountAggregates(
      { gte: effectiveFrom, lte },
      predicate,
    );

    let previousRange: { gte: Date; lte: Date } | null = null;
    if (dto.previousFrom || dto.previousTo) {
      if (!dto.previousFrom || !dto.previousTo) {
        throw new BadRequestException(
          'Debe indicar previousFrom y previousTo para comparativo',
        );
      }
      previousRange = this.parseRange(dto.previousFrom, dto.previousTo);
    }

    const previousMap = previousRange
      ? await this.collectAccountAggregates(previousRange, predicate)
      : undefined;

    const ctx: StatementBuildContext = {
      current: currentMap,
      previous: previousMap,
      assignedCurrent: new Set<string>(),
      assignedPrevious: new Set<string>(),
    };

    const sections = this.buildNiifTree(
      NIIF_INCOME_STRUCTURE,
      ctx,
      Boolean(previousMap),
    );

    const totals = {
      netIncome: this.findNodeAmount(sections, 'comprehensive_income'),
    };

    const meta = this.buildUnmappedMeta(ctx, predicate);

    return {
      from: this.toIso(effectiveFrom),
      to: this.toIso(lte),
      previousFrom: previousRange ? this.toIso(previousRange.gte) : null,
      previousTo: previousRange ? this.toIso(previousRange.lte) : null,
      currency: NIIF_DEFAULT_CURRENCY,
      sections,
      totals,
      meta,
    };
  }

  async niifCashFlowStatement(
    dto: NiifCashFlowQueryDto,
  ): Promise<NiifCashFlowStatementDto> {
    if (!dto.from || !dto.to) {
      throw new BadRequestException('Debe indicar from y to');
    }

    const { gte, lte } = this.parseRange(dto.from, dto.to);

    const currentMap = await this.collectAccountAggregates(
      { gte, lte },
      undefined,
    );

    let previousRange: { gte: Date; lte: Date } | null = null;
    if (dto.previousFrom || dto.previousTo) {
      if (!dto.previousFrom || !dto.previousTo) {
        throw new BadRequestException(
          'Debe indicar previousFrom y previousTo para comparativo',
        );
      }
      previousRange = this.parseRange(dto.previousFrom, dto.previousTo);
    }

    const previousMap = previousRange
      ? await this.collectAccountAggregates(previousRange, undefined)
      : undefined;

    const ctx: StatementBuildContext = {
      current: currentMap,
      previous: previousMap,
      assignedCurrent: new Set<string>(),
      assignedPrevious: new Set<string>(),
    };

    const sections = this.buildNiifTree(
      NIIF_CASH_FLOW_STRUCTURE,
      ctx,
      Boolean(previousMap),
    );

    const netChangeOperating = this.findNodeAmount(
      sections,
      'cash_flow_operating',
    );
    const netChangeInvesting = this.findNodeAmount(
      sections,
      'cash_flow_investing',
    );
    const netChangeFinancing = this.findNodeAmount(
      sections,
      'cash_flow_financing',
    );

    const netChange =
      netChangeOperating + netChangeInvesting + netChangeFinancing;

    let meta = this.buildUnmappedMeta(ctx);

    const cashCheck = await this.computeCashDelta(gte, lte);
    const checks = {
      openingCash: cashCheck.opening,
      closingCash: cashCheck.closing,
      deltaCash: cashCheck.delta,
      reconciliationDiff: this.round2(netChange - cashCheck.delta),
    };

    if (meta) {
      meta.checks = { ...(meta.checks ?? {}), ...checks };
    } else {
      meta = { checks };
    }

    return {
      from: this.toIso(gte),
      to: this.toIso(lte),
      previousFrom: previousRange ? this.toIso(previousRange.gte) : null,
      previousTo: previousRange ? this.toIso(previousRange.lte) : null,
      currency: NIIF_DEFAULT_CURRENCY,
      sections,
      totals: { netChange: this.round2(netChange) },
      meta,
    };
  }

  // ------------------------------
  // Cierre anual (NUEVO)
  // ------------------------------
  private async createDeferredTaxClosingEntry(
    tx: Prisma.TransactionClient,
    year: number,
    date: Date,
  ) {
    const provisions = await (tx as any).deferredTaxProvision.findMany({
      where: { year, active: true },
      orderBy: { id: 'asc' },
    });

    if (!provisions.length) return null;

    const lines: AccountingLineInput[] = [];
    for (const provision of provisions) {
      const amount = this.num(provision.amount);
      if (amount === 0) continue;

      lines.push({
        accountCode: provision.debitAccountCode,
        debit: amount,
        credit: 0,
        description: provision.description ?? `Impuesto diferido ${year}`,
      });
      lines.push({
        accountCode: provision.creditAccountCode,
        debit: 0,
        credit: amount,
        description: provision.description ?? `Impuesto diferido ${year}`,
      });
    }

    if (!lines.length) return null;

    return this.createEntry(tx, {
      date,
      sourceType: 'YEAR_CLOSE_DEFERRED',
      sourceId: year,
      description: `Ajuste impuesto diferido ${year}`,
      lines,
      status: 'POSTED',
      journalCodeOverride: 'GENERAL',
    });
  }

  /**
   * Cierre anual: 41/51 -> 36 (Resultado del ejercicio), luego 36 -> Patrimonio (utilidad/pérdida acumulada)
   * Idempotente por (sourceType, sourceId):
   *  - Asiento 1:  sourceType='YEAR_CLOSE',         sourceId=year
   *  - Asiento 2:  sourceType='YEAR_CLOSE_EQUITY',  sourceId=year
   */
  async closeFiscalYear(dto: CloseYearDto) {
    const { year } = dto;
    if (!year || year < 1900 || year > 3000) {
      throw new BadRequestException('Año inválido');
    }

    // 1) Validar que los 12 periodos estén CERRADOS
    const periods = await this.prisma.accountingPeriod.findMany({
      where: { year, type: 'REGULAR' } as any,
      select: { month: true, status: true },
      orderBy: { month: 'asc' },
    });
    if (periods.length < 12 || periods.some((p) => p.status !== 'CLOSED')) {
      throw new BadRequestException(
        `El año ${year} no tiene todos los periodos cerrados`,
      );
    }

    // 2) Fechas del ejercicio
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);

    // 3) Cuentas objetivo del cierre (ajusta prefijos si necesitas incluir 4*,5*,6*)
    const revenueExpensePrefixes = ['41', '51'];
    const startsWithAny = (code: string, prefixes: string[]) =>
      prefixes.some((p) => code.startsWith(p));

    const coa = await this.prisma.coaAccount.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        nature: true,
        isDetailed: true,
      },
    });
    const candidates = coa.filter((a) =>
      startsWithAny(a.code, revenueExpensePrefixes),
    );
    if (candidates.length === 0) {
      throw new BadRequestException(
        'No se encontraron cuentas 41/51 en el PUC (ajusta los prefijos o crea las cuentas)',
      );
    }
    const byCode = new Map(candidates.map((a) => [a.code, a]));

    // 4) Sumar movimientos del año por cuenta
    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountCode'],
      where: {
        accountCode: { in: candidates.map((a) => a.code) },
        entry: { status: 'POSTED', date: { gte: start, lte: end } },
      },
      _sum: { debit: true, credit: true },
    });

    if (sums.length === 0) {
      throw new BadRequestException(
        `No hay movimientos de resultados (41/51) en ${year} para cerrar`,
      );
    }

    type CloseLine = {
      accountCode: string;
      debit: number;
      credit: number;
      description?: string | null;
    };
    const closingLines: CloseLine[] = [];

    let result = 0;
    for (const s of sums) {
      const acc = byCode.get(s.accountCode);
      if (!acc) continue;
      const debit = this.num(s._sum.debit);
      const credit = this.num(s._sum.credit);

      const balance = this.accountBalance(acc.nature, debit, credit); // D => D-C ; C => C-D
      if (balance === 0) continue;

      if (balance > 0) {
        // saldo deudor => se cierra con crédito
        closingLines.push({
          accountCode: acc.code,
          debit: 0,
          credit: balance,
          description: `Cierre ${year}`,
        });
      } else {
        // saldo acreedor => se cierra con débito
        closingLines.push({
          accountCode: acc.code,
          debit: -balance,
          credit: 0,
          description: `Cierre ${year}`,
        });
      }

      result += balance;
    }

    if (closingLines.length === 0) {
      throw new BadRequestException(
        `Las cuentas 41/51 ya están en saldo cero para ${year}`,
      );
    }

    // 5) Contrapartida a 36 (Resultado del ejercicio)
    const yearResultCode = ACCOUNTS.yearResult;
    if (!yearResultCode) {
      throw new BadRequestException(
        'Falta configurar ACCOUNTS.yearResult en accounts.map.ts',
      );
    }
    const totalDebit = closingLines.reduce((t, l) => t + l.debit, 0);
    const totalCredit = closingLines.reduce((t, l) => t + l.credit, 0);

    const contraTo36: CloseLine =
      totalDebit > totalCredit
        ? {
            accountCode: yearResultCode,
            debit: 0,
            credit: totalDebit - totalCredit,
            description: `Cierre ${year} a 36`,
          }
        : {
            accountCode: yearResultCode,
            debit: totalCredit - totalDebit,
            credit: 0,
            description: `Cierre ${year} a 36`,
          };

    // 6) Traslado 36 -> Patrimonio (utilidades/pérdidas acumuladas)
    const profitCode = ACCOUNTS.retainedEarningsProfit;
    const lossCode = ACCOUNTS.retainedEarningsLoss;
    if (!profitCode || !lossCode) {
      throw new BadRequestException(
        'Faltan ACCOUNTS.retainedEarningsProfit / retainedEarningsLoss en accounts.map.ts',
      );
    }

    const moveToEquityLines: CloseLine[] = [];
    if (result > 0) {
      // Utilidad
      moveToEquityLines.push({
        accountCode: yearResultCode,
        debit: result,
        credit: 0,
        description: `Traslado utilidad ${year}`,
      });
      moveToEquityLines.push({
        accountCode: profitCode,
        debit: 0,
        credit: result,
        description: `Traslado utilidad ${year}`,
      });
    } else if (result < 0) {
      const loss = -result;
      // Pérdida
      moveToEquityLines.push({
        accountCode: lossCode,
        debit: loss,
        credit: 0,
        description: `Traslado pérdida ${year}`,
      });
      moveToEquityLines.push({
        accountCode: yearResultCode,
        debit: 0,
        credit: loss,
        description: `Traslado pérdida ${year}`,
      });
    }

    // 7) Persistir en transacción (idempotente vía createEntry)
    return this.prisma.$transaction(async (tx) => {
      // Asiento 1: cierre de 41/51 contra 36
      const entry1 = await this.createEntry(tx, {
        date: end,
        sourceType: 'YEAR_CLOSE',
        sourceId: year,
        description: `Cierre anual ${year}: 41/51 → 36`,
        lines: [...closingLines, contraTo36],
        status: 'POSTED',
        journalCodeOverride: 'GENERAL',
      });

      // Asiento 2: traslado 36 → patrimonio (solo si corresponde)
      let entry2: any = null;
      if (moveToEquityLines.length) {
        entry2 = await this.createEntry(tx, {
          date: end,
          sourceType: 'YEAR_CLOSE_EQUITY',
          sourceId: year,
          description: `Traslado resultado ${year} a patrimonio`,
          lines: moveToEquityLines,
          status: 'POSTED',
          journalCodeOverride: 'GENERAL',
        });
      }

      const entryDeferred = await this.createDeferredTaxClosingEntry(
        tx,
        year,
        end,
      );

      await this.log(
        'CLOSE_PERIOD',
        'AccountingPeriod',
        periods[periods.length - 1]?.month ?? 12,
        {
          action: 'YEAR_CLOSE',
          year,
          entry1: entry1.id,
          entry2: entry2?.id ?? null,
          deferred: entryDeferred?.id ?? null,
          result,
        },
      );

      return { year, result, entry1, entry2, entryDeferred };
    });
  }

  // ------------------------------
  // Libros fiscales (Ventas / Compras)  [NUEVO]
  // ------------------------------
  private mergeVatMaps(a: Record<string, number>, b: Record<string, number>) {
    const out: Record<string, number> = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] = (out[k] ?? 0) + v;
    }
    return out;
  }

  private sumBookRows(rows: BookAggRow[]): BookAggRow {
    return rows.reduce<BookAggRow>(
      (acc, r) => {
        acc.taxBase += r.taxBase;
        acc.vatByRate = this.mergeVatMaps(acc.vatByRate, r.vatByRate);
        acc.withholdings += r.withholdings;
        acc.total += r.total;
        return acc;
      },
      {
        date: '',
        number: '',
        thirdPartyId: '',
        thirdPartyName: 'TOTAL',
        thirdPartyDocument: '',
        thirdPartyDv: null,
        thirdPartyIdType: null,
        taxBase: 0,
        vatByRate: {},
        withholdings: 0,
        total: 0,
      },
    );
  }

  private normalizeRateKey(ratePct?: Prisma.Decimal | number | string | null) {
    // Convierte 19 / "19" / 0.19 a 'vat_19', 0 a 'vat_0'
    if (ratePct == null) return 'vat_0';
    const n =
      ratePct instanceof Prisma.Decimal
        ? ratePct.toNumber()
        : typeof ratePct === 'string'
          ? Number(ratePct)
          : ratePct;
    // Si el valor viene como 0.19, multiplica por 100 y redondea
    const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
    return `vat_${Number.isFinite(pct) ? pct : 0}`;
  }

  private computeNitDv(raw?: string | null): string | null {
    const digits = (raw ?? '').replace(/[^0-9]/g, '');
    if (!digits) return null;
    const weights = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
    let sum = 0;
    const chars = digits.split('').reverse();
    for (let i = 0; i < chars.length && i < weights.length; i++) {
      sum += Number(chars[i]) * weights[i];
    }
    const remainder = sum % 11;
    if (remainder === 0) return '0';
    if (remainder === 1) return '1';
    return String(11 - remainder);
  }

  // ——— REEMPLAZADO: rama separada por modelo para evitar unión invocable y tipar 'inv'
  private async buildBook(
    kind: 'SALES' | 'PURCHASES',
    from?: Dt,
    to?: Dt,
    group: 'invoice' | 'day' = 'invoice',
  ) {
    const { gte, lte } = this.parseRange(from, to);

    let invoices: RawInvoice[] = [];

    if (kind === 'SALES') {
      invoices = (await this.prisma.salesInvoice.findMany({
        where: {
          issueDate: { gte, lte },
          status: { in: ['ISSUED', 'PAID'] as any },
        },
        orderBy: { issueDate: 'asc' },
        select: {
          id: true,
          number: true,
          issueDate: true,
          thirdPartyId: true,
          thirdParty: {
            select: {
              id: true,
              name: true,
              document: true,
              idType: true,
              personKind: true,
              type: true,
            },
          },
          subtotal: true,
          total: true,
          taxes: { select: { ratePct: true, amount: true, base: true } },
          withholdings: { select: { type: true, amount: true } },
        },
      })) as unknown as RawInvoice[];
    } else {
      invoices = (await this.prisma.purchaseInvoice.findMany({
        where: {
          issueDate: { gte, lte },
          status: { in: ['ISSUED', 'PAID'] as any },
        },
        orderBy: { issueDate: 'asc' },
        select: {
          id: true,
          number: true,
          issueDate: true,
          thirdPartyId: true,
          thirdParty: {
            select: {
              id: true,
              name: true,
              document: true,
              idType: true,
              personKind: true,
              type: true,
            },
          },
          subtotal: true,
          total: true,
          taxes: { select: { ratePct: true, amount: true, base: true } },
          withholdings: { select: { type: true, amount: true } },
        },
      })) as unknown as RawInvoice[];
    }

    const invoiceRows: BookAggRow[] = invoices.map((inv: RawInvoice) => {
      const date = inv.issueDate
        ? new Date(inv.issueDate as any).toISOString().slice(0, 10)
        : '';
      const thirdPartyId = inv.thirdParty?.id ?? inv.thirdPartyId ?? '';
      const thirdPartyName = inv.thirdParty?.name ?? '';
      const document = inv.thirdParty?.document?.trim() ?? '';
      const idType = inv.thirdParty?.idType ?? null;
      const dv = document ? this.computeNitDv(document) : null;

      // Base gravable: intenta sumar bases reportadas en taxes; si no, usa subtotal
      let baseFromTaxes = 0;
      const vatByRate: Record<string, number> = {};
      for (const t of inv.taxes ?? []) {
        const rateKey = this.normalizeRateKey(t.ratePct);
        const amount = this.num(t.amount);
        const base = this.num(t.base);
        baseFromTaxes += base;
        vatByRate[rateKey] = (vatByRate[rateKey] ?? 0) + amount;
      }
      const taxBase =
        baseFromTaxes > 0 ? baseFromTaxes : this.num(inv.subtotal);

      // Retenciones
      let withholdings = 0;
      for (const w of inv.withholdings ?? []) {
        withholdings += this.num(w.amount);
      }

      const total = this.num(inv.total);

      return {
        date,
        number: inv.number ?? '',
        thirdPartyId,
        thirdPartyName,
        thirdPartyDocument: document,
        thirdPartyDv: dv,
        thirdPartyIdType: idType,
        taxBase,
        vatByRate,
        withholdings,
        total,
      };
    });

    let rows: BookAggRow[] = invoiceRows;

    if (group === 'day') {
      const byDay = new Map<string, BookAggRow>();
      for (const r of invoiceRows) {
        const cur = byDay.get(r.date) ?? {
          date: r.date,
          number: '',
          thirdPartyId: '',
          thirdPartyName: '',
          thirdPartyDocument: '',
          thirdPartyDv: null,
          thirdPartyIdType: null,
          taxBase: 0,
          vatByRate: {},
          withholdings: 0,
          total: 0,
        };
        cur.taxBase += r.taxBase;
        cur.vatByRate = this.mergeVatMaps(cur.vatByRate, r.vatByRate);
        cur.withholdings += r.withholdings;
        cur.total += r.total;
        byDay.set(r.date, cur);
      }
      rows = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    }

    const totals = this.sumBookRows(rows);

    return { from: gte, to: lte, kind, group, rows, totals };
  }

  // Públicos: usados por el controlador de exportación
  async salesBook(from?: Dt, to?: Dt, group: 'invoice' | 'day' = 'invoice') {
    return this.buildBook('SALES', from, to, group);
  }

  async purchaseBook(from?: Dt, to?: Dt, group: 'invoice' | 'day' = 'invoice') {
    return this.buildBook('PURCHASES', from, to, group);
  }

  async dianVatTemplate(dto: {
    scope?: string | null;
    from?: Dt;
    to?: Dt;
  }): Promise<DianVatReport> {
    const scope: DianVatScope =
      dto.scope === 'PURCHASES' ? 'PURCHASES' : 'SALES';
    const report = await this.buildBook(scope, dto.from, dto.to, 'invoice');

    const rows: DianVatRow[] = report.rows.map((row) => {
      const vatTotalRaw = Object.values(row.vatByRate ?? {}).reduce(
        (acc, value) => acc + Number(value ?? 0),
        0,
      );
      const vatByRateRounded = Object.fromEntries(
        Object.entries(row.vatByRate ?? {}).map(([key, value]) => [
          key,
          this.round2(Number(value ?? 0)),
        ]),
      );

      return {
        date: row.date,
        documentNumber: row.number,
        thirdPartyId: row.thirdPartyId,
        thirdPartyDocument: row.thirdPartyDocument,
        thirdPartyDv: row.thirdPartyDv,
        thirdPartyIdType: row.thirdPartyIdType,
        thirdPartyName: row.thirdPartyName,
        taxBase: this.round2(row.taxBase),
        vatByRate: vatByRateRounded,
        vatTotal: this.round2(vatTotalRaw),
        withholdings: this.round2(row.withholdings),
        total: this.round2(row.total),
      };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.taxBase += row.taxBase;
        acc.vatTotal += row.vatTotal;
        acc.withholdings += row.withholdings;
        acc.total += row.total;
        acc.vatByRate = this.mergeVatMaps(acc.vatByRate, row.vatByRate);
        return acc;
      },
      {
        taxBase: 0,
        vatTotal: 0,
        withholdings: 0,
        total: 0,
        vatByRate: {} as Record<string, number>,
      },
    );

    return {
      from: report.from ?? null,
      to: report.to ?? null,
      scope,
      rows,
      totals: {
        taxBase: this.round2(totals.taxBase),
        vatTotal: this.round2(totals.vatTotal),
        withholdings: this.round2(totals.withholdings),
        total: this.round2(totals.total),
        vatByRate: Object.fromEntries(
          Object.entries(totals.vatByRate).map(([key, value]) => [
            key,
            this.round2(value),
          ]),
        ),
      },
    };
  }

  async dianWithholdingTemplate(dto: {
    scope?: string | null;
    type?: string | null;
    from?: Dt;
    to?: Dt;
  }): Promise<DianWithholdingReport> {
    const scope: DianWithholdingScope =
      dto.scope === 'PURCHASES' ? 'PURCHASES' : 'SALES';
    const typeFilter =
      dto.type && ['RTF', 'RIVA', 'RICA'].includes(dto.type)
        ? (dto.type as WithholdingType)
        : null;

    const { gte, lte } = this.parseRange(dto.from, dto.to);
    const issueDateFilter =
      gte || lte
        ? {
            issueDate: {
              ...(gte ? { gte } : {}),
              ...(lte ? { lte } : {}),
            },
          }
        : {};

    const baseWhere: Prisma.InvoiceWithholdingWhereInput =
      scope === 'PURCHASES'
        ? {
            ...(typeFilter ? { type: typeFilter } : {}),
            purchaseInvoiceId: { not: null },
            purchaseInvoice: {
              ...issueDateFilter,
              status: { in: ['ISSUED', 'PAID'] as any },
            },
          }
        : {
            ...(typeFilter ? { type: typeFilter } : {}),
            salesInvoiceId: { not: null },
            salesInvoice: {
              ...issueDateFilter,
              status: { in: ['ISSUED', 'PAID'] as any },
            },
          };

    const withholdings = await this.prisma.invoiceWithholding.findMany({
      where: baseWhere,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        type: true,
        base: true,
        ratePct: true,
        amount: true,
        ruleId: true,
        createdAt: true,
        rule: {
          select: {
            id: true,
            ciiuCode: true,
            municipalityCode: true,
          },
        },
        purchaseInvoiceId: true,
        salesInvoiceId: true,
        purchaseInvoice: {
          select: {
            id: true,
            number: true,
            issueDate: true,
            thirdPartyId: true,
            thirdParty: {
              select: {
                id: true,
                name: true,
                document: true,
                idType: true,
              },
            },
          },
        },
        salesInvoice: {
          select: {
            id: true,
            number: true,
            issueDate: true,
            thirdPartyId: true,
            thirdParty: {
              select: {
                id: true,
                name: true,
                document: true,
                idType: true,
              },
            },
          },
        },
      },
    });

    const toDateString = (value: Date | string | null | undefined) => {
      if (!value) return '';
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return date.toISOString().slice(0, 10);
    };

    const rows: DianWithholdingRow[] = withholdings.map((item) => {
      const invoice = item.purchaseInvoice ?? item.salesInvoice;
      const invoiceType: DianWithholdingScope = item.purchaseInvoice
        ? 'PURCHASES'
        : 'SALES';
      const issueDate = toDateString(invoice?.issueDate);
      const fallbackDate = toDateString(item.createdAt);
      const effectiveDate = issueDate || fallbackDate;
      const thirdParty = invoice?.thirdParty ?? null;
      const document = thirdParty?.document?.trim() ?? '';
      const dv = document ? this.computeNitDv(document) : null;
      const thirdPartyIdType = thirdParty?.idType ?? null;
      const thirdPartyName = thirdParty?.name ?? '';
      const thirdPartyId = invoice?.thirdPartyId ?? thirdParty?.id ?? null;
      const base = this.round2(this.num(item.base));
      const amount = this.round2(this.num(item.amount));
      const ratePct =
        item.ratePct == null ? null : Number(this.num(item.ratePct).toFixed(4));

      return {
        date: effectiveDate,
        documentNumber: invoice?.number ?? invoice?.id ?? item.id,
        invoiceId: invoice?.id ?? null,
        invoiceType,
        thirdPartyId,
        thirdPartyDocument: document,
        thirdPartyDv: dv,
        thirdPartyIdType,
        thirdPartyName,
        withholdingType: item.type,
        ruleId: item.ruleId ?? null,
        ruleCiiuCode: item.rule?.ciiuCode ?? null,
        ruleMunicipalityCode: item.rule?.municipalityCode ?? null,
        base,
        ratePct,
        amount,
      };
    });

    const totals: DianWithholdingTotals = rows.reduce(
      (acc, row) => {
        acc.base += row.base;
        acc.amount += row.amount;
        acc.count += 1;
        const bucket = acc.byType[row.withholdingType] ?? {
          base: 0,
          amount: 0,
        };
        bucket.base += row.base;
        bucket.amount += row.amount;
        acc.byType[row.withholdingType] = bucket;
        return acc;
      },
      {
        base: 0,
        amount: 0,
        count: 0,
        byType: {} as Partial<
          Record<WithholdingType, { base: number; amount: number }>
        >,
      },
    );

    totals.base = this.round2(totals.base);
    totals.amount = this.round2(totals.amount);
    for (const key of Object.keys(totals.byType) as WithholdingType[]) {
      const bucket = totals.byType[key];
      if (!bucket) continue;
      totals.byType[key] = {
        base: this.round2(bucket.base),
        amount: this.round2(bucket.amount),
      };
    }

    return {
      from: gte,
      to: lte,
      scope,
      typeFilter,
      rows,
      totals,
    };
  }

  async dianMagneticTemplate(dto: {
    year: number;
    from?: Dt;
    to?: Dt;
    formats?: string[] | null;
  }): Promise<DianMagneticReport> {
    const { year } = dto;
    if (!Number.isInteger(year) || year < 2000) {
      throw new BadRequestException('Año inválido para medios magnéticos');
    }

    const requestedFormats = (dto.formats ?? DIAN_MAGNETIC_FORMAT_CODES).filter(
      (code): code is DianMagneticFormatCode =>
        (DIAN_MAGNETIC_FORMAT_CODES as readonly string[]).includes(code),
    );

    if (requestedFormats.length === 0) {
      throw new BadRequestException(
        'Formato de medios magnéticos no soportado',
      );
    }

    const normalizeDate = (value: Dt | undefined, fallback: Date) => {
      if (!value) return fallback;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(
          'Rango de fechas inválido en medios magnéticos',
        );
      }
      return parsed;
    };

    const startOfYearUtc = new Date(Date.UTC(year, 0, 1));
    const endOfYearUtc = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const gte = normalizeDate(dto.from, startOfYearUtc);
    const lte = normalizeDate(dto.to, endOfYearUtc);

    if (gte > lte) {
      throw new BadRequestException(
        'El rango de fechas de medios magnéticos es inválido',
      );
    }

    if (gte.getUTCFullYear() !== year || lte.getUTCFullYear() !== year) {
      throw new BadRequestException(
        'Las fechas deben pertenecer al año del reporte',
      );
    }

    const dateFilter = {
      issueDate: {
        gte,
        lte,
      },
    };

    const formats: Partial<
      Record<DianMagneticFormatCode, DianMagneticFormatReport>
    > = {};

    const toDateString = (value: Date | string | null | undefined) => {
      if (!value) return '';
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return date.toISOString().slice(0, 10);
    };

    if (requestedFormats.includes('1001')) {
      const purchases = await this.prisma.purchaseInvoice.findMany({
        where: {
          status: { in: ['ISSUED', 'PAID'] as any },
          ...dateFilter,
        },
        orderBy: { issueDate: 'asc' },
        select: {
          id: true,
          number: true,
          issueDate: true,
          subtotal: true,
          total: true,
          thirdPartyId: true,
          thirdParty: {
            select: {
              id: true,
              name: true,
              document: true,
              idType: true,
            },
          },
          withholdings: {
            select: {
              amount: true,
            },
          },
        },
      });

      const agg = new Map<
        number | string,
        {
          thirdPartyId: number | string | null;
          document: string;
          dv: string | null;
          idType: string | null;
          name: string;
          total: number;
          retention: number;
        }
      >();

      for (const invoice of purchases) {
        const thirdParty = invoice.thirdParty;
        const document = thirdParty?.document?.trim() ?? '';
        const dv = document ? this.computeNitDv(document) : null;
        const key =
          thirdParty?.id ??
          (document ? document : undefined) ??
          invoice.thirdPartyId ??
          invoice.id;
        const bucket = agg.get(key) ?? {
          thirdPartyId: thirdParty?.id ?? invoice.thirdPartyId ?? null,
          document,
          dv,
          idType: thirdParty?.idType ?? null,
          name: thirdParty?.name ?? 'SIN NOMBRE',
          total: 0,
          retention: 0,
        };
        bucket.total += this.num(invoice.total);
        for (const w of invoice.withholdings ?? []) {
          bucket.retention += this.num(w.amount);
        }
        agg.set(key, bucket);
      }

      const columns = [
        'conceptCode',
        'documentType',
        'documentNumber',
        'dv',
        'thirdPartyName',
        'amountPaid',
        'retainedAmount',
      ];

      const rows = Array.from(agg.values()).map((bucket) => ({
        conceptCode: '1001',
        documentType: bucket.idType ?? '',
        documentNumber: bucket.document,
        dv: bucket.dv ?? '',
        thirdPartyName: bucket.name,
        amountPaid: this.round2(bucket.total),
        retainedAmount: this.round2(bucket.retention),
      }));

      const totals = rows.reduce(
        (acc, row) => {
          acc.amountPaid += Number(row.amountPaid ?? 0);
          acc.retainedAmount += Number(row.retainedAmount ?? 0);
          return acc;
        },
        { amountPaid: 0, retainedAmount: 0 },
      );

      formats['1001'] = {
        code: '1001',
        columns,
        rows,
        totals: {
          amountPaid: this.round2(totals.amountPaid),
          retainedAmount: this.round2(totals.retainedAmount),
        },
      };
    }

    if (requestedFormats.includes('1003')) {
      const withholdings = await this.prisma.invoiceWithholding.findMany({
        where: {
          purchaseInvoiceId: { not: null },
          ...(gte || lte
            ? {
                purchaseInvoice: {
                  ...dateFilter,
                  status: { in: ['ISSUED', 'PAID'] as any },
                },
              }
            : {}),
        },
        orderBy: { id: 'asc' },
        select: {
          type: true,
          base: true,
          amount: true,
          ratePct: true,
          purchaseInvoiceId: true,
          purchaseInvoice: {
            select: {
              id: true,
              number: true,
              issueDate: true,
              thirdPartyId: true,
              thirdParty: {
                select: {
                  id: true,
                  name: true,
                  document: true,
                  idType: true,
                },
              },
            },
          },
        },
      });

      const rows = withholdings.map((item) => {
        const invoice = item.purchaseInvoice;
        const thirdParty = invoice?.thirdParty ?? null;
        const document = thirdParty?.document?.trim() ?? '';
        const dv = document ? this.computeNitDv(document) : null;
        const issueDate = toDateString(invoice?.issueDate);
        return {
          conceptCode: '1003',
          documentType: thirdParty?.idType ?? '',
          documentNumber: document,
          dv: dv ?? '',
          thirdPartyName: thirdParty?.name ?? 'SIN NOMBRE',
          withholdingType: item.type,
          baseAmount: this.round2(this.num(item.base)),
          withheldAmount: this.round2(this.num(item.amount)),
          ratePct:
            item.ratePct == null
              ? ''
              : Number(this.num(item.ratePct).toFixed(4)).toFixed(4),
          invoiceNumber: invoice?.number ?? invoice?.id ?? '',
          invoiceDate: issueDate,
        };
      });

      const columns = [
        'conceptCode',
        'documentType',
        'documentNumber',
        'dv',
        'thirdPartyName',
        'withholdingType',
        'baseAmount',
        'withheldAmount',
        'ratePct',
        'invoiceNumber',
        'invoiceDate',
      ];

      const totals = rows.reduce(
        (acc, row) => {
          acc.baseAmount += Number(row.baseAmount ?? 0);
          acc.withheldAmount += Number(row.withheldAmount ?? 0);
          return acc;
        },
        { baseAmount: 0, withheldAmount: 0 },
      );

      formats['1003'] = {
        code: '1003',
        columns,
        rows,
        totals: {
          baseAmount: this.round2(totals.baseAmount),
          withheldAmount: this.round2(totals.withheldAmount),
        },
      };
    }

    return {
      year,
      from: gte,
      to: lte,
      formats,
    };
  }

  async generalJournal(dto: GeneralJournalQueryDto) {
    const { gte, lte } = this.parseRange(dto.from, dto.to);
    const filters: LedgerFilters = {
      status: dto.status,
      journalCode: dto.journalCode?.trim()
        ? dto.journalCode.trim().toUpperCase()
        : undefined,
      thirdPartyId: dto.thirdPartyId,
      costCenterId: dto.costCenterId,
      accountCode: dto.accountCode?.trim() || undefined,
    };

    const rows = await this.fetchLedgerRows({ gte, lte }, filters);
    const totals = rows.reduce(
      (acc, row) => {
        acc.debit += row.debit;
        acc.credit += row.credit;
        return acc;
      },
      { debit: 0, credit: 0 },
    );

    return {
      from: gte,
      to: lte,
      status: this.normalizeStatus(dto.status),
      journalCode: filters.journalCode ?? null,
      thirdPartyId: filters.thirdPartyId ?? null,
      costCenterId: filters.costCenterId ?? null,
      accountCode: filters.accountCode ?? null,
      count: rows.length,
      totals,
      rows,
    };
  }

  async auxLedgerAccount(dto: AuxLedgerAccountQueryDto) {
    const { gte, lte } = this.parseRange(dto.from, dto.to);
    const accountCode = dto.accountCode.trim();
    if (!accountCode) {
      throw new BadRequestException('accountCode requerido');
    }

    const account = await this.prisma.coaAccount.findUnique({
      where: { code: accountCode },
    });
    if (!account) {
      throw new BadRequestException(`Cuenta ${accountCode} no existe`);
    }

    const filters: LedgerFilters = {
      status: dto.status,
      journalCode: dto.journalCode?.trim()
        ? dto.journalCode.trim().toUpperCase()
        : undefined,
      thirdPartyId: dto.thirdPartyId,
      costCenterId: dto.costCenterId,
      accountCode,
    };

    const openingMap = await this.computeOpeningMap(gte, filters);
    if (!openingMap.has(accountCode)) {
      openingMap.set(accountCode, {
        balance: 0,
        name: account.name,
        nature: account.nature,
      });
    }

    const opening = this.round2(openingMap.get(accountCode)?.balance ?? 0);
    let run = opening;
    const rowsRaw = await this.fetchLedgerRows({ gte, lte }, filters);
    const rows: AuxLedgerRow[] = rowsRaw.map((row) => {
      const delta = this.accountBalance(account.nature, row.debit, row.credit);
      run = this.round2(run + delta);
      return { ...row, balance: run };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.debit += row.debit;
        acc.credit += row.credit;
        return acc;
      },
      { debit: 0, credit: 0 },
    );

    return {
      from: gte,
      to: lte,
      status: this.normalizeStatus(dto.status),
      journalCode: filters.journalCode ?? null,
      thirdPartyId: filters.thirdPartyId ?? null,
      costCenterId: filters.costCenterId ?? null,
      account: {
        code: account.code,
        name: account.name,
        nature: account.nature,
      },
      opening,
      closing: run,
      totals,
      rows,
    };
  }

  async auxLedgerThirdParty(dto: AuxLedgerThirdPartyQueryDto) {
    const { gte, lte } = this.parseRange(dto.from, dto.to);
    const thirdParty = await this.prisma.thirdParty.findUnique({
      where: { id: dto.thirdPartyId },
      select: { id: true, name: true, document: true },
    });
    if (!thirdParty) {
      throw new BadRequestException('Tercero no existe');
    }

    const filters: LedgerFilters = {
      status: dto.status,
      journalCode: dto.journalCode?.trim()
        ? dto.journalCode.trim().toUpperCase()
        : undefined,
      thirdPartyId: dto.thirdPartyId,
      costCenterId: dto.costCenterId,
      accountCode: dto.accountCode?.trim() || undefined,
    };

    const openingMap = await this.computeOpeningMap(gte, filters);
    const running = new Map<string, number>();

    const rowsRaw = await this.fetchLedgerRows({ gte, lte }, filters);
    const rows: AuxLedgerRow[] = rowsRaw.map((row) => {
      const accountOpening = openingMap.get(row.accountCode)?.balance ?? 0;
      const prev = running.has(row.accountCode)
        ? running.get(row.accountCode)!
        : this.round2(accountOpening);
      const delta = this.accountBalance(
        row.accountNature,
        row.debit,
        row.credit,
      );
      const next = this.round2(prev + delta);
      running.set(row.accountCode, next);
      return { ...row, balance: next };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.debit += row.debit;
        acc.credit += row.credit;
        return acc;
      },
      { debit: 0, credit: 0 },
    );

    const openings = Array.from(openingMap.entries()).map(([code, info]) => ({
      accountCode: code,
      accountName: info.name,
      opening: this.round2(info.balance),
    }));

    const closings = Array.from(running.entries()).map(([code, value]) => ({
      accountCode: code,
      closing: this.round2(value),
    }));

    return {
      from: gte,
      to: lte,
      status: this.normalizeStatus(dto.status),
      journalCode: filters.journalCode ?? null,
      thirdParty,
      accountCode: filters.accountCode ?? null,
      costCenterId: filters.costCenterId ?? null,
      totals,
      openings,
      closings,
      rows,
    };
  }

  async auxLedgerCostCenter(dto: AuxLedgerCostCenterQueryDto) {
    const { gte, lte } = this.parseRange(dto.from, dto.to);
    const costCenter = await this.prisma.costCenter.findUnique({
      where: { id: dto.costCenterId },
      select: { id: true, code: true, name: true },
    });
    if (!costCenter) {
      throw new BadRequestException('Centro de costo no existe');
    }

    const filters: LedgerFilters = {
      status: dto.status,
      journalCode: dto.journalCode?.trim()
        ? dto.journalCode.trim().toUpperCase()
        : undefined,
      thirdPartyId: dto.thirdPartyId,
      costCenterId: dto.costCenterId,
      accountCode: dto.accountCode?.trim() || undefined,
    };

    const openingMap = await this.computeOpeningMap(gte, filters);
    const running = new Map<string, number>();

    const rowsRaw = await this.fetchLedgerRows({ gte, lte }, filters);
    const rows: AuxLedgerRow[] = rowsRaw.map((row) => {
      const accountOpening = openingMap.get(row.accountCode)?.balance ?? 0;
      const prev = running.has(row.accountCode)
        ? running.get(row.accountCode)!
        : this.round2(accountOpening);
      const delta = this.accountBalance(
        row.accountNature,
        row.debit,
        row.credit,
      );
      const next = this.round2(prev + delta);
      running.set(row.accountCode, next);
      return { ...row, balance: next };
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.debit += row.debit;
        acc.credit += row.credit;
        return acc;
      },
      { debit: 0, credit: 0 },
    );

    const openings = Array.from(openingMap.entries()).map(([code, info]) => ({
      accountCode: code,
      accountName: info.name,
      opening: this.round2(info.balance),
    }));

    const closings = Array.from(running.entries()).map(([code, value]) => ({
      accountCode: code,
      closing: this.round2(value),
    }));

    return {
      from: gte,
      to: lte,
      status: this.normalizeStatus(dto.status),
      journalCode: filters.journalCode ?? null,
      thirdPartyId: filters.thirdPartyId ?? null,
      costCenter,
      accountCode: filters.accountCode ?? null,
      totals,
      openings,
      closings,
      rows,
    };
  }

  async listJournalEntries(q: JournalListDto) {
    const { gte, lte } = this.parseRange(q.from, q.to);

    const where: Prisma.JournalEntryWhereInput = {
      date: { gte, lte },
    };

    if (q.status) where.status = q.status;
    if (q.journalId) where.journalId = q.journalId;
    if (q.journalCode) {
      const code = String(q.journalCode).trim();
      if (code) where.journal = { code };
    }

    const search = q.search?.trim();
    if (search) {
      const searchNumber = Number(search);
      const or: Prisma.JournalEntryWhereInput[] = [
        { description: { contains: search, mode: 'insensitive' } },
        { sourceType: { contains: search, mode: 'insensitive' } },
        { journal: { code: { contains: search, mode: 'insensitive' } } },
        {
          lines: {
            some: { accountCode: { contains: search, mode: 'insensitive' } },
          },
        },
      ];
      if (Number.isInteger(searchNumber)) {
        or.push({ sourceId: searchNumber });
        or.push({ number: searchNumber });
      }
      where.OR = or;
    }

    const take = q.take && q.take > 0 ? Math.min(q.take, 200) : 50;
    const skip = q.skip ?? 0;
    const order = q.order === 'asc' ? 'asc' : 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        orderBy: { date: order },
        take,
        skip,
        include: {
          journal: true,
          lines: { select: { debit: true, credit: true } },
        },
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return {
      total,
      items: items.map((entry) => this.mapJournalEntrySummary(entry)),
    };
  }

  async listJournalsCatalog() {
    const items = await this.prisma.journal.findMany({
      orderBy: [{ code: 'asc' }],
    });
    return items.map((j) => ({
      id: j.id,
      code: j.code,
      name: j.name,
      isActive: j.isActive,
    }));
  }

  async getJournalEntry(id: number) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        journal: true,
        period: true,
        lines: {
          include: { account: true, thirdParty: true, costCenter: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!entry) throw new NotFoundException('Asiento no existe');
    return this.mapJournalEntry(entry);
  }

  async createJournalEntry(dto: CreateJournalEntryDto) {
    const date = dto.date ? new Date(dto.date) : new Date();
    if (isNaN(date.getTime())) throw new BadRequestException('Fecha inválida');

    const lines = this.normalizeJournalLines(dto.lines);
    this.ensureLinesBalanced(lines);

    const sourceType = 'MANUAL_FORM';
    const sourceId = Math.floor(Date.now() / 1000);

    return this.prisma.$transaction(async (tx) => {
      let journalCode = (dto.journalCode ?? '').trim().toUpperCase();
      if (dto.journalId) {
        const journal = await tx.journal.findUnique({
          where: { id: dto.journalId },
        });
        if (!journal) throw new BadRequestException('Diario no encontrado');
        journalCode = journal.code;
      }
      if (!journalCode) journalCode = 'GENERAL';

      const entry = await this.createEntry(tx, {
        date,
        sourceType,
        sourceId,
        description: dto.description ?? null,
        lines,
        status: 'DRAFT',
        journalCodeOverride: journalCode,
        paymentMethodId: (dto as any).paymentMethodId ?? null,
      });

      const created = await tx.journalEntry.findUnique({
        where: { id: entry.id },
        include: {
          journal: true,
          period: true,
          lines: {
            include: { account: true, thirdParty: true, costCenter: true },
            orderBy: { id: 'asc' },
          },
        },
      });
      if (!created) throw new NotFoundException('Asiento no existe tras crear');
      return this.mapJournalEntry(created);
    });
  }

  async updateJournalEntry(id: number, dto: UpdateJournalEntryDto) {
    const lines = this.normalizeJournalLines(dto.lines);
    this.ensureLinesBalanced(lines);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.journalEntry.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!current) throw new NotFoundException('Asiento no existe');
      if (current.status !== 'DRAFT') {
        throw new BadRequestException(
          'Sólo los asientos en DRAFT se pueden editar',
        );
      }

      const date = dto.date ? new Date(dto.date) : current.date;
      if (isNaN(date.getTime()))
        throw new BadRequestException('Fecha inválida');
      await this.assertOpenPeriod(date);

      let journalId = current.journalId ?? null;
      if (dto.journalId) {
        const journal = await tx.journal.findUnique({
          where: { id: dto.journalId },
        });
        if (!journal) throw new BadRequestException('Diario no encontrado');
        journalId = journal.id;
      } else if (dto.journalCode) {
        const code = String(dto.journalCode).trim().toUpperCase();
        const journal = await this.getOrCreateJournalByCode(
          tx,
          code || 'GENERAL',
        );
        journalId = journal.id;
      } else if (!journalId) {
        const journal = await this.getOrCreateJournalByCode(tx, 'GENERAL');
        journalId = journal.id;
      }

      const period = await this.getOrCreatePeriodByDate(tx, date);

      const validated = [] as Array<{
        accountId: number | null;
        line: AccountingLineInput;
      }>;
      for (const line of lines) {
        const account = await this.validateAccountPosting(
          tx,
          line.accountCode,
          line,
        );
        validated.push({
          accountId: account?.id ?? null,
          line: { ...line, accountCode: account.code },
        });
      }

      await tx.journalLine.deleteMany({ where: { entryId: id } });
      for (const { accountId, line } of validated) {
        await tx.journalLine.create({
          data: {
            entryId: id,
            accountId,
            accountCode: line.accountCode,
            thirdPartyId: line.thirdPartyId ?? null,
            costCenterId: line.costCenterId ?? null,
            debit: (line.debit ?? 0) as any,
            credit: (line.credit ?? 0) as any,
            description: line.description ?? null,
          },
        });
      }

      const updated = await tx.journalEntry.update({
        where: { id },
        data: {
          date,
          description: dto.description ?? null,
          journalId,
          periodId: period.id,
        },
        include: {
          journal: true,
          period: true,
          lines: {
            include: { account: true, thirdParty: true, costCenter: true },
            orderBy: { id: 'asc' },
          },
        },
      });

      await this.log('UPDATE', 'JournalEntry', id, { date, journalId });
      return this.mapJournalEntry(updated);
    });
  }

  async deleteJournalEntry(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!entry) throw new NotFoundException('Asiento no existe');
      if (entry.status !== 'DRAFT') {
        throw new BadRequestException(
          'Sólo los asientos en DRAFT se pueden eliminar',
        );
      }

      await tx.journalLine.deleteMany({ where: { entryId: id } });
      await tx.journalEntry.delete({ where: { id } });
      await this.log('DELETE', 'JournalEntry', id);
      return { id };
    });
  }

  // ------------------------------
  // Manual entries (DRAFT → POSTED)
  // ------------------------------
  async createManualEntry(dto: CreateManualEntryDto) {
    if (!dto.lines?.length)
      throw new BadRequestException('Debe enviar al menos una línea');

    const date = dto.date ? new Date(dto.date as any) : new Date();
    if (isNaN(date.getTime())) throw new BadRequestException('Fecha inválido');

    // DRAFT, sin número
    return this.prisma.$transaction(async (tx) => {
      await this.assertOpenPeriod(date);

      const syntheticSourceId = dto.sourceId ?? Math.round(Date.now() / 1000);

      const entry = await this.createEntry(tx, {
        date,
        sourceType: dto.sourceType || 'MANUAL',
        sourceId: syntheticSourceId,
        description: dto.description ?? null,
        lines: dto.lines,
        status: 'DRAFT',
        journalCodeOverride: 'GENERAL',
      });

      return tx.journalEntry.findUnique({
        where: { id: entry.id },
        include: { lines: true },
      });
    });
  }

  async postManualEntry(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!entry) throw new NotFoundException('Asiento no existe');
      if (entry.status !== 'DRAFT')
        throw new BadRequestException(
          'Solo se pueden postear asientos en DRAFT',
        );

      await this.assertOpenPeriod(entry.date);

      const period = await this.getOrCreatePeriodByDate(tx, entry.date);
      const journalId = entry.journalId
        ? entry.journalId
        : (await this.getOrCreateJournalByCode(tx, 'GENERAL')).id;

      const { number } = await this.allocateNumber(
        tx,
        period.id,
        entry.date,
        journalId,
      );
      await tx.journalEntry.update({
        where: { id: entry.id },
        data: { status: 'POSTED', periodId: period.id, journalId, number },
      });

      await this.log('POST', 'JournalEntry', entry.id, { status: 'POSTED' });
      return tx.journalEntry.findUnique({
        where: { id },
        include: { lines: true },
      });
    });
  }

  async updateEntryStatus(id: number, status: 'DRAFT' | 'POSTED') {
    if (status === 'POSTED') return this.postManualEntry(id);
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findUnique({ where: { id } });
      if (!entry) throw new NotFoundException('Asiento no existe');
      if (entry.status === 'REVERSED')
        throw new BadRequestException(
          'No se puede volver a DRAFT un asiento REVERSED',
        );
      if (entry.number != null)
        throw new BadRequestException(
          'No se puede volver a DRAFT un asiento numerado',
        );
      const updated = await tx.journalEntry.update({
        where: { id },
        data: { status: 'DRAFT' },
      });
      await this.log('UPDATE', 'JournalEntry', id, { status: 'DRAFT' });
      return updated;
    });
  }

  async reverseEntry(id: number, reason?: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const base = await tx.journalEntry.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!base) throw new NotFoundException('Asiento no existe');

      if (base.reversalId) {
        const reversed = await tx.journalEntry.findUnique({
          where: { id: base.reversalId },
        });
        return reversed;
      }

      await this.assertOpenPeriod(new Date());

      const rev = await this.createEntry(tx, {
        date: new Date(),
        sourceType: `${base.sourceType}_REV`,
        sourceId: base.sourceId,
        description: reason ?? `Reversa de entry ${base.id}`,
        lines: base.lines.map((l) => ({
          accountCode: l.accountCode,
          thirdPartyId: l.thirdPartyId,
          debit: this.num(l.credit),
          credit: this.num(l.debit),
          description: l.description ?? null,
        })),
        status: 'POSTED',
        journalCodeOverride: base.journalId
          ? ((await tx.journal.findUnique({ where: { id: base.journalId } }))
              ?.code ?? undefined)
          : undefined,
      });

      await tx.journalEntry.update({
        where: { id: base.id },
        data: { status: 'REVERSED', reversalId: rev.id },
      });

      await this.log('REVERSE', 'JournalEntry', base.id, {
        reversalId: rev.id,
      });
      return rev;
    });
  }

  // ------------------------------
  // Business postings (Sales/Purchase/Treasury/Stock)
  // ------------------------------
  async postCashSale(
    invoiceId: number,
    payments?: { methodId?: number | null; amount: number; note?: string }[],
  ) {
    const inv = await this.prisma.salesInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: { select: { itemId: true } },
        thirdParty: true,
        withholdings: true,
      },
    });
    if (!inv) throw new BadRequestException('Factura de venta no existe');
    if (inv.status !== 'ISSUED')
      throw new BadRequestException('La factura no está emitida');

    const date = inv.issueDate ?? new Date();
    await this.assertOpenPeriod(date);

    const income = await this.resolveIncomeAccountCode(
      inv.lines[0]?.itemId ?? null,
    );

    const subtotal = this.num(inv.subtotal);
    const storedTaxRaw = (inv as any)?.tax;
    const { amount: calcTax, accountCode: vat } = await this.calcVat({
      type: 'SALE',
      itemId: inv.lines[0]?.itemId ?? null,
      base: subtotal,
    });
    const tax =
      storedTaxRaw !== null && storedTaxRaw !== undefined
        ? this.num(storedTaxRaw)
        : calcTax;
    const storedTotalRaw = (inv as any)?.total;
    const total =
      storedTotalRaw !== null && storedTotalRaw !== undefined
        ? this.num(storedTotalRaw)
        : subtotal + tax;
    const markup = Math.round((total - (subtotal + tax)) * 100) / 100;

    const wht = { RTF: 0, RICA: 0, RIVA: 0 } as Record<WithholdingType, number>;
    for (const w of (inv as any).withholdings ?? []) {
      const t = (w.type as WithholdingType) ?? 'RTF';
      const amt = this.num(w.amount);
      if (t === 'RTF' || t === 'RICA' || t === 'RIVA') wht[t] += amt;
    }
    const withholdingTotal = wht.RTF + wht.RICA + wht.RIVA;
    const receivableNet = Math.max(0, total - withholdingTotal);

    const paymentSplits = (payments ?? []).filter(
      (p) => this.num(p.amount) > 0,
    );
    const paymentLines: AccountingLineInput[] = [];
    let collected = 0;

    for (const split of paymentSplits) {
      const amt = this.num(split.amount);
      if (amt <= 0) continue;
      const treasuryAccount = await this.resolveTreasuryAccountCode(
        split.methodId ?? null,
        'bank',
      );
      paymentLines.push({
        accountCode: treasuryAccount,
        debit: amt,
        thirdPartyId: inv.thirdPartyId,
        description: split.note ?? null,
      });
      collected += amt;
    }

    const missing = Math.round((receivableNet - collected) * 100) / 100;
    if (Math.abs(missing) > 0.009) {
      if (missing < 0) {
        throw new BadRequestException(
          'Los pagos registrados exceden el neto a cobrar de la factura.',
        );
      }
      if (missing > 0) {
        const fallbackAccount = await this.resolveTreasuryAccountCode(
          null,
          'cash',
        );
        paymentLines.push({
          accountCode: fallbackAccount,
          debit: missing,
          thirdPartyId: inv.thirdPartyId,
          description: 'Cobro contado pendiente de método',
        });
        collected += missing;
      }
    }

    if (paymentLines.length === 0 && receivableNet > 0) {
      const fallbackAccount = await this.resolveTreasuryAccountCode(
        null,
        'cash',
      );
      paymentLines.push({
        accountCode: fallbackAccount,
        debit: receivableNet,
        thirdPartyId: inv.thirdPartyId,
      });
      collected = receivableNet;
    }

    const lines: AccountingLineInput[] = [...paymentLines];

    for (const t of ['RTF', 'RICA', 'RIVA'] as WithholdingType[]) {
      const amt = wht[t];
      if (amt > 0) {
        const accountCode = await this.resolveWithholdingAccountCode(t, 'SALE');
        lines.push({
          accountCode,
          debit: amt,
          thirdPartyId: inv.thirdPartyId,
          description: `Retención ${t} sufrida`,
        });
      }
    }

    lines.push({
      accountCode: income,
      credit: subtotal,
      thirdPartyId: inv.thirdPartyId,
    });
    if (markup > 0) {
      lines.push({
        accountCode: income,
        credit: markup,
        thirdPartyId: inv.thirdPartyId,
        description: 'Recargo aplicado a la venta',
      });
    } else if (markup < 0) {
      lines.push({
        accountCode: income,
        debit: Math.abs(markup),
        thirdPartyId: inv.thirdPartyId,
        description: 'Ajuste por redondeo en venta',
      });
    }
    if (tax) {
      lines.push({
        accountCode: vat,
        credit: tax,
        thirdPartyId: inv.thirdPartyId,
      });
    }

    if (lines.length === 0) return null;

    return this.prisma.$transaction(async (tx) =>
      this.createEntry(tx, {
        date,
        sourceType: 'SALE_INVOICE',
        sourceId: inv.id,
        description: `FV ${inv.number} contado`,
        lines,
      }),
    );
  }

  async postSalesInvoice(invoiceId: number) {
    const inv = await this.prisma.salesInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: { select: { itemId: true } },
        thirdParty: true,
        withholdings: true, // ← NUEVO
      },
    });
    if (!inv) throw new BadRequestException('Factura de venta no existe');
    if (inv.paymentType === PaymentType.CASH) {
      return this.postCashSale(invoiceId);
    }
    if (inv.status !== 'ISSUED')
      throw new BadRequestException('La factura no está emitida');

    const date = inv.issueDate ?? new Date();
    await this.assertOpenPeriod(date);

    const ar = await this.resolveReceivableAccountCode(inv.thirdPartyId);
    const income = await this.resolveIncomeAccountCode(
      inv.lines[0]?.itemId ?? null,
    );

    const subtotal = this.num(inv.subtotal);
    const storedTaxRaw = (inv as any)?.tax;
    const { amount: calcTax, accountCode: vat } = await this.calcVat({
      type: 'SALE',
      itemId: inv.lines[0]?.itemId ?? null,
      base: subtotal,
    });
    const tax =
      storedTaxRaw !== null && storedTaxRaw !== undefined
        ? this.num(storedTaxRaw)
        : calcTax;
    const storedTotalRaw = (inv as any)?.total;
    const total =
      storedTotalRaw !== null && storedTotalRaw !== undefined
        ? this.num(storedTotalRaw)
        : subtotal + tax;
    const markup = Math.round((total - (subtotal + tax)) * 100) / 100;
    const wht = { RTF: 0, RICA: 0, RIVA: 0 } as Record<WithholdingType, number>;
    for (const w of (inv as any).withholdings ?? []) {
      const t = (w.type as WithholdingType) ?? 'RTF';
      const amt = this.num(w.amount);
      if (t === 'RTF' || t === 'RICA' || t === 'RIVA') wht[t] += amt;
    }
    const withholdingTotal = wht.RTF + wht.RICA + wht.RIVA;

    // La cuota inicial se reconoce contablemente cuando se registra el recibo de caja correspondiente.
    const receivableNet = Math.max(0, total - withholdingTotal);

    const lines: AccountingLineInput[] = [];

    if (receivableNet > 0) {
      lines.push({
        accountCode: ar,
        debit: receivableNet,
        thirdPartyId: inv.thirdPartyId,
      });
    }

    for (const t of ['RTF', 'RICA', 'RIVA'] as WithholdingType[]) {
      const amt = wht[t];
      if (amt > 0) {
        const accountCode = await this.resolveWithholdingAccountCode(t, 'SALE');
        lines.push({
          accountCode,
          debit: amt,
          thirdPartyId: inv.thirdPartyId,
          description: `Retención ${t} sufrida`,
        });
      }
    }

    lines.push({
      accountCode: income,
      credit: subtotal,
      thirdPartyId: inv.thirdPartyId,
    });
    if (markup > 0) {
      lines.push({
        accountCode: income,
        credit: markup,
        thirdPartyId: inv.thirdPartyId,
        description: 'Recargo por venta a crédito',
      });
    } else if (markup < 0) {
      lines.push({
        accountCode: income,
        debit: Math.abs(markup),
        thirdPartyId: inv.thirdPartyId,
        description: 'Ajuste por redondeo en venta',
      });
    }
    if (tax) {
      lines.push({
        accountCode: vat,
        credit: tax,
        thirdPartyId: inv.thirdPartyId,
      });
    }

    return this.prisma.$transaction(async (tx) =>
      this.createEntry(tx, {
        date,
        sourceType: 'SALE_INVOICE',
        sourceId: inv.id,
        description: `FV ${inv.number}`,
        lines,
      }),
    );
  }

  async reverseSalesInvoice(invoiceId: number) {
    return this.reverseBySource('SALE_INVOICE', invoiceId, 'Anulación FV');
  }

  async postPurchaseInvoice(invoiceId: number) {
    const inv = await this.prisma.purchaseInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: {
          select: {
            itemId: true,
            item: {
              select: {
                type: true,
              },
            },
          },
        },
        thirdParty: true,
        withholdings: true, // ← NUEVO
      },
    });
    if (!inv) throw new BadRequestException('Factura de compra no existe');
    if (inv.status !== 'ISSUED')
      throw new BadRequestException('La factura no está emitida');

    const date = inv.issueDate ?? new Date();
    await this.assertOpenPeriod(date);

    const expense = await this.resolveExpenseOrCogsAccountCode(
      inv.lines[0]?.itemId ?? null,
    );
    const productLines = inv.lines.filter(
      (ln) => ln.item?.type === ItemType.PRODUCT,
    );
    const allLinesAreProduct =
      productLines.length > 0 && productLines.length === inv.lines.length;
    const inventoryAccount = allLinesAreProduct
      ? await this.resolveInventoryAccountCode(productLines[0]?.itemId ?? null)
      : null;
    const subtotal = this.num(inv.subtotal);
    const rawTax = (inv as any)?.tax;
    const providedTax =
      rawTax === null || rawTax === undefined ? undefined : this.num(rawTax);
    const { amount: calcTax, accountCode: vat } = await this.calcVat({
      type: 'PURCHASE',
      itemId: inv.lines[0]?.itemId ?? null,
      base: subtotal,
    });
    const tax = providedTax ?? calcTax;
    const ap = await this.resolvePayableAccountCode(inv.thirdPartyId);
    const total = this.num(inv.total) || subtotal + tax;

    const wht = { RTF: 0, RICA: 0, RIVA: 0 } as Record<WithholdingType, number>;
    for (const w of (inv as any).withholdings ?? []) {
      const t = (w.type as WithholdingType) ?? 'RTF';
      const amt = this.num(w.amount);
      if (t === 'RTF' || t === 'RICA' || t === 'RIVA') wht[t] += amt;
    }
    const withholdingTotal = wht.RTF + wht.RICA + wht.RIVA;

    const payableNet = Math.max(0, total - withholdingTotal);

    const lines: AccountingLineInput[] = [];
    lines.push({
      accountCode: inventoryAccount ?? expense,
      debit: subtotal,
      thirdPartyId: inv.thirdPartyId,
    });
    if (tax) {
      lines.push({
        accountCode: vat,
        debit: tax,
        thirdPartyId: inv.thirdPartyId,
      });
    }

    if (payableNet > 0) {
      // Si la factura es de contado, registrar en tesorería (cuenta de efectivo/banco)
      // en lugar de crear una CxP. `inv.paymentType` y `inv.paymentMethodId` pueden
      // indicar el método de pago. Si no hay preferencia, fallback a CxP.
      const isCash =
        (inv as any).paymentType === 'CASH' ||
        (inv as any).paymentType === 'CASH';
      if (isCash) {
        const treasury = await this.resolveTreasuryAccountCode(
          (inv as any).paymentMethodId ?? null,
          'cash',
        );
        lines.push({
          accountCode: treasury,
          credit: payableNet,
          thirdPartyId: inv.thirdPartyId,
        });
      } else {
        lines.push({
          accountCode: ap,
          credit: payableNet,
          thirdPartyId: inv.thirdPartyId,
        });
      }
    }

    for (const t of ['RTF', 'RICA', 'RIVA'] as WithholdingType[]) {
      const amt = wht[t];
      if (amt > 0) {
        const accountCode = await this.resolveWithholdingAccountCode(
          t,
          'PURCHASE',
        );
        lines.push({
          accountCode,
          credit: amt,
          thirdPartyId: inv.thirdPartyId,
          description: `Retención ${t} practicada`,
        });
      }
    }

    return this.prisma.$transaction(async (tx) =>
      this.createEntry(tx, {
        date,
        sourceType: 'PURCHASE_INVOICE',
        sourceId: inv.id,
        description: `FC ${inv.number}`,
        lines,
      }),
    );
  }

  async reversePurchaseInvoice(invoiceId: number) {
    return this.reverseBySource('PURCHASE_INVOICE', invoiceId, 'Anulación FC');
  }

  async postCashReceipt(receiptId: number) {
    const rc = await this.prisma.cashReceipt.findUnique({
      where: { id: receiptId },
      include: {
        thirdParty: true,
        allocations: {
          include: { invoice: { select: { id: true, number: true } } },
        },
      },
    });
    if (!rc) throw new BadRequestException('Recibo no existe');

    const date = rc.date ?? new Date();
    await this.assertOpenPeriod(date);

    const ar = await this.resolveReceivableAccountCode(rc.thirdPartyId);
    const treasury = await this.resolveTreasuryAccountCode(rc.methodId, 'bank');
    const total = this.num(rc.total);

    return this.prisma.$transaction(async (tx) =>
      this.createEntry(tx, {
        date,
        sourceType: 'CASH_RECEIPT',
        sourceId: rc.id,
        description: `Cobro a ${rc.thirdParty?.name ?? rc.thirdPartyId}`,
        lines: [
          {
            accountCode: treasury,
            debit: total,
            thirdPartyId: rc.thirdPartyId,
          },
          { accountCode: ar, credit: total, thirdPartyId: rc.thirdPartyId },
        ],
      }),
    );
  }

  async reverseCashReceipt(receiptId: number) {
    return this.reverseBySource('CASH_RECEIPT', receiptId, 'Reversa cobro');
  }

  async postVendorPayment(paymentId: number) {
    const vp = await this.prisma.vendorPayment.findUnique({
      where: { id: paymentId },
      include: {
        thirdParty: true,
        allocations: {
          include: { invoice: { select: { id: true, number: true } } },
        },
      },
    });
    if (!vp) throw new BadRequestException('Pago a proveedor no existe');

    const date = vp.date ?? new Date();
    await this.assertOpenPeriod(date);

    const ap = await this.resolvePayableAccountCode(vp.thirdPartyId);
    const treasury = await this.resolveTreasuryAccountCode(vp.methodId, 'bank');
    const total = this.num(vp.total);

    return this.prisma.$transaction(async (tx) =>
      this.createEntry(tx, {
        date,
        sourceType: 'VENDOR_PAYMENT',
        sourceId: vp.id,
        description: `Pago a ${vp.thirdParty?.name ?? vp.thirdPartyId}`,
        lines: [
          { accountCode: ap, debit: total, thirdPartyId: vp.thirdPartyId },
          {
            accountCode: treasury,
            credit: total,
            thirdPartyId: vp.thirdPartyId,
          },
        ],
      }),
    );
  }

  async reverseVendorPayment(paymentId: number) {
    return this.reverseBySource(
      'VENDOR_PAYMENT',
      paymentId,
      'Reversa pago a proveedor',
    );
  }

  async postStockMove(moveId: number) {
    const mv = await this.prisma.stockMove.findUnique({
      where: { id: moveId },
      include: { item: { select: { id: true } } },
    });
    if (!mv)
      throw new BadRequestException('Movimiento de inventario no existe');

    const date = mv.ts ?? new Date();
    await this.assertOpenPeriod(date);

    const qty = this.num(mv.qty);
    const unitCost = this.num(mv.unitCost);
    const amount = Math.abs(qty * unitCost);
    if (amount === 0) return null;

    const inventory = await this.resolveInventoryAccountCode(mv.itemId);
    const cogs = await this.resolveExpenseOrCogsAccountCode(mv.itemId);

    if (mv.type === 'SALE') {
      return this.prisma.$transaction(async (tx) =>
        this.createEntry(tx, {
          date,
          sourceType: 'STOCK_MOVE',
          sourceId: mv.id,
          description: `Salida por venta item#${mv.itemId}`,
          lines: [
            { accountCode: cogs, debit: amount },
            { accountCode: inventory, credit: amount },
          ],
        }),
      );
    }

    if (mv.type === 'ADJUSTMENT') {
      let reason =
        (mv.adjustmentReason as StockAdjustmentReason | null) ??
        StockAdjustmentReason.ACCOUNTING;
      const refTypeUpper = (mv.refType ?? '').toUpperCase();
      if (reason === StockAdjustmentReason.ACCOUNTING) {
        if (refTypeUpper === 'PRODUCTION') {
          reason = StockAdjustmentReason.PRODUCTION;
        } else if (refTypeUpper === 'CUSTOMER_RETURN') {
          reason = StockAdjustmentReason.CUSTOMER_RETURN;
        } else if (refTypeUpper === 'DONATION') {
          reason = StockAdjustmentReason.DONATION;
        }
      }
      const plus = qty > 0;

      if (reason === StockAdjustmentReason.PRODUCTION) {
        const productionCost =
          this.accountSettings.getAccountCodeSync('productionCost') ||
          this.accountSettings.getAccountCodeSync('cogs');
        return this.prisma.$transaction(async (tx) =>
          this.createEntry(tx, {
            date,
            sourceType: 'PRODUCTION_MOVE',
            sourceId: mv.id,
            description: `Producción item#${mv.itemId}`,
            lines: plus
              ? [
                  { accountCode: inventory, debit: amount },
                  { accountCode: productionCost, credit: amount },
                ]
              : [
                  { accountCode: productionCost, debit: amount },
                  { accountCode: inventory, credit: amount },
                ],
          }),
        );
      }

      if (reason === StockAdjustmentReason.CUSTOMER_RETURN) {
        const salesReturn =
          this.accountSettings.getAccountCodeSync('salesReturns') ||
          this.accountSettings.getAccountCodeSync('salesIncome');
        return this.prisma.$transaction(async (tx) =>
          this.createEntry(tx, {
            date,
            sourceType: 'CUSTOMER_RETURN',
            sourceId: mv.id,
            description: `Devolución cliente item#${mv.itemId}`,
            lines: plus
              ? [
                  { accountCode: inventory, debit: amount },
                  { accountCode: salesReturn, credit: amount },
                ]
              : [
                  { accountCode: salesReturn, debit: amount },
                  { accountCode: inventory, credit: amount },
                ],
          }),
        );
      }

      if (reason === StockAdjustmentReason.DONATION) {
        const donationExpense =
          this.accountSettings.getAccountCodeSync('donationExpense') ||
          this.accountSettings.getAccountCodeSync('adjLoss') ||
          this.accountSettings.getAccountCodeSync('cogs');
        return this.prisma.$transaction(async (tx) =>
          this.createEntry(tx, {
            date,
            sourceType: 'INVENTORY_DONATION',
            sourceId: mv.id,
            description: `Donación inventario item#${mv.itemId}`,
            lines: plus
              ? [
                  { accountCode: inventory, debit: amount },
                  { accountCode: donationExpense, credit: amount },
                ]
              : [
                  { accountCode: donationExpense, debit: amount },
                  { accountCode: inventory, credit: amount },
                ],
          }),
        );
      }

      const adjGainCode = this.accountSettings.getAccountCodeSync('adjGain');
      const adjLossCode = this.accountSettings.getAccountCodeSync('adjLoss');
      return this.prisma.$transaction(async (tx) =>
        this.createEntry(tx, {
          date,
          sourceType: 'INVENTORY_ADJ',
          sourceId: mv.id,
          description: `Ajuste inventario item#${mv.itemId}`,
          lines: plus
            ? [
                { accountCode: inventory, debit: amount },
                { accountCode: adjGainCode, credit: amount },
              ]
            : [
                { accountCode: adjLossCode, debit: amount },
                { accountCode: inventory, credit: amount },
              ],
        }),
      );
    }

    return null;
  }

  async postInventoryAdjustment(adjustmentMoveId: number) {
    return this.postStockMove(adjustmentMoveId);
  }

  private async reverseBySource(
    sourceType: string,
    sourceId: number,
    description?: string,
  ) {
    const base = await this.prisma.journalEntry.findFirst({
      where: { sourceType, sourceId },
      include: { lines: true },
      orderBy: { id: 'asc' },
    });
    if (!base)
      throw new BadRequestException(
        `No hay asiento para ${sourceType}#${sourceId}`,
      );

    const maybeExistingReverse = await this.prisma.journalEntry.findFirst({
      where: { sourceType: `${sourceType}_REV`, sourceId },
    });
    if (maybeExistingReverse) return maybeExistingReverse;

    const date = new Date();
    return this.prisma.$transaction(async (tx) => {
      const rev = await this.createEntry(tx, {
        date,
        sourceType: `${sourceType}_REV`,
        sourceId,
        description:
          description ??
          `Reversa de ${sourceType}#${sourceId} (entry ${base.id})`,
        lines: base.lines.map((l) => ({
          accountCode: l.accountCode,
          thirdPartyId: l.thirdPartyId,
          debit: this.num(l.credit),
          credit: this.num(l.debit),
          description: l.description ?? null,
        })),
      });

      await tx.journalEntry.update({
        where: { id: base.id },
        data: { status: 'REVERSED', reversalId: rev.id },
      });
      await this.log('REVERSE', 'JournalEntry', base.id, {
        reversalId: rev.id,
      });
      return rev;
    });
  }

  // ------------------------------
  // Extra reports
  // ------------------------------
  async vatReport(from?: Dt, to?: Dt, kind: VatKind = 'SALES') {
    const { gte, lte } = this.parseRange(from, to);
    const acct =
      kind === 'SALES'
        ? (ACCOUNTS.salesVat ?? ACCOUNTS.salesVat)
        : (ACCOUNTS.purchaseVat ?? ACCOUNTS.purchaseVat);
    if (!acct)
      throw new BadRequestException(
        'Configura las cuentas de IVA en accounts.map',
      );

    const lines = await this.prisma.journalLine.findMany({
      where: { accountCode: acct, entry: { date: { gte, lte } } },
      select: {
        debit: true,
        credit: true,
        entry: {
          select: {
            date: true,
            description: true,
            sourceType: true,
            sourceId: true,
          },
        },
      },
      orderBy: { entry: { date: 'asc' } },
    });

    const rows = lines.map((l) => ({
      date: l.entry.date,
      sourceType: l.entry.sourceType,
      sourceId: l.entry.sourceId,
      description: l.entry.description ?? null,
      amount:
        kind === 'SALES'
          ? this.num(l.credit) - this.num(l.debit)
          : this.num(l.debit) - this.num(l.credit),
    }));
    const total = rows.reduce((a, r) => a + r.amount, 0);
    return { from: gte, to: lte, kind, total, rows };
  }

  async agingReport(asOf?: Dt, scope: AgingScope = 'AR') {
    const asOfDate = asOf ? new Date(asOf) : new Date();
    if (isNaN(asOfDate.getTime()))
      throw new BadRequestException('asOf inválido');

    const inst = await this.prisma.installment.findMany({
      where:
        scope === 'AR'
          ? { receivable: { isNot: null } }
          : { payable: { isNot: null } },
      select: {
        id: true,
        dueDate: true,
        amount: true,
        paidAmount: true,
        receivable: {
          select: {
            thirdPartyId: true,
            thirdParty: { select: { name: true } },
          },
        },
        payable: {
          select: {
            thirdPartyId: true,
            thirdParty: { select: { name: true } },
          },
        },
      },
    });

    type Row = {
      thirdPartyId: number;
      thirdPartyName: string;
      current: number;
      d30: number;
      d60: number;
      d90: number;
      d90p: number;
    };
    const map = new Map<number, Row>();

    for (const i of inst) {
      const tpId =
        scope === 'AR' ? i.receivable?.thirdPartyId : i.payable?.thirdPartyId;
      if (!tpId) continue;
      const name =
        scope === 'AR'
          ? (i.receivable?.thirdParty?.name ?? '')
          : (i.payable?.thirdParty?.name ?? '');
      const cur = map.get(tpId) ?? {
        thirdPartyId: tpId,
        thirdPartyName: name,
        current: 0,
        d30: 0,
        d60: 0,
        d90: 0,
        d90p: 0,
      };

      const pending = this.num(i.amount) - this.num(i.paidAmount);
      if (pending <= 0) {
        map.set(tpId, cur);
        continue;
      }

      const days = Math.floor(
        (asOfDate.getTime() - new Date(i.dueDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (days <= 0) cur.current += pending;
      else if (days <= 30) cur.d30 += pending;
      else if (days <= 60) cur.d60 += pending;
      else if (days <= 90) cur.d90 += pending;
      else cur.d90p += pending;

      map.set(tpId, cur);
    }

    const rows = [...map.values()].sort((a, b) =>
      a.thirdPartyName.localeCompare(b.thirdPartyName),
    );
    const totals = rows.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        d30: acc.d30 + r.d30,
        d60: acc.d60 + r.d60,
        d90: acc.d90 + r.d90,
        d90p: acc.d90p + r.d90p,
      }),
      { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 },
    );
    return { asOf: asOfDate, scope, totals, rows };
  }

  async kardex(itemId: number, from?: Dt, to?: Dt) {
    if (!itemId) throw new BadRequestException('itemId requerido');
    const { gte, lte } = this.parseRange(from, to);

    const moves = await this.prisma.stockMove.findMany({
      where: { itemId, ts: { gte, lte } },
      orderBy: { ts: 'asc' },
      select: {
        id: true,
        ts: true,
        type: true,
        qty: true,
        unitCost: true,
        note: true,
        warehouseId: true,
      },
    });

    const rows = moves.map((m) => ({
      id: m.id,
      ts: m.ts,
      type: m.type,
      qty: this.num(m.qty),
      unitCost: this.num(m.unitCost),
      amount: Math.round(this.num(m.qty) * this.num(m.unitCost) * 100) / 100,
      warehouseId: m.warehouseId,
      note: m.note ?? null,
    }));

    const totals = rows.reduce(
      (acc, r) => {
        const amt = Math.abs(r.amount);
        if (r.qty >= 0) {
          acc.inQty += r.qty;
          acc.inAmt += amt;
        } else {
          acc.outQty += Math.abs(r.qty);
          acc.outAmt += amt;
        }
        return acc;
      },
      { inQty: 0, inAmt: 0, outQty: 0, outAmt: 0 },
    );

    return { itemId, from: gte, to: lte, totals, rows };
  }

  async cogsByItem(from?: Dt, to?: Dt) {
    const { gte, lte } = this.parseRange(from, to);
    const cons = await this.prisma.stockConsumption.findMany({
      where: { ts: { gte, lte } },
      select: { itemId: true, qty: true, unitCost: true },
    });
    const map = new Map<number, { qty: number; amount: number }>();
    for (const c of cons) {
      const cur = map.get(c.itemId) ?? { qty: 0, amount: 0 };
      const q = this.num(c.qty);
      const a = q * this.num(c.unitCost);
      cur.qty += q;
      cur.amount += a;
      map.set(c.itemId, cur);
    }
    const rows = [...map.entries()].map(([itemId, v]) => ({
      itemId,
      qty: v.qty,
      cogs: Math.round(v.amount * 100) / 100,
    }));
    const total = rows.reduce((acc, r) => acc + r.cogs, 0);
    return { from: gte, to: lte, total, rows };
  }

  // ======================================================
  // NUEVOS MÉTODOS DE EXPORTACIÓN Y CONCILIACIÓN DE IVA
  // ======================================================

  /**
   * Exporta el “diario” (todas las líneas) en el rango.
   * Devuelve filas ya ordenadas por fecha, source y cuenta.
   */
  async exportJournal(from?: Dt, to?: Dt) {
    const { gte, lte } = this.parseRange(from, to);

    const lines = await this.prisma.journalLine.findMany({
      where: { entry: { date: { gte, lte } } },
      orderBy: [{ entry: { date: 'asc' } }, { entryId: 'asc' }, { id: 'asc' }],
      select: {
        accountCode: true,
        debit: true,
        credit: true,
        description: true,
        account: { select: { name: true } },
        entry: { select: { date: true, sourceType: true, sourceId: true } },
      },
    });

    type Row = {
      date: string;
      source: string;
      accountCode: string;
      accountName: string;
      description: string | null;
      debit: number;
      credit: number;
    };

    const rows: Row[] = lines.map((l) => ({
      date: new Date(l.entry.date).toISOString().slice(0, 10),
      source: `${l.entry.sourceType}#${l.entry.sourceId}`,
      accountCode: l.accountCode,
      accountName: l.account?.name ?? '',
      description: l.description ?? null,
      debit: this.num(l.debit),
      credit: this.num(l.credit),
    }));

    // Totales
    const totals = rows.reduce(
      (acc, r) => {
        acc.debit += r.debit;
        acc.credit += r.credit;
        return acc;
      },
      { debit: 0, credit: 0 },
    );

    return { from: gte, to: lte, totals, rows };
  }

  /**
   * Exporta el libro mayor general.
   * Calcula el runBalance por cuenta según su naturaleza.
   */
  async exportLedger(from?: Dt, to?: Dt) {
    const { gte, lte } = this.parseRange(from, to);

    const lines = await this.prisma.journalLine.findMany({
      where: { entry: { date: { gte, lte } } },
      orderBy: [
        { accountCode: 'asc' },
        { entry: { date: 'asc' } },
        { id: 'asc' },
      ],
      select: {
        accountCode: true,
        debit: true,
        credit: true,
        description: true,
        account: { select: { name: true, nature: true } },
        entry: { select: { date: true, sourceType: true, sourceId: true } },
      },
    });

    type Row = {
      accountCode: string;
      accountName: string;
      date: string;
      source: string;
      description: string | null;
      debit: number;
      credit: number;
      runBalance: number;
    };

    const runByAccount = new Map<string, { nature: 'D' | 'C'; run: number }>();
    const rows: Row[] = [];

    for (const l of lines) {
      const code = l.accountCode;
      const nature = (l.account?.nature as 'D' | 'C') ?? 'D';
      const state = runByAccount.get(code) ?? { nature, run: 0 };
      const d = this.num(l.debit);
      const c = this.num(l.credit);
      state.run += this.accountBalance(nature, d, c);
      runByAccount.set(code, state);

      rows.push({
        accountCode: code,
        accountName: l.account?.name ?? '',
        date: new Date(l.entry.date).toISOString().slice(0, 10),
        source: `${l.entry.sourceType}#${l.entry.sourceId}`,
        description: l.description ?? null,
        debit: d,
        credit: c,
        runBalance: state.run,
      });
    }

    return { from: gte, to: lte, rows };
  }

  /**
   * Conciliación de IVA entre libros (por facturas) y mayor contable.
   * Compara total de IVA de ventas/compras (libros) vs movimiento de las cuentas
   * ACCOUNTS.salesVat y ACCOUNTS.purchaseVat en el rango.
   */
  async reconcileVat(from?: Dt, to?: Dt) {
    const { gte, lte } = this.parseRange(from, to);

    // Libros (por impuestos declarados en facturas)
    const sales = await this.salesBook(from, to, 'invoice');
    const purchases = await this.purchaseBook(from, to, 'invoice');

    const bookSalesTotal = Object.values(sales.totals.vatByRate ?? {}).reduce(
      (a, v) => a + v,
      0,
    );
    const bookPurchTotal = Object.values(
      purchases.totals.vatByRate ?? {},
    ).reduce((a, v) => a + v, 0);

    // Mayor contable (cuentas de IVA)
    const salesLedger = (await this.vatReport(from, to, 'SALES')).total;
    const purchLedger = (await this.vatReport(from, to, 'PURCHASES')).total;

    const out = {
      from: gte,
      to: lte,
      ledger: {
        sales: salesLedger,
        purchases: purchLedger,
        net: salesLedger - purchLedger,
      },
      books: {
        sales: bookSalesTotal,
        purchases: bookPurchTotal,
        net: bookSalesTotal - bookPurchTotal,
        byRate: {
          sales: sales.totals.vatByRate,
          purchases: purchases.totals.vatByRate,
        },
      },
      diff: {
        sales: salesLedger - bookSalesTotal,
        purchases: purchLedger - bookPurchTotal,
        net: salesLedger - purchLedger - (bookSalesTotal - bookPurchTotal),
      },
    };

    return out;
  }
  async getPeriodsSummary(options?: { months?: number; focusYear?: number }) {
    const months = Math.min(
      120,
      Math.max(6, Math.floor(options?.months ?? 24)),
    );
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const startRef = new Date(currentMonthStart);
    startRef.setMonth(startRef.getMonth() - (months - 1));

    const monthSlots: { year: number; month: number }[] = [];
    for (let i = 0; i < months; i++) {
      const cursor = new Date(
        startRef.getFullYear(),
        startRef.getMonth() + i,
        1,
      );
      monthSlots.push({
        year: cursor.getFullYear(),
        month: cursor.getMonth() + 1,
      });
    }

    if (options?.focusYear) {
      for (let m = 1; m <= 12; m++) {
        if (
          !monthSlots.some(
            (slot) => slot.year === options.focusYear && slot.month === m,
          )
        ) {
          monthSlots.push({ year: options.focusYear, month: m });
        }
      }
    }

    const normalizedSlots = Array.from(
      new Map(
        monthSlots.map((slot) => [`${slot.year}-${slot.month}`, slot]),
      ).values(),
    );

    normalizedSlots.sort((a, b) =>
      a.year === b.year ? a.month - b.month : a.year - b.year,
    );

    const minYear = Math.min(...normalizedSlots.map((s) => s.year));
    const maxYear = Math.max(...normalizedSlots.map((s) => s.year));

    const periods = await this.prisma.accountingPeriod.findMany({
      where: { year: { gte: minYear, lte: maxYear }, type: 'REGULAR' } as any,
    });
    const periodByKey = new Map(
      periods.map((p) => [`${p.year}-${p.month}`, p]),
    );

    const monthDetails = await Promise.all(
      normalizedSlots.map(async (slot) => {
        const { year, month } = slot;
        const key = `${year}-${month}`;
        const snapshot = periodByKey.get(key) as any;
        const start = this.startOfMonth(year, month);
        const end = this.endOfMonth(year, month);

        const [draftEntries, postedEntries, reversedEntries] =
          await Promise.all([
            this.prisma.journalEntry.count({
              where: { date: { gte: start, lte: end }, status: 'DRAFT' as any },
            }),
            this.prisma.journalEntry.count({
              where: {
                date: { gte: start, lte: end },
                status: 'POSTED' as any,
              },
            }),
            this.prisma.journalEntry.count({
              where: {
                date: { gte: start, lte: end },
                status: 'REVERSED' as any,
              },
            }),
          ]);

        return {
          year,
          month,
          status: (snapshot?.status as 'OPEN' | 'CLOSED' | 'LOCKED') ?? 'OPEN',
          start: start.toISOString(),
          end: end.toISOString(),
          closedAt: snapshot?.closedAt?.toISOString() ?? null,
          reopenedAt: snapshot?.reopenedAt?.toISOString() ?? null,
          lockedAt: snapshot?.lockedAt?.toISOString() ?? null,
          lockReason: snapshot?.lockReason ?? null,
          draftEntries,
          postedEntries,
          reversedEntries,
          requiredRole: snapshot?.requiredRole ?? null,
        };
      }),
    );

    monthDetails.sort((a, b) =>
      a.year === b.year ? a.month - b.month : a.year - b.year,
    );

    const yearAccumulator = new Map<
      number,
      { year: number; closedMonths: number; totalMonths: number }
    >();
    for (const detail of monthDetails) {
      const bundle = yearAccumulator.get(detail.year) ?? {
        year: detail.year,
        closedMonths: 0,
        totalMonths: 0,
      };
      bundle.totalMonths += 1;
      if (detail.status === 'CLOSED') bundle.closedMonths += 1;
      yearAccumulator.set(detail.year, bundle);
    }

    const previousMonth = new Date(currentMonthStart);
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    const recommended = monthDetails
      .filter((item) => new Date(item.year, item.month - 1, 1) <= previousMonth)
      .find((item) => item.status !== 'CLOSED' && item.status !== 'LOCKED');

    return {
      generatedAt: now.toISOString(),
      months: monthDetails,
      years: Array.from(yearAccumulator.values()).map((y) => ({
        ...y,
        fullyClosed: y.totalMonths >= 12 && y.closedMonths === 12,
      })),
      recommended: recommended
        ? { year: recommended.year, month: recommended.month }
        : null,
    };
  }

  // ====== Periodos contables: cerrar / abrir ======
  async closePeriod(dto: ClosePeriodDto) {
    const { year, month } = dto;
    const type = dto.type ?? 'REGULAR';

    if (!year || month < 1 || month > 13) {
      throw new BadRequestException('Periodo inválido');
    }
    if (type === 'REGULAR' && month > 12) {
      throw new BadRequestException(
        'El período 13 sólo se permite para tipos especiales',
      );
    }

    const periodSnapshot = (await this.prisma.accountingPeriod.findFirst({
      where: { year, month, type } as any,
    })) as any;

    if (!periodSnapshot && type !== 'REGULAR') {
      throw new BadRequestException(
        'Debe crear primero el período especial antes de cerrarlo',
      );
    }

    const start = periodSnapshot?.start ?? this.startOfMonth(year, month);
    const end = periodSnapshot?.end ?? this.endOfMonth(year, month);
    const label = periodSnapshot?.label ?? null;

    const drafts = await this.prisma.journalEntry.count({
      where: { date: { gte: start, lte: end }, status: 'DRAFT' },
    });
    if (drafts > 0) {
      throw new BadRequestException(
        `No se puede cerrar ${year}-${String(month).padStart(2, '0')}: hay ${drafts} asientos en DRAFT`,
      );
    }

    const closedAt = new Date();
    const status = dto.lockAfterClose ? 'LOCKED' : 'CLOSED';
    const lockReason = dto.lockAfterClose
      ? (dto.lockReason ?? label ?? null)
      : null;
    const requiredRole = dto.requiredRole
      ? dto.requiredRole.toUpperCase()
      : (periodSnapshot?.requiredRole ?? null);

    const period = await this.prisma.accountingPeriod.upsert({
      where: { year_month_type: { year, month, type } } as any,
      update: {
        start,
        end,
        status,
        closedAt,
        reopenedAt: null,
        lockedAt: dto.lockAfterClose ? closedAt : null,
        lockReason,
        requiredRole,
        allowBackPostUntil: null,
      } as any,
      create: {
        year,
        month,
        type,
        start,
        end,
        status,
        closedAt,
        reopenedAt: null,
        lockedAt: dto.lockAfterClose ? closedAt : null,
        lockReason,
        requiredRole,
        allowBackPostUntil: null,
      } as any,
    } as any);

    await this.log('CLOSE_PERIOD', 'AccountingPeriod', period.id, {
      year,
      month,
      type,
      status,
    });
    return period;
  }

  async openPeriod(dto: OpenPeriodDto) {
    const { year, month } = dto;
    const type = dto.type ?? 'REGULAR';
    if (!year || month < 1 || month > 13) {
      throw new BadRequestException('Periodo inválido');
    }
    if (type === 'REGULAR' && month > 12) {
      throw new BadRequestException(
        'El período 13 sólo se permite como especial o de ajuste',
      );
    }

    let start: Date;
    let end: Date;
    if (type === 'REGULAR') {
      start = this.startOfMonth(year, month);
      end = this.endOfMonth(year, month);
    } else {
      if (!dto.start || !dto.end) {
        throw new BadRequestException(
          'Debe indicar start y end para períodos especiales',
        );
      }
      start = new Date(dto.start);
      end = new Date(dto.end);
      if (
        !(start instanceof Date) ||
        Number.isNaN(start.getTime()) ||
        !(end instanceof Date) ||
        Number.isNaN(end.getTime()) ||
        start >= end
      ) {
        throw new BadRequestException(
          'Rango de fechas inválido para el período',
        );
      }
    }

    const allowBackPostUntil = dto.allowBackPostUntil
      ? new Date(dto.allowBackPostUntil)
      : end;
    if (Number.isNaN(allowBackPostUntil.getTime())) {
      throw new BadRequestException('allowBackPostUntil inválido');
    }
    const requiredRole = dto.requiredRole
      ? dto.requiredRole.toUpperCase()
      : null;
    const label =
      dto.label ??
      (type === 'REGULAR'
        ? null
        : `Período ${type.toLowerCase()} ${year}-${String(month).padStart(2, '0')}`);

    const period = await this.prisma.accountingPeriod.upsert({
      where: { year_month_type: { year, month, type } } as any,
      update: {
        start,
        end,
        status: 'OPEN',
        reopenedAt: new Date(),
        lockedAt: null,
        lockReason: null,
        requiredRole,
        label,
        allowBackPostUntil,
      } as any,
      create: {
        year,
        month,
        type,
        start,
        end,
        status: 'OPEN',
        label,
        requiredRole,
        allowBackPostUntil,
      } as any,
    } as any);
    await this.log('OPEN_PERIOD', 'AccountingPeriod', period.id, {
      year,
      month,
      type,
      status: 'OPEN',
    });
    return period;
  }

  async lockPeriod(dto: LockPeriodDto) {
    const { year, month } = dto;
    const type = dto.type ?? 'REGULAR';
    if (!year || month < 1 || month > 13) {
      throw new BadRequestException('Periodo inválido');
    }

    const snapshot = (await this.prisma.accountingPeriod.findFirst({
      where: { year, month, type } as any,
    })) as any;

    if (!snapshot) {
      throw new BadRequestException('El período no existe');
    }

    const lock = dto.lock !== false;
    const now = new Date();

    const updated = await this.prisma.accountingPeriod.update({
      where: { id: snapshot.id },
      data: {
        status: lock ? 'LOCKED' : snapshot.closedAt ? 'CLOSED' : 'OPEN',
        lockedAt: lock ? now : null,
        lockReason: lock ? (dto.reason ?? snapshot.lockReason ?? null) : null,
        requiredRole: dto.requiredRole
          ? dto.requiredRole.toUpperCase()
          : (snapshot.requiredRole ?? null),
      } as any,
    });

    await this.log(
      lock ? 'CLOSE_PERIOD' : 'OPEN_PERIOD',
      'AccountingPeriod',
      updated.id,
      {
        year,
        month,
        type,
        status: updated.status,
        action: lock ? 'LOCK' : 'UNLOCK',
      },
    );

    return updated;
  }

  async massReversePeriodEntries(dto: MassReversePeriodDto) {
    const { year, month } = dto;
    const type = dto.type ?? 'REGULAR';
    if (!year || month < 1 || month > 13) {
      throw new BadRequestException('Periodo inválido');
    }

    const snapshot = (await this.prisma.accountingPeriod.findFirst({
      where: { year, month, type } as any,
    })) as any;
    if (!snapshot) {
      throw new BadRequestException('El período no existe');
    }

    const start = snapshot.start ?? this.startOfMonth(year, month);
    const end = snapshot.end ?? this.endOfMonth(year, month);

    const entries = await this.prisma.journalEntry.findMany({
      where: {
        date: { gte: start, lte: end },
        status: 'POSTED',
        ...(dto.sourceTypePrefix
          ? { sourceType: { startsWith: dto.sourceTypePrefix } }
          : {}),
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });

    const reversals: Array<{ originalId: number; reversalId: number }> = [];
    for (const entry of entries) {
      const reversed = await this.reverseEntry(
        entry.id,
        dto.reason ??
          `Reversión masiva ${year}-${String(month).padStart(2, '0')}`,
      );
      if (reversed) {
        reversals.push({ originalId: entry.id, reversalId: reversed.id });
      }
    }

    return { year, month, type, count: entries.length, reversals };
  }

  async reconcileFinancialStatements(dto: ReconcileStatementDto) {
    const statement = dto.statement ?? 'BALANCE_SHEET';
    const version = dto.version ?? 'OFFICIAL';
    const year = dto.year;
    const asOf = dto.asOf
      ? new Date(dto.asOf)
      : new Date(year, 11, 31, 23, 59, 59, 999);
    if (Number.isNaN(asOf.getTime())) {
      throw new BadRequestException('Fecha asOf inválida');
    }

    const official = await (
      this.prisma as any
    ).financialStatementSnapshot.findMany({
      where: { year, statement, version } as any,
      orderBy: { accountCode: 'asc' },
    });

    if (official.length === 0) {
      return {
        year,
        statement,
        version,
        asOf,
        rows: [],
        totals: { official: 0, ledger: 0, difference: 0 },
      };
    }

    const accountCodes = official.map((row: any) => row.accountCode);
    const dateFilter: any = { lte: asOf };
    if (statement !== 'BALANCE_SHEET') {
      dateFilter.gte = new Date(year, 0, 1);
    }

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountCode: { in: accountCodes },
        entry: { status: 'POSTED', date: dateFilter },
      },
      select: {
        accountCode: true,
        debit: true,
        credit: true,
        account: { select: { nature: true } },
      },
    });

    const actual = new Map<string, { balance: number; nature: string }>();
    for (const ln of lines) {
      const nature =
        (ln.account?.nature as 'D' | 'C') ??
        (ln.accountCode.startsWith('1') ||
        ln.accountCode.startsWith('5') ||
        ln.accountCode.startsWith('6')
          ? 'D'
          : 'C');
      const current = actual.get(ln.accountCode) ?? { balance: 0, nature };
      current.balance += this.accountBalance(
        nature,
        this.num(ln.debit),
        this.num(ln.credit),
      );
      actual.set(ln.accountCode, current);
    }

    const rows = official.map((snap: any) => {
      const ledger = actual.get(snap.accountCode) ?? {
        balance: 0,
        nature: 'D',
      };
      const officialBalance = this.num(snap.balance);
      const ledgerBalance =
        Math.round((ledger.balance + Number.EPSILON) * 100) / 100;
      const diff =
        Math.round((ledgerBalance - officialBalance + Number.EPSILON) * 100) /
        100;
      return {
        accountCode: snap.accountCode,
        official: officialBalance,
        ledger: ledgerBalance,
        difference: diff,
      };
    });

    const totals = rows.reduce(
      (
        acc: { official: number; ledger: number; difference: number },
        row: { official: number; ledger: number; difference: number },
      ) => {
        acc.official += row.official;
        acc.ledger += row.ledger;
        acc.difference += row.difference;
        return acc;
      },
      { official: 0, ledger: 0, difference: 0 },
    );

    return { year, statement, version, asOf, rows, totals };
  }
}
