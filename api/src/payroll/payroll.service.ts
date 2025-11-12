import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { PayrollEntryDto } from './payroll.dto';
import {
  PayrollComponentKind,
  PayrollRunStatus,
  Prisma,
} from '@prisma/client';

const EARNING_ACCOUNTS = new Set([
  '510503',
  '510506',
  '510512',
  '510515',
  '510518',
  '510521',
  '510524',
  '510527',
  '510542',
  '510545',
  '510548',
]);
const PROVISION_EXPENSE_ACCOUNTS = new Set([
  '510530',
  '510533',
  '510536',
  '510539',
]);
const PROVISION_LIABILITY_ACCOUNTS = new Set([
  '261005',
  '261010',
  '261015',
  '251598',
]);
const EMPLOYER_ACCOUNTS = new Set(['510557', '510568', '510569', '510572']);
const DEDUCTION_ACCOUNTS = new Set([
  '237005',
  '237006',
  '237010',
  '237015',
  '237025',
  '237030',
  '237035',
  '237040',
  '237045',
  '237095',
  '250505',
]);

@Injectable()
export class PayrollService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  // Simple in-memory TTL cache for account data to speed up preview lookups
  private accountCache: Map<string, { ts: number; account: any }> = new Map();
  private accountCacheTtl = 60 * 1000; // 60 seconds
  private employeeProfileCache: Map<number, number> = new Map();

  private async getAccountCached(code: string) {
    const now = Date.now();
    const cached = this.accountCache.get(code);
    if (cached && now - cached.ts < this.accountCacheTtl) return cached.account;
    const acc = await this.prisma.coaAccount.findUnique({ where: { code } });
    this.accountCache.set(code, { ts: now, account: acc });
    return acc;
  }

  private decimalToNumber(
    value: Prisma.Decimal | number | null | undefined,
  ): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return Number(value.toString());
  }

  private async getEmployeeProfileId(
    thirdPartyId: number | null | undefined,
  ): Promise<number | null> {
    if (!thirdPartyId) return null;
    if (this.employeeProfileCache.has(thirdPartyId)) {
      return this.employeeProfileCache.get(thirdPartyId)!;
    }
    const profile = await this.prisma.employeeProfile.findUnique({
      where: { thirdPartyId },
      select: { id: true },
    });
    if (!profile) return null;
    this.employeeProfileCache.set(thirdPartyId, profile.id);
    return profile.id;
  }

  async recognizePayroll(dto: PayrollEntryDto) {
    // Validaciones específicas de nómina (balance + cuentas válidas)
    await this.validatePayrollDto(dto);

    // Prevent duplicate recognition for same employee and month
    if (dto.employeeId) {
      const d = dto.date ? new Date(dto.date) : new Date();
      const year = d.getFullYear();
      const month = d.getMonth() + 1; // 1-12
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      const existing = await this.prisma.journalEntry.findFirst({
        where: {
          sourceType: 'PAYROLL_RECOGNITION',
          sourceId: dto.employeeId,
          date: { gte: start, lte: end },
        },
      });
      if (existing)
        throw new BadRequestException(
          'Ya existe un reconocimiento de nómina para este empleado en el mismo periodo',
        );
    }

    const recognitionEntry =
      await this.accounting.createEntryWithTransaction({
        sourceType: 'PAYROLL_RECOGNITION',
        sourceId: dto.employeeId ?? 0,
        description: dto.description,
        date: dto.date ?? new Date(),
        lines: dto.lines,
        paymentMethodId: (dto as any).paymentMethodId ?? null,
      });
    if (dto.employeeId) {
      await this.upsertPayrollRecognition(dto, recognitionEntry);
    }
    return { ok: true, message: 'Reconocimiento de nómina registrado' };
  }

  async payPayroll(dto: PayrollEntryDto) {
    await this.validatePayrollDto(dto);
    const paymentEntry = await this.accounting.createEntryWithTransaction({
      sourceType: 'PAYROLL_PAYMENT',
      sourceId: dto.employeeId ?? 0,
      description: dto.description,
      date: dto.date ?? new Date(),
      lines: dto.lines,
      paymentMethodId: (dto as any).paymentMethodId ?? null,
    });
    if (dto.employeeId) {
      await this.linkPayrollPayment(dto, paymentEntry);
    }
    return { ok: true, message: 'Pago de nómina registrado' };
  }

  async payContributions(dto: PayrollEntryDto) {
    await this.validatePayrollDto(dto);
    await this.accounting.createEntryWithTransaction({
      sourceType: 'PAYROLL_CONTRIBUTION',
      sourceId: dto.employeeId ?? 0,
      description: dto.description,
      date: dto.date ?? new Date(),
      lines: dto.lines,
      paymentMethodId: (dto as any).paymentMethodId ?? null,
    });
    return { ok: true, message: 'Pago de aportes registrado' };
  }

  async advanceEmployee(dto: PayrollEntryDto) {
    await this.validatePayrollDto(dto);
    await this.accounting.createEntryWithTransaction({
      sourceType: 'PAYROLL_ADVANCE',
      sourceId: dto.employeeId ?? 0,
      description: dto.description,
      date: dto.date ?? new Date(),
      lines: dto.lines,
      paymentMethodId: (dto as any).paymentMethodId ?? null,
    });
    return { ok: true, message: 'Anticipo registrado' };
  }

  // --- Simple convenience builders that accept amounts and map to the standard PUC accounts
  // helper: build lines for payroll simple payload (used by preview + actual builders)
  private getPayrollPeriod(input: Date | string) {
    const date = input instanceof Date ? input : new Date(input);
    const year = date.getFullYear();
    const month = date.getMonth();
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  private determineComponentKind(
    accountCode: string,
    debit: Prisma.Decimal,
    credit: Prisma.Decimal,
  ): PayrollComponentKind {
    if (EMPLOYER_ACCOUNTS.has(accountCode)) {
      return PayrollComponentKind.EMPLOYER_CONTRIBUTION;
    }
    if (
      PROVISION_EXPENSE_ACCOUNTS.has(accountCode) ||
      PROVISION_LIABILITY_ACCOUNTS.has(accountCode)
    ) {
      return PayrollComponentKind.PROVISION;
    }
    if (
      DEDUCTION_ACCOUNTS.has(accountCode) ||
      (credit.gt(0) && accountCode.startsWith('23'))
    ) {
      return PayrollComponentKind.DEDUCTION;
    }
    if (EARNING_ACCOUNTS.has(accountCode) || debit.gt(0)) {
      return PayrollComponentKind.EARNING;
    }
    return credit.gt(0)
      ? PayrollComponentKind.DEDUCTION
      : PayrollComponentKind.EARNING;
  }

  private async extractPayrollMetrics(
    lines: PayrollEntryDto['lines'],
  ): Promise<{
    gross: Prisma.Decimal;
    deductions: Prisma.Decimal;
    employer: Prisma.Decimal;
    provisions: Prisma.Decimal;
    net: Prisma.Decimal;
    runLines: {
      componentCode: string;
      componentName: string | null;
      kind: PayrollComponentKind;
      amount: Prisma.Decimal;
      accountCode: string;
      thirdPartyId: number | null;
      costCenterId: number | null;
    }[];
  }> {
    const D = Prisma.Decimal;
    let gross = new D(0);
    let deductions = new D(0);
    let employer = new D(0);
    let provisions = new D(0);
    const runLines: {
      componentCode: string;
      componentName: string | null;
      kind: PayrollComponentKind;
      amount: Prisma.Decimal;
      accountCode: string;
      thirdPartyId: number | null;
      costCenterId: number | null;
    }[] = [];

    for (const line of lines) {
      const debit = new D(line.debit ?? 0);
      const credit = new D(line.credit ?? 0);
      if (debit.lte(0) && credit.lte(0)) continue;
      const account = line.accountCode
        ? await this.getAccountCached(line.accountCode)
        : null;
      const kind = this.determineComponentKind(
        line.accountCode,
        debit,
        credit,
      );
      const amount = debit.gt(0) ? debit : credit;
      runLines.push({
        componentCode: line.accountCode,
        componentName: account?.name ?? null,
        kind,
        amount,
        accountCode: line.accountCode,
        thirdPartyId: line.thirdPartyId ?? null,
        costCenterId: line.costCenterId ?? null,
      });

      if (kind === PayrollComponentKind.EARNING) gross = gross.plus(amount);
      else if (kind === PayrollComponentKind.DEDUCTION)
        deductions = deductions.plus(amount);
      else if (kind === PayrollComponentKind.EMPLOYER_CONTRIBUTION)
        employer = employer.plus(amount);
      else if (kind === PayrollComponentKind.PROVISION)
        provisions = provisions.plus(amount);
    }

    const netRaw = gross.minus(deductions);
    const net = netRaw.gt(0) ? netRaw : new D(0);

    return { gross, deductions, employer, provisions, net, runLines };
  }

  private parseDateParam(value?: string | null): Date | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  private async upsertPayrollRecognition(
    dto: PayrollEntryDto,
    entry: { id: number; sourceType: string; sourceId: number },
  ) {
    const profileId = await this.getEmployeeProfileId(dto.employeeId);
    if (!profileId) return;
    const { start, end } = this.getPayrollPeriod(dto.date ?? new Date());
    const metrics = await this.extractPayrollMetrics(dto.lines);
    const metadata = {
      type: 'RECOGNITION',
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
    };

    const run = await this.prisma.payrollRun.upsert({
      where: {
        employeeId_periodStart_periodEnd: {
          employeeId: profileId,
          periodStart: start,
          periodEnd: end,
        },
      },
      update: {
        grossAmount: metrics.gross,
        deductionsAmount: metrics.deductions,
        employerContribAmount: metrics.employer,
        provisionsAmount: metrics.provisions,
        netAmount: metrics.net,
        journalEntryId: entry.id,
        status: PayrollRunStatus.POSTED,
        description: dto.description ?? null,
        metadata,
      },
      create: {
        employeeId: profileId,
        periodStart: start,
        periodEnd: end,
        issuedAt: new Date(),
        status: PayrollRunStatus.POSTED,
        grossAmount: metrics.gross,
        deductionsAmount: metrics.deductions,
        employerContribAmount: metrics.employer,
        provisionsAmount: metrics.provisions,
        netAmount: metrics.net,
        journalEntryId: entry.id,
        description: dto.description ?? null,
        metadata,
      },
    });

    await this.prisma.payrollRunLine.deleteMany({
      where: { payrollRunId: run.id },
    });
    if (metrics.runLines.length) {
      await this.prisma.payrollRunLine.createMany({
        data: metrics.runLines.map((line) => ({
          payrollRunId: run.id,
          componentCode: line.componentCode,
          componentName: line.componentName,
          kind: line.kind,
          amount: line.amount.toFixed(2),
          baseAmount: null,
          percentage: null,
          accountCode: line.accountCode,
          thirdPartyId: line.thirdPartyId,
          costCenterId: line.costCenterId,
        })),
      });
    }
  }

  private async linkPayrollPayment(
    dto: PayrollEntryDto,
    entry: { id: number; sourceType: string; sourceId: number },
  ) {
    const profileId = await this.getEmployeeProfileId(dto.employeeId);
    if (!profileId) return;
    const { start, end } = this.getPayrollPeriod(dto.date ?? new Date());
    const metadata = {
      type: 'PAYMENT',
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
    };
    const result = await this.prisma.payrollRun.updateMany({
      where: {
        employeeId: profileId,
        periodStart: start,
        periodEnd: end,
      },
      data: {
        paymentEntryId: entry.id,
        status: PayrollRunStatus.POSTED,
        metadata,
      },
    });

    if (result.count === 0) {
      await this.prisma.payrollRun.create({
        data: {
          employeeId: profileId,
          periodStart: start,
          periodEnd: end,
          issuedAt: new Date(),
          status: PayrollRunStatus.POSTED,
          grossAmount: new Prisma.Decimal(0),
          deductionsAmount: new Prisma.Decimal(0),
          employerContribAmount: new Prisma.Decimal(0),
          provisionsAmount: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(0),
          paymentEntryId: entry.id,
          metadata,
        },
      });
    }
  }

  async listRuns(params: {
    employeeId?: number;
    from?: string;
    to?: string;
  } = {}) {
    const where: Prisma.PayrollRunWhereInput = {};
    if (params.employeeId) {
      const profileId = await this.getEmployeeProfileId(params.employeeId);
      if (!profileId) return [];
      where.employeeId = profileId;
    }
    const fromDate = this.parseDateParam(params.from);
    const toDate = this.parseDateParam(params.to);
    if (fromDate) {
      where.periodStart = { gte: fromDate };
    }
    if (toDate) {
      where.periodEnd = { lte: toDate };
    }

    const runs = await this.prisma.payrollRun.findMany({
      where,
      include: {
        employee: {
          include: {
            thirdParty: {
              select: { id: true, name: true, document: true },
            },
          },
        },
        journalEntry: {
          select: { id: true, date: true, description: true },
        },
        paymentEntry: {
          select: {
            id: true,
            date: true,
            description: true,
            paymentMethodId: true,
          },
        },
      },
      orderBy: [
        { periodStart: 'desc' },
        { employeeId: 'asc' },
      ],
      take: 200,
    });

    return runs.map((run) => {
      const periodStart = run.periodStart;
      const periodEnd = run.periodEnd;
      const employeeName =
        run.employee?.thirdParty?.name ?? `Empleado ${run.employeeId}`;
      const employeeThirdPartyId = run.employee?.thirdParty?.id ?? null;
      const periodLabel = `${periodStart.getFullYear()}-${String(
        periodStart.getMonth() + 1,
      ).padStart(2, '0')}`;
      return {
        id: run.id,
        employeeProfileId: run.employeeId,
        employeeThirdPartyId,
        employeeName,
        status: run.status,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        periodLabel,
        grossAmount: this.decimalToNumber(run.grossAmount),
        deductionsAmount: this.decimalToNumber(run.deductionsAmount),
        employerContribAmount: this.decimalToNumber(
          run.employerContribAmount,
        ),
        provisionsAmount: this.decimalToNumber(run.provisionsAmount),
        netAmount: this.decimalToNumber(run.netAmount),
        recognitionEntryId: run.journalEntryId,
        recognitionDate: run.journalEntry?.date?.toISOString() ?? null,
        recognitionDescription: run.journalEntry?.description ?? null,
        paymentEntryId: run.paymentEntryId,
        paymentDate: run.paymentEntry?.date?.toISOString() ?? null,
        paymentDescription: run.paymentEntry?.description ?? null,
        paymentMethodId: run.paymentEntry?.paymentMethodId ?? null,
      };
    });
  }

  async listPayments(params: {
    employeeId?: number;
    from?: string;
    to?: string;
  } = {}) {
    const where: Prisma.PayrollRunWhereInput = {
      paymentEntryId: { not: null },
    };
    if (params.employeeId) {
      const profileId = await this.getEmployeeProfileId(params.employeeId);
      if (!profileId) return [];
      where.employeeId = profileId;
    }
    const fromDate = this.parseDateParam(params.from);
    const toDate = this.parseDateParam(params.to);
    if (fromDate || toDate) {
      const paymentDateFilter: Record<string, Date> = {};
      if (fromDate) paymentDateFilter.gte = fromDate;
      if (toDate) paymentDateFilter.lte = toDate;
      (where as any).paymentEntry = { date: paymentDateFilter };
    }

    const runs = await this.prisma.payrollRun.findMany({
      where,
      include: {
        employee: {
          include: {
            thirdParty: {
              select: { id: true, name: true, document: true },
            },
          },
        },
        paymentEntry: {
          select: {
            id: true,
            date: true,
            description: true,
            paymentMethodId: true,
          },
        },
      },
      orderBy: [
        { paymentEntry: { date: 'desc' } },
        { employeeId: 'asc' },
      ],
      take: 200,
    });

    return runs
      .filter((run) => run.paymentEntry)
      .map((run) => {
        const employeeName =
          run.employee?.thirdParty?.name ?? `Empleado ${run.employeeId}`;
        const employeeThirdPartyId = run.employee?.thirdParty?.id ?? null;
        return {
          runId: run.id,
          paymentEntryId: run.paymentEntry!.id,
          employeeProfileId: run.employeeId,
          employeeThirdPartyId,
          employeeName,
          date: run.paymentEntry!.date?.toISOString() ?? null,
          amount: this.decimalToNumber(run.netAmount),
          concept: run.paymentEntry?.description ?? 'Pago nómina',
          paymentMethodId: run.paymentEntry?.paymentMethodId ?? null,
          periodStart: run.periodStart.toISOString(),
          periodEnd: run.periodEnd.toISOString(),
        };
      });
  }

  async getRun(runId: number) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        employee: {
          include: {
            thirdParty: {
              select: { id: true, name: true, document: true },
            },
          },
        },
        journalEntry: true,
        paymentEntry: true,
        lines: {
          include: {
            thirdParty: { select: { id: true, name: true } },
            costCenter: { select: { id: true, code: true, name: true } },
          },
          orderBy: [{ kind: 'asc' }, { accountCode: 'asc' }],
        },
      },
    });
    if (!run) throw new NotFoundException('PayrollRun no encontrado');

    const lines = run.lines.map((line) => ({
      id: line.id,
      componentCode: line.componentCode,
      componentName: line.componentName,
      kind: line.kind,
      amount: this.decimalToNumber(line.amount),
      accountCode: line.accountCode,
      thirdPartyId: line.thirdPartyId,
      thirdPartyName: line.thirdParty?.name ?? null,
      costCenterId: line.costCenterId,
      costCenterCode: line.costCenter?.code ?? null,
      costCenterName: line.costCenter?.name ?? null,
      metadata: line.metadata ?? null,
    }));

    return {
      id: run.id,
      employeeProfileId: run.employeeId,
      employeeThirdPartyId: run.employee?.thirdParty?.id ?? null,
      employeeName:
        run.employee?.thirdParty?.name ?? `Empleado ${run.employeeId}`,
      status: run.status,
      periodStart: run.periodStart.toISOString(),
      periodEnd: run.periodEnd.toISOString(),
      grossAmount: this.decimalToNumber(run.grossAmount),
      deductionsAmount: this.decimalToNumber(run.deductionsAmount),
      employerContribAmount: this.decimalToNumber(run.employerContribAmount),
      provisionsAmount: this.decimalToNumber(run.provisionsAmount),
      netAmount: this.decimalToNumber(run.netAmount),
      journalEntryId: run.journalEntryId,
      journalEntryDate: run.journalEntry?.date?.toISOString() ?? null,
      journalEntryDescription: run.journalEntry?.description ?? null,
      paymentEntryId: run.paymentEntryId,
      paymentEntryDate: run.paymentEntry?.date?.toISOString() ?? null,
      paymentEntryDescription: run.paymentEntry?.description ?? null,
      paymentMethodId: run.paymentEntry?.paymentMethodId ?? null,
      lines,
      metadata: run.metadata ?? null,
    };
  }

  async getRunLines(runId: number) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      select: { id: true },
    });
    if (!run) throw new NotFoundException('PayrollRun no encontrado');
    const lines = await this.prisma.payrollRunLine.findMany({
      where: { payrollRunId: runId },
      include: {
        thirdParty: { select: { id: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ kind: 'asc' }, { accountCode: 'asc' }],
    });
    return lines.map((line) => ({
      id: line.id,
      componentCode: line.componentCode,
      componentName: line.componentName,
      kind: line.kind,
      amount: this.decimalToNumber(line.amount),
      accountCode: line.accountCode,
      thirdPartyId: line.thirdPartyId,
      thirdPartyName: line.thirdParty?.name ?? null,
      costCenterId: line.costCenterId,
      costCenterCode: line.costCenter?.code ?? null,
      costCenterName: line.costCenter?.name ?? null,
      metadata: line.metadata ?? null,
    }));
  }

  buildSimpleLines(dto: any) {
    const lines: any[] = [];
    const addDebit = (
      accountCode: string,
      amount: number | null | undefined,
      extra?: Record<string, any>,
    ) => {
      if (amount && amount > 0) {
        lines.push({ accountCode, debit: amount, ...(extra ?? {}) });
      }
    };
    const addCredit = (
      accountCode: string,
      amount: number | null | undefined,
      extra?: Record<string, any>,
    ) => {
      if (amount && amount > 0) {
        lines.push({ accountCode, credit: amount, ...(extra ?? {}) });
      }
    };

    const earnings = [
      ['510503', dto.salaryIntegral],
      ['510506', dto.salary],
      ['510512', dto.jornales],
      ['510515', dto.overtime ?? dto.extras],
      ['510518', dto.commissions],
      ['510521', dto.viaticos],
      ['510524', dto.incapacities],
      [
        '510527',
        dto.transportAllowance ?? dto.transport ?? dto.auxilioTransporte,
      ],
      ['510542', dto.extraLegalBonuses],
      ['510545', dto.auxilios],
      ['510548', dto.bonificaciones],
    ] as const;
    for (const [code, amount] of earnings) {
      addDebit(code, amount ?? 0);
    }

    // Pasivos/retenciones: include thirdPartyId when employeeId present
    const deductionsThirdParty = { thirdPartyId: dto.employeeId };
    const epsEmployee = dto.epsEmployee ?? dto.eps;
    const arlEmployee = dto.arlEmployee ?? dto.arl;
    const ccfEmployee = dto.ccfEmployee ?? dto.ccf;
    const pensionEmployee = dto.pensionEmployee ?? dto.pension;

    if (dto.autoCalculateRetention) {
      const rate =
        typeof dto.withholdingRate === 'number' ? dto.withholdingRate : 0.01;
      const earningsBase = earnings.reduce(
        (sum, [, amount]) => sum + (amount ? Number(amount) : 0),
        0,
      );
      const calc = Math.round(earningsBase * rate * 100) / 100;
      if (calc > 0) dto.retention = calc;
    }

    addCredit('237095', dto.retention, deductionsThirdParty);
    addCredit('237005', epsEmployee, deductionsThirdParty);
    addCredit('237006', arlEmployee, deductionsThirdParty);
    addCredit('237010', ccfEmployee, deductionsThirdParty);
    addCredit('237015', pensionEmployee, deductionsThirdParty);
    addCredit('237025', dto.embargoes, deductionsThirdParty);
    addCredit('237030', dto.libranzas, deductionsThirdParty);
    addCredit('237035', dto.sindicatos, deductionsThirdParty);
    addCredit('237040', dto.cooperativas, deductionsThirdParty);
    addCredit('237045', dto.fondos, deductionsThirdParty);
    addCredit('237095', dto.otrosDescuentos, deductionsThirdParty);

    // Employer contributions
    const employerEps = dto.employerEps ?? dto.epsEmployer;
    const employerArl = dto.employerArl ?? dto.arlEmployer;
    const employerCcf = dto.employerCcf ?? dto.ccfEmployer;

    if (employerEps && employerEps > 0) {
      addDebit('510569', employerEps);
      addCredit('237005', employerEps);
    }
    if (dto.employerPension && dto.employerPension > 0) {
      addDebit('510557', dto.employerPension);
      addCredit('237015', dto.employerPension);
    }
    if (employerArl && employerArl > 0) {
      addDebit('510568', employerArl);
      addCredit('237006', employerArl);
    }
    if (employerCcf && employerCcf > 0) {
      addDebit('510572', employerCcf);
      addCredit('237010', employerCcf);
    }

    // Provisions / prestaciones
    addDebit('510530', dto.provisionsCesantias);
    addCredit('261005', dto.provisionsCesantias);

    addDebit('510533', dto.provisionsInterestCesantias);
    addCredit('261010', dto.provisionsInterestCesantias);

    addDebit('510536', dto.provisionsPrima);
    addCredit('251598', dto.provisionsPrima);

    addDebit('510539', dto.provisionsVacations);
    addCredit('261015', dto.provisionsVacations);

    // Salarios por pagar (250505)
    if (dto.salaryPayable && dto.salaryPayable > 0) {
      addCredit('250505', dto.salaryPayable, deductionsThirdParty);
    } else {
      const totals = lines.reduce(
        (acc, line) => {
          return {
            debit: acc.debit + (line.debit ?? 0),
            credit:
              acc.credit +
              (line.accountCode === '250505' ? 0 : line.credit ?? 0),
          };
        },
        { debit: 0, credit: 0 },
      );
      const net = Math.round((totals.debit - totals.credit) * 100) / 100;
      if (net !== 0) {
        addCredit('250505', net, deductionsThirdParty);
      }
    }

    return lines;
  }
  async recognitionSimple(dto: any) {
    const date = dto.date ? new Date(dto.date) : new Date();
    const lines = this.buildSimpleLines(dto);
    const payload = {
      type: 'RECOGNITION',
      employeeId: dto.employeeId,
      description: dto.description,
      date,
      lines,
    };
    return this.recognizePayroll(payload);
  }

  async paymentSimple(dto: any) {
    // debit: 250505 Salarios por pagar (to clear), credit: bank/cash account
    const date = dto.date ? new Date(dto.date) : new Date();
    if (!dto.bankAccountCode)
      throw new BadRequestException(
        'bankAccountCode es requerido para el pago',
      );
    const lines = [];
    if (dto.salaryPayable && dto.salaryPayable > 0) {
      lines.push({ accountCode: '250505', debit: dto.salaryPayable });
      lines.push({
        accountCode: dto.bankAccountCode,
        credit: dto.salaryPayable,
      });
    } else {
      throw new BadRequestException('salaryPayable es requerido para el pago');
    }
    // include thirdPartyId for payroll liability clearing
    (lines as any[]).forEach((l) => {
      if (l.accountCode === '250505') l.thirdPartyId = dto.employeeId;
    });
    // If paymentMethodId is provided, attach it to description for auditing and keep in payload
    let description = dto.description;
    if (dto.paymentMethodId) {
      description =
        (description ? description + ' | ' : '') +
        `paymentMethodId=${dto.paymentMethodId}`;
      // Also attach metadata on bank account line description
      for (const l of lines) {
        if (l.accountCode === dto.bankAccountCode) {
          (l as any).description =
            ((l as any).description ? (l as any).description + ' | ' : '') +
            `methodId=${dto.paymentMethodId}`;
        }
      }
    }

    const payload = {
      type: 'PAYMENT',
      employeeId: dto.employeeId,
      description,
      date,
      lines,
      paymentMethodId: dto.paymentMethodId,
    };
    return this.payPayroll(payload);
  }

  async contributionsSimple(dto: any) {
    const date = dto.date ? new Date(dto.date) : new Date();
    if (!dto.bankAccountCode)
      throw new BadRequestException(
        'bankAccountCode es requerido para el pago de aportes',
      );
    const lines: any[] = [];
    if (dto.eps && dto.eps > 0)
      lines.push({
        accountCode: '237010',
        debit: dto.eps,
        thirdPartyId: dto.employeeId,
      });
    if (dto.pension && dto.pension > 0)
      lines.push({
        accountCode: '237015',
        debit: dto.pension,
        thirdPartyId: dto.employeeId,
      });
    if (dto.arl && dto.arl > 0)
      lines.push({
        accountCode: '237020',
        debit: dto.arl,
        thirdPartyId: dto.employeeId,
      });
    if (dto.ccf && dto.ccf > 0)
      lines.push({
        accountCode: '237025',
        debit: dto.ccf,
        thirdPartyId: dto.employeeId,
      });

    const total = lines.reduce((s, l) => s + (l.debit || 0), 0);
    if (total <= 0)
      throw new BadRequestException('No hay montos para pagar en aportes');

    lines.push({ accountCode: dto.bankAccountCode, credit: total });

    const payload = {
      type: 'CONTRIBUTION',
      employeeId: dto.employeeId,
      description: dto.description,
      date,
      lines,
      paymentMethodId: dto.paymentMethodId,
    };
    return this.payContributions(payload);
  }

  async advanceSimple(dto: any) {
    const date = dto.date ? new Date(dto.date) : new Date();
    if (!dto.bankAccountCode)
      throw new BadRequestException(
        'bankAccountCode es requerido para el anticipo',
      );
    if (!dto.advanceAmount || dto.advanceAmount <= 0)
      throw new BadRequestException('advanceAmount inválido');
    const lines = [
      { accountCode: '133005', debit: dto.advanceAmount },
      { accountCode: dto.bankAccountCode, credit: dto.advanceAmount },
    ];
    const payload = {
      type: 'ADVANCE',
      employeeId: dto.employeeId,
      description: dto.description,
      date,
      lines,
      paymentMethodId: dto.paymentMethodId,
    };
    return this.advanceEmployee(payload);
  }

  // Return the lines that would be created for a simple payload without persisting
  async simplePreview(dto: any) {
    const date = dto.date ? new Date(dto.date) : new Date();
    const lines = this.buildSimpleLines(dto);
    // Batch lookup account names and thirdParty (party) names to enrich the preview lines
    const codes = Array.from(
      new Set(lines.map((l) => l.accountCode).filter(Boolean)),
    );
    const accountMap = new Map<string, any>();
    const toFetch: string[] = [];
    for (const c of codes) {
      const cached = this.accountCache.get(c);
      if (cached && Date.now() - cached.ts < this.accountCacheTtl) {
        accountMap.set(c, cached.account);
      } else {
        toFetch.push(c);
      }
    }
    if (toFetch.length) {
      const fetched = await this.prisma.coaAccount.findMany({
        where: { code: { in: toFetch } },
      });
      for (const a of fetched) {
        this.accountCache.set(a.code, { ts: Date.now(), account: a });
        accountMap.set(a.code, a);
      }
    }

    const partyIds = Array.from(
      new Set(lines.map((l) => l.thirdPartyId).filter(Boolean)),
    );
    const parties = partyIds.length
      ? await this.prisma.thirdParty.findMany({
          where: { id: { in: partyIds } },
        })
      : [];
    const partyMap = new Map((parties as any[]).map((p) => [p.id, p]));

    const enriched = lines.map((l) => {
      const acc = accountMap.get(l.accountCode);
      const party = l.thirdPartyId ? partyMap.get(l.thirdPartyId) : undefined;
      return {
        ...l,
        accountName: acc?.name ?? undefined,
        thirdPartyName: party ? (party.name ?? `${party.id}`) : undefined,
      };
    });

    return { date, lines: enriched };
  }

  private async validatePayrollDto(dto: PayrollEntryDto) {
    if (!dto || !Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new BadRequestException(
        'El payload debe incluir líneas de asiento',
      );
    }

    // Sumar débitos y créditos con Decimal para evitar errores de float
    const D = Prisma.Decimal;
    const totalDebit = dto.lines.reduce(
      (acc, l) => acc.plus(new D(l.debit ?? 0)),
      new D(0),
    );
    const totalCredit = dto.lines.reduce(
      (acc, l) => acc.plus(new D(l.credit ?? 0)),
      new D(0),
    );
    if (!totalDebit.eq(totalCredit)) {
      throw new BadRequestException(
        `El asiento no cuadra (débitos=${totalDebit.toFixed(2)} ≠ créditos=${totalCredit.toFixed(2)})`,
      );
    }

    // Validar cuentas y requisitos básicos
    for (const [i, line] of dto.lines.entries()) {
      const code = (line.accountCode || '').trim();
      if (!code)
        throw new BadRequestException(`Línea ${i + 1}: accountCode requerido`);
      const acc = await this.prisma.coaAccount.findUnique({ where: { code } });
      if (!acc)
        throw new BadRequestException(
          `Línea ${i + 1}: la cuenta ${code} no existe`,
        );

      // If account is not detailed, ensure there is a child detailed account (mirrors accounting.validateAccountPosting)
      if (acc.isDetailed === false) {
        const child = await this.prisma.coaAccount.findFirst({
          where: { parentCode: acc.code, isDetailed: true },
        });
        if (!child)
          throw new BadRequestException(
            `Línea ${i + 1}: la cuenta ${acc.code} no permite movimientos directos`,
          );
      }

      if (acc.requiresThirdParty && !line.thirdPartyId) {
        throw new BadRequestException(
          `Línea ${i + 1}: la cuenta ${acc.code} exige thirdPartyId`,
        );
      }
      if (acc.requiresCostCenter && !line.costCenterId) {
        throw new BadRequestException(
          `Línea ${i + 1}: la cuenta ${acc.code} exige costCenterId`,
        );
      }
    }
  }
}
