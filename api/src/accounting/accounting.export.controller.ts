import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountingService } from './accounting.service';

@UseGuards(JwtAuthGuard)
@Controller('accounting/export')
export class AccountingExportController {
  constructor(private readonly acc: AccountingService) {}

  // Util simple para CSV
  private toCsv<T extends Record<string, any>>(rows: T[], headers?: string[]) {
    if (!rows?.length) return '';
    const cols = headers ?? Object.keys(rows[0]);
    const esc = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = cols.join(',');
    const body = rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n');
    return head + '\n' + body;
  }

  @Get('trial-balance.csv')
  async trialBalanceCsv(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const data = await this.acc.trialBalance(from, to);
    const rows = data.rows.map(r => ({
      code: r.code,
      name: r.name,
      nature: r.nature,
      debit: r.debit.toFixed(2),
      credit: r.credit.toFixed(2),
      balanceSide: r.balanceSide,
      balance: r.balance.toFixed(2),
    }));
    const csv = this.toCsv(rows, ['code','name','nature','debit','credit','balanceSide','balance']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="trial-balance_${from}_${to}.csv"`);
    res.send(csv);
  }

  @Get('ledger/:code.csv')
  async ledgerCsv(
    @Param('code') code: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const data = await this.acc.ledger(code, from, to);
    const rows = data.rows.map(r => ({
      date: new Date(r.date).toISOString().slice(0,10),
      source: `${r.sourceType}#${r.sourceId}`,
      description: r.description ?? '',
      debit: r.debit.toFixed(2),
      credit: r.credit.toFixed(2),
      runBalance: r.runBalance.toFixed(2),
    }));
    const csv = this.toCsv(rows, ['date','source','description','debit','credit','runBalance']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ledger_${code}_${from}_${to}.csv"`);
    res.send(csv);
  }

  @Get('income-statement.csv')
  async incomeCsv(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const r = await this.acc.incomeStatement(from, to);
    const rows = [
      { metric: 'Revenue', value: r.revenue.toFixed(2) },
      { metric: 'COGS', value: r.cogs.toFixed(2) },
      { metric: 'GrossProfit', value: r.grossProfit.toFixed(2) },
      { metric: 'Expenses', value: r.expenses.toFixed(2) },
      { metric: 'OperatingIncome', value: r.operatingIncome.toFixed(2) },
      { metric: 'NetIncome', value: r.netIncome.toFixed(2) },
    ];
    const csv = this.toCsv(rows, ['metric','value']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="income_${from}_${to}.csv"`);
    res.send(csv);
  }

  @Get('balance-sheet.csv')
  async balanceCsv(@Query('asOf') asOf: string, @Res() res: Response) {
    const b = await this.acc.balanceSheet(asOf);
    const rows = [
      { metric: 'Assets', value: b.assets.toFixed(2) },
      { metric: 'Liabilities', value: b.liabilities.toFixed(2) },
      { metric: 'EquityBeforeResult', value: b.equityBeforeResult.toFixed(2) },
      { metric: 'ResultOfPeriod', value: b.resultOfPeriod.toFixed(2) },
      { metric: 'EquityTotal', value: b.equityTotal.toFixed(2) },
      { metric: 'Check(should be 0)', value: b.check.toFixed(2) },
    ];
    const csv = this.toCsv(rows, ['metric','value']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="balance_${asOf}.csv"`);
    res.send(csv);
  }
}
