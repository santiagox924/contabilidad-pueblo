import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Dt = Date | string | undefined;

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  // --- helpers ---
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

  private accountBalance(nature: string, debit: number, credit: number) {
    // Para naturaleza 'D' el saldo es D - C, para 'C' es C - D
    return nature === 'C' ? credit - debit : debit - credit;
  }

  // =========================================
  // 1) Trial Balance (Balance de Comprobación)
  // =========================================
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

    // Agregar por cuenta
    const map = new Map<
      string,
      { code: string; name: string; nature: string; debit: number; credit: number }
    >();

    for (const l of lines) {
      const code = l.account?.code ?? l.accountCode;
      const key = code;
      const cur = map.get(key) ?? {
        code,
        name: l.account?.name ?? '',
        nature: l.account?.nature ?? 'D',
        debit: 0,
        credit: 0,
      };
      cur.debit += this.num(l.debit);
      cur.credit += this.num(l.credit);
      map.set(key, cur);
    }

    const rows = [...map.values()]
      .map((r) => {
        const balance = this.accountBalance(r.nature, r.debit, r.credit);
        const balanceSide = balance >= 0 ? r.nature : (r.nature === 'D' ? 'C' : 'D');
        return {
          code: r.code,
          name: r.name,
          nature: r.nature,
          debit: r.debit,
          credit: r.credit,
          balance,
          balanceSide,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    const totals = rows.reduce(
      (acc, r) => {
        acc.debit += r.debit;
        acc.credit += r.credit;
        return acc;
      },
      { debit: 0, credit: 0 },
    );

    return { from: gte, to: lte, count: rows.length, totals, rows };
  }

  // ===================
  // 2) Mayor por cuenta
  // ===================
  async ledger(accountCode: string, from?: Dt, to?: Dt) {
    if (!accountCode) throw new BadRequestException('accountCode requerido');
    const { gte, lte } = this.parseRange(from, to);

    const account = await this.prisma.coaAccount.findUnique({ where: { code: accountCode } });
    if (!account) throw new BadRequestException(`Cuenta ${accountCode} no existe`);

    const lines = await this.prisma.journalLine.findMany({
      where: { accountCode, entry: { date: { gte, lte } } },
      orderBy: [{ entry: { date: 'asc' } }, { id: 'asc' }],
      select: {
        debit: true,
        credit: true,
        description: true,
        entry: { select: { date: true, sourceType: true, sourceId: true, description: true } },
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
      account: { code: account.code, name: account.name, nature: account.nature },
      opening: 0,
      closing: run,
      rows,
    };
  }

  // =========================
  // 3) Estado de Resultados
  // =========================
  async incomeStatement(from?: Dt, to?: Dt) {
    const { gte, lte } = this.parseRange(from, to);

    // Prefijos por tipo (ajústalos a tu plan)
    const revenuePrefixes = ['41', '42', '43', '47'];
    const cogsPrefixes = ['61']; // costo de ventas
    const expensePrefixes = ['51', '52', '53', '54', '55', '57', '58'];

    const lines = await this.prisma.journalLine.findMany({
      where: { entry: { date: { gte, lte } } },
      select: { accountCode: true, debit: true, credit: true },
    });

    function starts(code: string, prefixes: string[]) {
      return prefixes.some((p) => code.startsWith(p));
    }

    let revenue = 0;
    let cogs = 0;
    let expenses = 0;

    for (const l of lines) {
      const code = l.accountCode;
      const d = this.num(l.debit);
      const c = this.num(l.credit);
      if (starts(code, revenuePrefixes)) revenue += c - d; // ingresos: créditos - débitos
      else if (starts(code, cogsPrefixes)) cogs += d - c; // costos: débitos - créditos
      else if (starts(code, expensePrefixes)) expenses += d - c; // gastos: débitos - créditos
    }

    const grossProfit = revenue - cogs;
    const operatingIncome = grossProfit - expenses;
    const netIncome = operatingIncome; // sin otros/financieros en v1

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

  // ===================
  // 4) Balance General
  // ===================
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

    // Agregar por cuenta para determinar clase 1/2/3 y 4/5/6 (resultado del periodo)
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

    let assets = 0;
    let liabilities = 0;
    let equity = 0;

    let rev = 0;
    let cogs = 0;
    let exp = 0;

    for (const r of byCode.values()) {
      const top = r.code.charAt(0);
      const bal = this.accountBalance(r.nature, r.debit, r.credit);

      if (top === '1') assets += bal; // Activo
      else if (top === '2') liabilities += (r.nature === 'C' ? (r.credit - r.debit) : -(r.debit - r.credit)); // Pasivo en "crédito neto"
      else if (top === '3') equity += (r.nature === 'C' ? (r.credit - r.debit) : -(r.debit - r.credit)); // Patrimonio
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
      // chequeo contable (debería tender a 0 si todo cuadra)
      check: assets - (liabilities + equityTotal),
    };
  }
}
