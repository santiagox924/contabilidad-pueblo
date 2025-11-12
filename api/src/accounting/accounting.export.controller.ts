// api/src/accounting/accounting.export.controller.ts
import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import * as XLSX from 'xlsx';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountingService } from './accounting.service';
import {
  AuxLedgerAccountQueryDto,
  AuxLedgerCostCenterQueryDto,
  AuxLedgerThirdPartyQueryDto,
  BooksExportFormatDto,
  GeneralJournalQueryDto,
} from './dto/books.dto';
import {
  DianVatQueryDto,
  DianMagneticExportQueryDto,
  DianWithholdingQueryDto,
} from './dto/regulatory.dto';
import {
  DIAN_MAGNETIC_FORMAT_CODES,
  DianMagneticFormatCode,
} from './dto/regulatory.dto';
import {
  NiifBalanceQueryDto,
  NiifCashFlowQueryDto,
  NiifIncomeQueryDto,
  NiifStatementNodeDto,
} from './dto/niif-statements.dto';

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
    const body = rows
      .map((r) => cols.map((c) => esc(r[c])).join(','))
      .join('\n');
    return head + '\n' + '\uFEFF' + body; // BOM opcional para Excel; quítalo si no lo necesitas
  }

  // Helper seguro de formateo numérico a 2 decimales
  private toFixed2(v: unknown): string | number {
    if (typeof v === 'number' && Number.isFinite(v)) return v.toFixed(2);
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n.toFixed(2) : v;
    }
    return typeof v === 'undefined' || v === null ? '' : (v as any);
  }

  private isoDate(value: unknown) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const str = String(value);
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return str;
  }

  private exportDataset(
    res: Response,
    rows: Array<Record<string, any>>,
    headers: string[],
    filename: string,
    format?: string,
  ) {
    const sanitized = (rows ?? []).map((row) => {
      const out: Record<string, any> = {};
      for (const header of headers) {
        const value = row?.[header];
        out[header] = value === undefined ? '' : value;
      }
      return out;
    });

    if (format === 'xlsx') {
      const worksheet = XLSX.utils.json_to_sheet(sanitized, {
        header: headers,
      });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.xlsx"`,
      );
      res.send(buffer);
      return;
    }

    const csv = this.toCsv(sanitized, headers);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}.csv"`,
    );
    res.send(csv);
  }

  private flattenNiifNodes(
    nodes: NiifStatementNodeDto[],
    rows: Array<Record<string, any>> = [],
    level = 0,
  ) {
    for (const node of nodes ?? []) {
      rows.push({
        level,
        id: node.id,
        label: node.label,
        amount: this.toFixed2(node.amount),
        previousAmount:
          node.previousAmount === undefined
            ? ''
            : this.toFixed2(node.previousAmount),
      });
      if (node.children?.length) {
        this.flattenNiifNodes(node.children, rows, level + 1);
      }
    }
    return rows;
  }

  // =========================
  // Reportes base (existentes)
  // =========================
  @Get('trial-balance.csv')
  async trialBalanceCsv(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const data = await this.acc.trialBalance(from, to);
    const rows = data.rows.map((r) => ({
      code: r.code,
      name: r.name,
      nature: r.nature,
      debit: r.debit.toFixed(2),
      credit: r.credit.toFixed(2),
      balanceSide: r.balanceSide,
      balance: r.balance.toFixed(2),
    }));
    const csv = this.toCsv(rows, [
      'code',
      'name',
      'nature',
      'debit',
      'credit',
      'balanceSide',
      'balance',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="trial-balance_${from}_${to}.csv"`,
    );
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
    const rows = data.rows.map((r) => ({
      date: new Date(r.date).toISOString().slice(0, 10),
      source: `${r.sourceType}#${r.sourceId}`,
      description: r.description ?? '',
      debit: r.debit.toFixed(2),
      credit: r.credit.toFixed(2),
      runBalance: r.runBalance.toFixed(2),
    }));
    const csv = this.toCsv(rows, [
      'date',
      'source',
      'description',
      'debit',
      'credit',
      'runBalance',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ledger_${code}_${from}_${to}.csv"`,
    );
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
    const csv = this.toCsv(rows, ['metric', 'value']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="income_${from}_${to}.csv"`,
    );
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
    const csv = this.toCsv(rows, ['metric', 'value']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="balance_${asOf}.csv"`,
    );
    res.send(csv);
  }

  @Get('niif/balance.csv')
  async niifBalanceCsv(
    @Query() query: NiifBalanceQueryDto,
    @Res() res: Response,
  ) {
    const report = await this.acc.niifBalanceStatement(query);
    const rows = this.flattenNiifNodes(report.sections);
    const csv = this.toCsv(rows, [
      'level',
      'id',
      'label',
      'amount',
      'previousAmount',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="niif_balance_${report.asOf}.csv"`,
    );
    res.send(csv);
  }

  @Get('niif/income.csv')
  async niifIncomeCsv(
    @Query() query: NiifIncomeQueryDto,
    @Res() res: Response,
  ) {
    const report = await this.acc.niifIncomeStatement(query);
    const rows = this.flattenNiifNodes(report.sections);
    const csv = this.toCsv(rows, [
      'level',
      'id',
      'label',
      'amount',
      'previousAmount',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="niif_income_${report.from}_${report.to}.csv"`,
    );
    res.send(csv);
  }

  @Get('niif/cash-flow.csv')
  async niifCashFlowCsv(
    @Query() query: NiifCashFlowQueryDto,
    @Res() res: Response,
  ) {
    const report = await this.acc.niifCashFlowStatement(query);
    const rows = this.flattenNiifNodes(report.sections);
    const csv = this.toCsv(rows, [
      'level',
      'id',
      'label',
      'amount',
      'previousAmount',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="niif_cash_flow_${report.from}_${report.to}.csv"`,
    );
    res.send(csv);
  }

  // =========================
  // NUEVOS reportes - Libros fiscales
  // =========================

  // Util: aplana las columnas dinámicas de IVA (vatByRate) y arma headers
  private flattenBookRows(
    rows: Array<{
      date: string | Date;
      number?: string | number;
      thirdPartyId?: number | string;
      thirdPartyName?: string;
      taxBase: number;
      vatByRate: Record<string, number>; // ej: { 'vat_19': 123, 'vat_5': 45 }
      withholdings?: number;
      total: number;
    }>,
  ) {
    // Recolectar todas las columnas de IVA presentes
    const vatColsSet = new Set<string>();
    for (const r of rows ?? []) {
      for (const k of Object.keys(r.vatByRate ?? {})) vatColsSet.add(k);
    }
    // Ordenar por tasa numérica si viene en formato "vat_19", "vat_5", dejando 0 al final
    const vatCols = Array.from(vatColsSet).sort((a, b) => {
      const an = Number(String(a).split('_')[1] ?? NaN);
      const bn = Number(String(b).split('_')[1] ?? NaN);
      if (Number.isNaN(an) && Number.isNaN(bn)) return a.localeCompare(b);
      if (Number.isNaN(an)) return 1;
      if (Number.isNaN(bn)) return -1;
      return bn - an; // mayor tasa primero
    });

    // Construir filas planas
    const flat = rows.map((r) => {
      const base = {
        date:
          r.date instanceof Date
            ? r.date.toISOString().slice(0, 10)
            : String(r.date),
        number: r.number ?? '',
        thirdPartyId: r.thirdPartyId ?? '',
        thirdPartyName: r.thirdPartyName ?? '',
        taxBase: this.toFixed2(r.taxBase),
      } as Record<string, any>;

      for (const c of vatCols) {
        const v = r.vatByRate?.[c] ?? 0;
        base[c] = this.toFixed2(v);
      }

      base['withholdings'] = this.toFixed2(r.withholdings ?? 0);
      base['total'] = this.toFixed2(r.total);
      return base;
    });

    const headers = [
      'date',
      'number',
      'thirdPartyId',
      'thirdPartyName',
      'taxBase',
      ...vatCols,
      'withholdings',
      'total',
    ];

    return { flat, headers, vatCols };
  }

  // GET /accounting/export/sales-book.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&group=invoice|day
  @Get('sales-book.csv')
  async salesBookCsv(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('group') group: 'invoice' | 'day' = 'invoice',
    @Res() res: Response,
  ) {
    const data = await this.acc.salesBook(from, to, group);
    const { flat, headers } = this.flattenBookRows(data.rows ?? []);
    // Fila de totales al final
    if (data.totals) {
      const { flat: totalsFlat } = this.flattenBookRows([
        {
          date: '',
          number: '',
          thirdPartyId: '',
          thirdPartyName: 'TOTAL',
          taxBase: data.totals.taxBase ?? 0,
          vatByRate: data.totals.vatByRate ?? {},
          withholdings: data.totals.withholdings ?? 0,
          total: data.totals.total ?? 0,
        } as any,
      ]);
      flat.push(totalsFlat[0]);
    }
    const csv = this.toCsv(flat, headers);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales-book_${group}_${from}_${to}.csv"`,
    );
    res.send(csv);
  }

  // GET /accounting/export/purchase-book.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&group=invoice|day
  @Get('purchase-book.csv')
  async purchaseBookCsv(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('group') group: 'invoice' | 'day' = 'invoice',
    @Res() res: Response,
  ) {
    const data = await this.acc.purchaseBook(from, to, group);
    const { flat, headers } = this.flattenBookRows(data.rows ?? []);
    // Fila de totales al final
    if (data.totals) {
      const { flat: totalsFlat } = this.flattenBookRows([
        {
          date: '',
          number: '',
          thirdPartyId: '',
          thirdPartyName: 'TOTAL',
          taxBase: data.totals.taxBase ?? 0,
          vatByRate: data.totals.vatByRate ?? {},
          withholdings: data.totals.withholdings ?? 0,
          total: data.totals.total ?? 0,
        } as any,
      ]);
      flat.push(totalsFlat[0]);
    }
    const csv = this.toCsv(flat, headers);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="purchase-book_${group}_${from}_${to}.csv"`,
    );
    res.send(csv);
  }

  @Get('regulatory/dian/iva')
  async dianIvaExport(
    @Query() query: DianVatQueryDto & BooksExportFormatDto,
    @Res() res: Response,
  ) {
    const { format, ...filters } = query;
    const report = await this.acc.dianVatTemplate(filters);
    const vatColsSet = new Set<string>();
    for (const row of report.rows) {
      for (const key of Object.keys(row.vatByRate ?? {})) {
        vatColsSet.add(key);
      }
    }
    const vatCols = Array.from(vatColsSet).sort((a, b) => {
      const an = Number(String(a).split('_')[1] ?? NaN);
      const bn = Number(String(b).split('_')[1] ?? NaN);
      if (Number.isNaN(an) && Number.isNaN(bn)) return a.localeCompare(b);
      if (Number.isNaN(an)) return 1;
      if (Number.isNaN(bn)) return -1;
      return bn - an;
    });

    const headers = [
      'date',
      'documentNumber',
      'thirdPartyId',
      'thirdPartyDocument',
      'thirdPartyDv',
      'thirdPartyIdType',
      'thirdPartyName',
      'taxBase',
      'vatTotal',
      ...vatCols,
      'withholdings',
      'total',
    ];

    const rows = report.rows.map((row) => {
      const payload: Record<string, any> = {
        date: row.date,
        documentNumber: row.documentNumber ?? '',
        thirdPartyId: row.thirdPartyId ?? '',
        thirdPartyDocument: row.thirdPartyDocument ?? '',
        thirdPartyDv: row.thirdPartyDv ?? '',
        thirdPartyIdType: row.thirdPartyIdType ?? '',
        thirdPartyName: row.thirdPartyName ?? '',
        taxBase: this.toFixed2(row.taxBase),
        vatTotal: this.toFixed2(row.vatTotal),
        withholdings: this.toFixed2(row.withholdings),
        total: this.toFixed2(row.total),
      };
      for (const col of vatCols) {
        payload[col] = this.toFixed2(row.vatByRate?.[col] ?? 0);
      }
      return payload;
    });

    const fromStr = this.isoDate(report.from);
    const toStr = this.isoDate(report.to);
    const scope = report.scope.toLowerCase();
    const filename = `dian_iva_${scope}_${fromStr || 'na'}_${toStr || 'na'}`;
    this.exportDataset(res, rows, headers, filename, format);
  }

  @Get('regulatory/dian/withholdings')
  async dianWithholdingsExport(
    @Query() query: DianWithholdingQueryDto & BooksExportFormatDto,
    @Res() res: Response,
  ) {
    const { format, ...filters } = query;
    const report = await this.acc.dianWithholdingTemplate(filters);
    const headers = [
      'date',
      'invoiceType',
      'invoiceId',
      'documentNumber',
      'thirdPartyId',
      'thirdPartyDocument',
      'thirdPartyDv',
      'thirdPartyIdType',
      'thirdPartyName',
      'withholdingType',
      'ruleId',
      'ruleCiiuCode',
      'ruleMunicipalityCode',
      'base',
      'ratePct',
      'amount',
    ];

    const rows = report.rows.map((row) => ({
      date: row.date,
      invoiceType: row.invoiceType,
      invoiceId: row.invoiceId ?? '',
      documentNumber: row.documentNumber ?? '',
      thirdPartyId: row.thirdPartyId ?? '',
      thirdPartyDocument: row.thirdPartyDocument ?? '',
      thirdPartyDv: row.thirdPartyDv ?? '',
      thirdPartyIdType: row.thirdPartyIdType ?? '',
      thirdPartyName: row.thirdPartyName ?? '',
      withholdingType: row.withholdingType,
      ruleId: row.ruleId ?? '',
      ruleCiiuCode: row.ruleCiiuCode ?? '',
      ruleMunicipalityCode: row.ruleMunicipalityCode ?? '',
      base: this.toFixed2(row.base),
      ratePct: row.ratePct == null ? '' : Number(row.ratePct).toFixed(4),
      amount: this.toFixed2(row.amount),
    }));

    const fromStr = this.isoDate(report.from);
    const toStr = this.isoDate(report.to);
    const scope = report.scope.toLowerCase();
    const filename = `dian_withholdings_${scope}_${fromStr || 'na'}_${toStr || 'na'}`;
    this.exportDataset(res, rows, headers, filename, format);
  }

  @Get('regulatory/dian/magnetic')
  async dianMagneticExport(
    @Query() query: DianMagneticExportQueryDto & BooksExportFormatDto,
    @Res() res: Response,
  ) {
    const { format: fileFormat, formatCode, formats, ...rest } = query;
    const normalizedFormats = formats?.length
      ? formats.filter((code): code is DianMagneticFormatCode =>
          (DIAN_MAGNETIC_FORMAT_CODES as readonly string[]).includes(code),
        )
      : undefined;
    const defaultFormat = DIAN_MAGNETIC_FORMAT_CODES[0];
    const targetFormat: DianMagneticFormatCode =
      formatCode ?? normalizedFormats?.[0] ?? defaultFormat;
    const report = await this.acc.dianMagneticTemplate({
      ...rest,
      formats: normalizedFormats,
    });
    const data = report.formats?.[targetFormat];
    if (!data || !data.rows.length) {
      this.exportDataset(
        res,
        [],
        data?.columns ?? ['conceptCode'],
        `dian_magnetic_${targetFormat}`,
        fileFormat,
      );
      return;
    }

    const rows = data.rows.map((row: Record<string, any>) => {
      const payload: Record<string, any> = {};
      for (const column of data.columns) {
        payload[column] = row[column] ?? '';
      }
      return payload;
    });

    const fromStr = this.isoDate(report.from);
    const toStr = this.isoDate(report.to);
    const filename = `dian_magnetic_${targetFormat}_${report.year}_${fromStr || 'na'}_${toStr || 'na'}`;
    this.exportDataset(res, rows, data.columns, filename, fileFormat);
  }

  @Get('books/general-journal')
  async generalJournalExport(
    @Query() q: GeneralJournalQueryDto,
    @Query() formatDto: BooksExportFormatDto,
    @Res() res: Response,
  ) {
    const report = await this.acc.generalJournal(q);
    const rows: Array<Record<string, any>> = report.rows.map((row) => ({
      entryId: row.entryId,
      entryDate: this.isoDate(row.entryDate),
      entryStatus: row.entryStatus,
      journalCode: row.journalCode,
      journalName: row.journalName ?? '',
      entryNumber: row.entryNumber ?? '',
      sourceType: row.sourceType ?? '',
      sourceId: row.sourceId ?? '',
      accountCode: row.accountCode,
      accountName: row.accountName,
      accountNature: row.accountNature,
      lineId: row.lineId,
      lineDescription: row.lineDescription ?? '',
      entryDescription: row.entryDescription ?? '',
      thirdPartyId: row.thirdPartyId ?? '',
      thirdPartyDocument: row.thirdPartyDocument ?? '',
      thirdPartyName: row.thirdPartyName ?? '',
      costCenterId: row.costCenterId ?? '',
      costCenterCode: row.costCenterCode ?? '',
      costCenterName: row.costCenterName ?? '',
      debit: this.toFixed2(row.debit),
      credit: this.toFixed2(row.credit),
    }));

    rows.push({
      entryId: '',
      entryDate: '',
      entryStatus: '',
      journalCode: '',
      journalName: '',
      entryNumber: '',
      sourceType: '',
      sourceId: '',
      accountCode: '',
      accountName: '',
      accountNature: '',
      lineId: '',
      lineDescription: 'TOTAL',
      entryDescription: '',
      thirdPartyId: '',
      thirdPartyDocument: '',
      thirdPartyName: '',
      costCenterId: '',
      costCenterCode: '',
      costCenterName: '',
      debit: this.toFixed2(report.totals.debit),
      credit: this.toFixed2(report.totals.credit),
    });

    const headers = [
      'entryId',
      'entryDate',
      'entryStatus',
      'journalCode',
      'journalName',
      'entryNumber',
      'sourceType',
      'sourceId',
      'accountCode',
      'accountName',
      'accountNature',
      'lineId',
      'lineDescription',
      'entryDescription',
      'thirdPartyId',
      'thirdPartyDocument',
      'thirdPartyName',
      'costCenterId',
      'costCenterCode',
      'costCenterName',
      'debit',
      'credit',
    ];

    const filename = [
      'general-journal',
      this.isoDate(report.from),
      this.isoDate(report.to),
    ]
      .filter(Boolean)
      .join('_');

    const format = formatDto.format?.toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';

    this.exportDataset(res, rows, headers, filename, format);
  }

  @Get('books/aux/account')
  async auxLedgerAccountExport(
    @Query() q: AuxLedgerAccountQueryDto,
    @Query() formatDto: BooksExportFormatDto,
    @Res() res: Response,
  ) {
    const report = await this.acc.auxLedgerAccount(q);
    const rows: Array<Record<string, any>> = [];

    rows.push({
      entryId: '',
      entryDate: '',
      entryStatus: '',
      journalCode: '',
      journalName: '',
      entryNumber: '',
      sourceType: '',
      sourceId: '',
      accountCode: report.account.code,
      accountName: report.account.name,
      accountNature: report.account.nature,
      lineId: '',
      lineDescription: 'Saldo inicial',
      entryDescription: '',
      thirdPartyId: '',
      thirdPartyDocument: '',
      thirdPartyName: '',
      costCenterId: '',
      costCenterCode: '',
      costCenterName: '',
      debit: '',
      credit: '',
      balance: this.toFixed2(report.opening),
    });

    for (const row of report.rows) {
      rows.push({
        entryId: row.entryId,
        entryDate: this.isoDate(row.entryDate),
        entryStatus: row.entryStatus,
        journalCode: row.journalCode,
        journalName: row.journalName ?? '',
        entryNumber: row.entryNumber ?? '',
        sourceType: row.sourceType ?? '',
        sourceId: row.sourceId ?? '',
        accountCode: row.accountCode,
        accountName: row.accountName,
        accountNature: row.accountNature,
        lineId: row.lineId,
        lineDescription: row.lineDescription ?? '',
        entryDescription: row.entryDescription ?? '',
        thirdPartyId: row.thirdPartyId ?? '',
        thirdPartyDocument: row.thirdPartyDocument ?? '',
        thirdPartyName: row.thirdPartyName ?? '',
        costCenterId: row.costCenterId ?? '',
        costCenterCode: row.costCenterCode ?? '',
        costCenterName: row.costCenterName ?? '',
        debit: this.toFixed2(row.debit),
        credit: this.toFixed2(row.credit),
        balance: this.toFixed2(row.balance),
      });
    }

    rows.push({
      entryId: '',
      entryDate: '',
      entryStatus: '',
      journalCode: '',
      journalName: '',
      entryNumber: '',
      sourceType: '',
      sourceId: '',
      accountCode: report.account.code,
      accountName: report.account.name,
      accountNature: report.account.nature,
      lineId: '',
      lineDescription: 'Totales',
      entryDescription: '',
      thirdPartyId: '',
      thirdPartyDocument: '',
      thirdPartyName: '',
      costCenterId: '',
      costCenterCode: '',
      costCenterName: '',
      debit: this.toFixed2(report.totals.debit),
      credit: this.toFixed2(report.totals.credit),
      balance: this.toFixed2(report.closing),
    });

    const headers = [
      'entryId',
      'entryDate',
      'entryStatus',
      'journalCode',
      'journalName',
      'entryNumber',
      'sourceType',
      'sourceId',
      'accountCode',
      'accountName',
      'accountNature',
      'lineId',
      'lineDescription',
      'entryDescription',
      'thirdPartyId',
      'thirdPartyDocument',
      'thirdPartyName',
      'costCenterId',
      'costCenterCode',
      'costCenterName',
      'debit',
      'credit',
      'balance',
    ];

    const filename = [
      'aux-ledger-account',
      report.account.code,
      this.isoDate(report.from),
      this.isoDate(report.to),
    ]
      .filter(Boolean)
      .join('_');

    const format = formatDto.format?.toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';

    this.exportDataset(res, rows, headers, filename, format);
  }

  @Get('books/aux/third-party')
  async auxLedgerThirdPartyExport(
    @Query() q: AuxLedgerThirdPartyQueryDto,
    @Query() formatDto: BooksExportFormatDto,
    @Res() res: Response,
  ) {
    const report = await this.acc.auxLedgerThirdParty(q);
    const rows: Array<Record<string, any>> = [];

    const headers = [
      'entryId',
      'entryDate',
      'entryStatus',
      'journalCode',
      'journalName',
      'entryNumber',
      'sourceType',
      'sourceId',
      'accountCode',
      'accountName',
      'accountNature',
      'lineId',
      'lineDescription',
      'entryDescription',
      'thirdPartyId',
      'thirdPartyDocument',
      'thirdPartyName',
      'costCenterId',
      'costCenterCode',
      'costCenterName',
      'debit',
      'credit',
      'balance',
    ];

    const accountNames = new Map<string, string>();
    for (const opening of report.openings ?? []) {
      accountNames.set(opening.accountCode, opening.accountName ?? '');
      rows.push({
        entryId: '',
        entryDate: '',
        entryStatus: '',
        journalCode: '',
        journalName: '',
        entryNumber: '',
        sourceType: '',
        sourceId: '',
        accountCode: opening.accountCode,
        accountName: opening.accountName ?? '',
        accountNature: '',
        lineId: '',
        lineDescription: 'Saldo inicial',
        entryDescription: '',
        thirdPartyId: report.thirdParty?.id ?? '',
        thirdPartyDocument: report.thirdParty?.document ?? '',
        thirdPartyName: report.thirdParty?.name ?? '',
        costCenterId: '',
        costCenterCode: '',
        costCenterName: '',
        debit: '',
        credit: '',
        balance: this.toFixed2(opening.opening),
      });
    }

    for (const row of report.rows) {
      accountNames.set(row.accountCode, row.accountName);
      rows.push({
        entryId: row.entryId,
        entryDate: this.isoDate(row.entryDate),
        entryStatus: row.entryStatus,
        journalCode: row.journalCode,
        journalName: row.journalName ?? '',
        entryNumber: row.entryNumber ?? '',
        sourceType: row.sourceType ?? '',
        sourceId: row.sourceId ?? '',
        accountCode: row.accountCode,
        accountName: row.accountName,
        accountNature: row.accountNature,
        lineId: row.lineId,
        lineDescription: row.lineDescription ?? '',
        entryDescription: row.entryDescription ?? '',
        thirdPartyId: row.thirdPartyId ?? '',
        thirdPartyDocument: row.thirdPartyDocument ?? '',
        thirdPartyName: row.thirdPartyName ?? '',
        costCenterId: row.costCenterId ?? '',
        costCenterCode: row.costCenterCode ?? '',
        costCenterName: row.costCenterName ?? '',
        debit: this.toFixed2(row.debit),
        credit: this.toFixed2(row.credit),
        balance: this.toFixed2(row.balance),
      });
    }

    for (const closing of report.closings ?? []) {
      const accountName = accountNames.get(closing.accountCode) ?? '';
      rows.push({
        entryId: '',
        entryDate: '',
        entryStatus: '',
        journalCode: '',
        journalName: '',
        entryNumber: '',
        sourceType: '',
        sourceId: '',
        accountCode: closing.accountCode,
        accountName,
        accountNature: '',
        lineId: '',
        lineDescription: 'Saldo final',
        entryDescription: '',
        thirdPartyId: report.thirdParty?.id ?? '',
        thirdPartyDocument: report.thirdParty?.document ?? '',
        thirdPartyName: report.thirdParty?.name ?? '',
        costCenterId: '',
        costCenterCode: '',
        costCenterName: '',
        debit: '',
        credit: '',
        balance: this.toFixed2(closing.closing),
      });
    }

    rows.push({
      entryId: '',
      entryDate: '',
      entryStatus: '',
      journalCode: '',
      journalName: '',
      entryNumber: '',
      sourceType: '',
      sourceId: '',
      accountCode: 'TOTAL',
      accountName: '',
      accountNature: '',
      lineId: '',
      lineDescription: 'Totales',
      entryDescription: '',
      thirdPartyId: '',
      thirdPartyDocument: '',
      thirdPartyName: '',
      costCenterId: '',
      costCenterCode: '',
      costCenterName: '',
      debit: this.toFixed2(report.totals.debit),
      credit: this.toFixed2(report.totals.credit),
      balance: '',
    });

    const filename = [
      'aux-ledger-third-party',
      report.thirdParty?.id,
      this.isoDate(report.from),
      this.isoDate(report.to),
    ]
      .filter((x) => x !== undefined && x !== null && `${x}`.trim() !== '')
      .join('_');

    const format = formatDto.format?.toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';

    this.exportDataset(res, rows, headers, filename, format);
  }

  @Get('books/aux/cost-center')
  async auxLedgerCostCenterExport(
    @Query() q: AuxLedgerCostCenterQueryDto,
    @Query() formatDto: BooksExportFormatDto,
    @Res() res: Response,
  ) {
    const report = await this.acc.auxLedgerCostCenter(q);
    const rows: Array<Record<string, any>> = [];

    const headers = [
      'entryId',
      'entryDate',
      'entryStatus',
      'journalCode',
      'journalName',
      'entryNumber',
      'sourceType',
      'sourceId',
      'accountCode',
      'accountName',
      'accountNature',
      'lineId',
      'lineDescription',
      'entryDescription',
      'thirdPartyId',
      'thirdPartyDocument',
      'thirdPartyName',
      'costCenterId',
      'costCenterCode',
      'costCenterName',
      'debit',
      'credit',
      'balance',
    ];

    const accountNames = new Map<string, string>();
    for (const opening of report.openings ?? []) {
      accountNames.set(opening.accountCode, opening.accountName ?? '');
      rows.push({
        entryId: '',
        entryDate: '',
        entryStatus: '',
        journalCode: '',
        journalName: '',
        entryNumber: '',
        sourceType: '',
        sourceId: '',
        accountCode: opening.accountCode,
        accountName: opening.accountName ?? '',
        accountNature: '',
        lineId: '',
        lineDescription: 'Saldo inicial',
        entryDescription: '',
        thirdPartyId: '',
        thirdPartyDocument: '',
        thirdPartyName: '',
        costCenterId: report.costCenter?.id ?? '',
        costCenterCode: report.costCenter?.code ?? '',
        costCenterName: report.costCenter?.name ?? '',
        debit: '',
        credit: '',
        balance: this.toFixed2(opening.opening),
      });
    }

    for (const row of report.rows) {
      accountNames.set(row.accountCode, row.accountName);
      rows.push({
        entryId: row.entryId,
        entryDate: this.isoDate(row.entryDate),
        entryStatus: row.entryStatus,
        journalCode: row.journalCode,
        journalName: row.journalName ?? '',
        entryNumber: row.entryNumber ?? '',
        sourceType: row.sourceType ?? '',
        sourceId: row.sourceId ?? '',
        accountCode: row.accountCode,
        accountName: row.accountName,
        accountNature: row.accountNature,
        lineId: row.lineId,
        lineDescription: row.lineDescription ?? '',
        entryDescription: row.entryDescription ?? '',
        thirdPartyId: row.thirdPartyId ?? '',
        thirdPartyDocument: row.thirdPartyDocument ?? '',
        thirdPartyName: row.thirdPartyName ?? '',
        costCenterId: row.costCenterId ?? '',
        costCenterCode: row.costCenterCode ?? '',
        costCenterName: row.costCenterName ?? '',
        debit: this.toFixed2(row.debit),
        credit: this.toFixed2(row.credit),
        balance: this.toFixed2(row.balance),
      });
    }

    for (const closing of report.closings ?? []) {
      const accountName = accountNames.get(closing.accountCode) ?? '';
      rows.push({
        entryId: '',
        entryDate: '',
        entryStatus: '',
        journalCode: '',
        journalName: '',
        entryNumber: '',
        sourceType: '',
        sourceId: '',
        accountCode: closing.accountCode,
        accountName,
        accountNature: '',
        lineId: '',
        lineDescription: 'Saldo final',
        entryDescription: '',
        thirdPartyId: '',
        thirdPartyDocument: '',
        thirdPartyName: '',
        costCenterId: report.costCenter?.id ?? '',
        costCenterCode: report.costCenter?.code ?? '',
        costCenterName: report.costCenter?.name ?? '',
        debit: '',
        credit: '',
        balance: this.toFixed2(closing.closing),
      });
    }

    rows.push({
      entryId: '',
      entryDate: '',
      entryStatus: '',
      journalCode: '',
      journalName: '',
      entryNumber: '',
      sourceType: '',
      sourceId: '',
      accountCode: 'TOTAL',
      accountName: '',
      accountNature: '',
      lineId: '',
      lineDescription: 'Totales',
      entryDescription: '',
      thirdPartyId: '',
      thirdPartyDocument: '',
      thirdPartyName: '',
      costCenterId: '',
      costCenterCode: '',
      costCenterName: '',
      debit: this.toFixed2(report.totals.debit),
      credit: this.toFixed2(report.totals.credit),
      balance: '',
    });

    const filename = [
      'aux-ledger-cost-center',
      report.costCenter?.code,
      this.isoDate(report.from),
      this.isoDate(report.to),
    ]
      .filter((x) => x !== undefined && x !== null && `${x}`.trim() !== '')
      .join('_');

    const format = formatDto.format?.toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';

    this.exportDataset(res, rows, headers, filename, format);
  }

  // =========================
  // NUEVOS SOPORTES (Comprobantes y Libro Mayor)
  // =========================

  /**
   * Comprobantes (journal) por rango:
   * Combina líneas de todas las cuentas usando trialBalance+ledger(),
   * agrupadas por fecha y fuente (sourceType#sourceId).
   *
   * CSV columnas: date, source, accountCode, accountName, description, debit, credit
   */
  @Get('journal.csv')
  async journalCsv(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    // 1) Obtén cuentas con movimiento en el rango
    const tb = await this.acc.trialBalance(from, to);
    const accounts = tb.rows.map((r) => ({ code: r.code, name: r.name }));

    // 2) Junta todas las líneas de mayor (una pasada por cuenta)
    const allLines: Array<{
      date: string;
      source: string;
      accountCode: string;
      accountName: string;
      description: string;
      debit: string | number;
      credit: string | number;
    }> = [];

    for (const a of accounts) {
      const led = await this.acc.ledger(a.code, from, to);
      for (const r of led.rows) {
        allLines.push({
          date: new Date(r.date).toISOString().slice(0, 10),
          source: `${r.sourceType}#${r.sourceId}`,
          accountCode: a.code,
          accountName: a.name ?? '',
          description: r.description ?? '',
          debit: this.toFixed2(r.debit),
          credit: this.toFixed2(r.credit),
        });
      }
    }

    // 3) Ordena por fecha asc, luego por source, luego por cuenta
    allLines.sort((x, y) =>
      x.date === y.date
        ? x.source === y.source
          ? x.accountCode.localeCompare(y.accountCode)
          : x.source.localeCompare(y.source)
        : x.date.localeCompare(y.date),
    );

    // 4) (Opcional) fila total final
    const totalDebit = allLines.reduce((s, r) => s + Number(r.debit || 0), 0);
    const totalCredit = allLines.reduce((s, r) => s + Number(r.credit || 0), 0);
    allLines.push({
      date: '',
      source: 'TOTAL',
      accountCode: '',
      accountName: '',
      description: '',
      debit: this.toFixed2(totalDebit),
      credit: this.toFixed2(totalCredit),
    });

    const csv = this.toCsv(allLines, [
      'date',
      'source',
      'accountCode',
      'accountName',
      'description',
      'debit',
      'credit',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="journal_${from}_${to}.csv"`,
    );
    res.send(csv);
  }

  /**
   * Libro mayor general por rango:
   * Concatenación de los ledger por cuenta, manteniendo la corrida (runBalance) de cada cuenta.
   *
   * CSV columnas: accountCode, accountName, date, source, description, debit, credit, runBalance
   */
  @Get('ledger.csv')
  async generalLedgerCsv(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const tb = await this.acc.trialBalance(from, to);
    const accounts = tb.rows.map((r) => ({ code: r.code, name: r.name }));

    const rows: Array<{
      accountCode: string;
      accountName: string;
      date: string;
      source: string;
      description: string;
      debit: string | number;
      credit: string | number;
      runBalance: string | number;
    }> = [];

    for (const a of accounts) {
      const led = await this.acc.ledger(a.code, from, to);
      for (const r of led.rows) {
        rows.push({
          accountCode: a.code,
          accountName: a.name ?? '',
          date: new Date(r.date).toISOString().slice(0, 10),
          source: `${r.sourceType}#${r.sourceId}`,
          description: r.description ?? '',
          debit: this.toFixed2(r.debit),
          credit: this.toFixed2(r.credit),
          runBalance: this.toFixed2(r.runBalance),
        });
      }
    }

    // Orden: accountCode asc, fecha asc, luego source
    rows.sort((x, y) =>
      x.accountCode === y.accountCode
        ? x.date === y.date
          ? x.source.localeCompare(y.source)
          : x.date.localeCompare(y.date)
        : x.accountCode.localeCompare(y.accountCode),
    );

    const csv = this.toCsv(rows, [
      'accountCode',
      'accountName',
      'date',
      'source',
      'description',
      'debit',
      'credit',
      'runBalance',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="general-ledger_${from}_${to}.csv"`,
    );
    res.send(csv);
  }

  // =========================
  // Otros reportes (existentes)
  // =========================

  // IVA/VAT (ventas o compras)
  // /accounting/export/vat.csv?from=2025-01-01&to=2025-01-31&kind=SALES|PURCHASES
  @Get('vat.csv')
  async vatCsv(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('kind') kind: 'SALES' | 'PURCHASES' = 'SALES',
    @Res() res: Response,
  ) {
    const r = await this.acc.vatReport(from, to, kind);
    const rows = r.rows.map((row) => ({
      date: new Date(row.date).toISOString().slice(0, 10),
      source: `${row.sourceType}#${row.sourceId}`,
      description: row.description ?? '',
      amount: row.amount.toFixed(2),
    }));
    // total al final
    rows.push({
      date: '',
      source: '',
      description: 'TOTAL',
      amount: r.total.toFixed(2),
    } as any);
    const csv = this.toCsv(rows, ['date', 'source', 'description', 'amount']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="vat_${kind}_${from}_${to}.csv"`,
    );
    res.send(csv);
  }

  // Aging de AR/AP
  // /accounting/export/aging.csv?asOf=2025-01-31&scope=AR|AP
  @Get('aging.csv')
  async agingCsv(
    @Query('asOf') asOf: string,
    @Query('scope') scope: 'AR' | 'AP' = 'AR',
    @Res() res: Response,
  ) {
    const r = await this.acc.agingReport(asOf, scope);
    const rows = r.rows.map((x) => ({
      thirdPartyId: x.thirdPartyId,
      thirdPartyName: x.thirdPartyName,
      current: x.current.toFixed(2),
      d30: x.d30.toFixed(2),
      d60: x.d60.toFixed(2),
      d90: x.d90.toFixed(2),
      d90p: x.d90p.toFixed(2),
    }));
    // Totales
    rows.push({
      thirdPartyId: '',
      thirdPartyName: 'TOTAL',
      current: r.totals.current.toFixed(2),
      d30: r.totals.d30.toFixed(2),
      d60: r.totals.d60.toFixed(2),
      d90: r.totals.d90.toFixed(2),
      d90p: r.totals.d90p.toFixed(2),
    } as any);
    const csv = this.toCsv(rows, [
      'thirdPartyId',
      'thirdPartyName',
      'current',
      'd30',
      'd60',
      'd90',
      'd90p',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="aging_${scope}_${asOf}.csv"`,
    );
    res.send(csv);
  }

  // Kárdex por ítem
  // /accounting/export/kardex.csv?itemId=1&from=2025-01-01&to=2025-01-31
  @Get('kardex.csv')
  async kardexCsv(
    @Query('itemId') itemId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const r = await this.acc.kardex(Number(itemId), from, to);
    const rows = r.rows.map((x) => ({
      id: x.id,
      ts: new Date(x.ts).toISOString(),
      type: x.type,
      warehouseId: x.warehouseId,
      qty: x.qty.toFixed(6),
      unitCost: x.unitCost.toFixed(6),
      amount: x.amount.toFixed(2),
      note: x.note ?? '',
    }));
    const csv = this.toCsv(rows, [
      'id',
      'ts',
      'type',
      'warehouseId',
      'qty',
      'unitCost',
      'amount',
      'note',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="kardex_item${itemId}_${from}_${to}.csv"`,
    );
    res.send(csv);
  }

  // COGS por ítem
  // /accounting/export/cogs.csv?from=2025-01-01&to=2025-01-31
  @Get('cogs.csv')
  async cogsCsv(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const r = await this.acc.cogsByItem(from, to);
    const rows = r.rows.map((x) => ({
      itemId: x.itemId,
      qty: x.qty.toFixed(6),
      cogs: x.cogs.toFixed(2),
    }));
    // total al final
    rows.push({ itemId: 'TOTAL', qty: '', cogs: r.total.toFixed(2) } as any);
    const csv = this.toCsv(rows, ['itemId', 'qty', 'cogs']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cogs_${from}_${to}.csv"`,
    );
    res.send(csv);
  }
}
