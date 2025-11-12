// api/src/accounting/accounting.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountingService } from './accounting.service';
import { RangeDto, LedgerQueryDto, AsOfDto } from './dto/range.dto';
import { CreateManualEntryDto } from './dto/create-manual-entry.dto';
import { ClosePeriodDto } from './dto/close-period.dto';
import { OpenPeriodDto } from './dto/open-period.dto';
import { LockPeriodDto } from './dto/lock-period.dto';
import { UpdateEntryStatusDto } from './dto/update-entry-status.dto';
import { ReverseEntryDto } from './dto/reverse-entry.dto';
import { VatReportDto } from './dto/vat-report.dto';
import { AgingDto } from './dto/aging.dto';
import { KardexDto } from './dto/kardex.dto';
import { CloseYearDto } from './dto/close-year.dto'; // ← NUEVO
import { MassReversePeriodDto } from './dto/mass-reverse-period.dto';
import { ReconcileStatementDto } from './dto/reconcile-statement.dto';
import {
  CreateJournalEntryDto,
  JournalListDto,
  UpdateJournalEntryDto,
} from './dto/journal-entry.dto';
import {
  AuxLedgerAccountQueryDto,
  AuxLedgerCostCenterQueryDto,
  AuxLedgerThirdPartyQueryDto,
  GeneralJournalQueryDto,
} from './dto/books.dto';
import {
  NiifBalanceQueryDto,
  NiifIncomeQueryDto,
  NiifCashFlowQueryDto,
} from './dto/niif-statements.dto';
import {
  DianMagneticQueryDto,
  DianVatQueryDto,
  DianWithholdingQueryDto,
} from './dto/regulatory.dto';

@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly acc: AccountingService) {}

  // ====== Reportes básicos ======
  @Get('trial-balance')
  trialBalance(@Query() q: RangeDto) {
    return this.acc.trialBalance(q.from, q.to);
  }

  @Get('ledger/:code')
  ledger(@Param('code') code: string, @Query() q: LedgerQueryDto) {
    return this.acc.ledger(code, q.from, q.to);
  }

  @Get('income-statement')
  income(@Query() q: RangeDto) {
    return this.acc.incomeStatement(q.from, q.to);
  }

  @Get('balance-sheet')
  balance(@Query() q: AsOfDto) {
    return this.acc.balanceSheet(q.asOf);
  }

  @Get('books/general-journal')
  generalJournal(@Query() q: GeneralJournalQueryDto) {
    return this.acc.generalJournal(q);
  }

  @Get('books/aux/account')
  auxLedgerAccount(@Query() q: AuxLedgerAccountQueryDto) {
    return this.acc.auxLedgerAccount(q);
  }

  @Get('books/aux/third-party')
  auxLedgerThirdParty(@Query() q: AuxLedgerThirdPartyQueryDto) {
    return this.acc.auxLedgerThirdParty(q);
  }

  @Get('books/aux/cost-center')
  auxLedgerCostCenter(@Query() q: AuxLedgerCostCenterQueryDto) {
    return this.acc.auxLedgerCostCenter(q);
  }

  // ====== Reportes NIIF ======
  @Get('niif/balance')
  niifBalance(@Query() q: NiifBalanceQueryDto) {
    return this.acc.niifBalanceStatement(q);
  }

  @Get('niif/income')
  niifIncome(@Query() q: NiifIncomeQueryDto) {
    return this.acc.niifIncomeStatement(q);
  }

  @Get('niif/cash-flow')
  niifCashFlow(@Query() q: NiifCashFlowQueryDto) {
    return this.acc.niifCashFlowStatement(q);
  }

  // ====== Reportes adicionales ======
  @Get('vat')
  vat(@Query() q: VatReportDto) {
    return this.acc.vatReport(q.from, q.to, q.kind);
  }

  @Get('aging')
  aging(@Query() q: AgingDto) {
    return this.acc.agingReport(q.asOf, q.scope);
  }

  @Get('kardex')
  kardex(@Query() q: KardexDto) {
    const itemId = Number(q.itemId);
    if (!Number.isFinite(itemId)) {
      throw new BadRequestException('itemId invalido');
    }
    return this.acc.kardex(itemId, q.from, q.to);
  }

  @Get('periods')
  periodsSummary(
    @Query('months') months?: string,
    @Query('focusYear') focusYear?: string,
  ) {
    const parsedMonths = months !== undefined ? Number(months) : undefined;
    const parsedYear = focusYear !== undefined ? Number(focusYear) : undefined;
    return this.acc.getPeriodsSummary({
      months:
        typeof parsedMonths === 'number' && Number.isFinite(parsedMonths)
          ? parsedMonths
          : undefined,
      focusYear:
        typeof parsedYear === 'number' && Number.isFinite(parsedYear)
          ? parsedYear
          : undefined,
    });
  }

  @Get('journals')
  journals(@Query() q: JournalListDto) {
    return this.acc.listJournalEntries(q);
  }

  @Get('journals/catalog')
  journalsCatalog() {
    return this.acc.listJournalsCatalog();
  }

  @Get('journals/:id')
  journal(@Param('id', ParseIntPipe) id: number) {
    return this.acc.getJournalEntry(id);
  }

  @Post('journals')
  createJournal(@Body() dto: CreateJournalEntryDto) {
    return this.acc.createJournalEntry(dto);
  }

  @Patch('journals/:id')
  updateJournal(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateJournalEntryDto,
  ) {
    return this.acc.updateJournalEntry(id, dto);
  }

  @Delete('journals/:id')
  removeJournal(@Param('id', ParseIntPipe) id: number) {
    return this.acc.deleteJournalEntry(id);
  }

  @Get('cogs')
  cogs(@Query() q: RangeDto) {
    return this.acc.cogsByItem(q.from, q.to);
  }

  // ====== NUEVOS Reportes Fiscales ======
  @Get('sales-book')
  salesBook(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group: 'invoice' | 'day' = 'invoice',
  ) {
    return this.acc.salesBook(from, to, group);
  }

  @Get('purchase-book')
  purchaseBook(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group: 'invoice' | 'day' = 'invoice',
  ) {
    return this.acc.purchaseBook(from, to, group);
  }

  @Get('regulatory/dian/iva')
  dianIvaTemplate(@Query() q: DianVatQueryDto) {
    return this.acc.dianVatTemplate(q);
  }

  @Get('regulatory/dian/withholdings')
  dianWithholdingsTemplate(@Query() q: DianWithholdingQueryDto) {
    return this.acc.dianWithholdingTemplate(q);
  }

  @Get('regulatory/dian/magnetic')
  dianMagneticTemplate(@Query() q: DianMagneticQueryDto) {
    return this.acc.dianMagneticTemplate(q);
  }

  // ====== Asientos manuales ======
  @Post('manual-entry')
  createManualEntry(@Body() dto: CreateManualEntryDto) {
    return this.acc.createManualEntry(dto);
  }

  @Post('manual-entry/:id/post')
  postManualEntry(@Param('id', ParseIntPipe) id: number) {
    return this.acc.postManualEntry(id);
  }

  @Post('entry/:id/reverse')
  reverseEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReverseEntryDto,
  ) {
    return this.acc.reverseEntry(id, dto.reason);
  }

  @Post('entry/:id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEntryStatusDto,
  ) {
    return this.acc.updateEntryStatus(id, dto.status);
  }

  // ====== Periodos contables ======
  @Post('close-period')
  closePeriod(@Body() dto: ClosePeriodDto) {
    return this.acc.closePeriod(dto);
  }

  @Post('open-period')
  openPeriod(@Body() dto: OpenPeriodDto) {
    return this.acc.openPeriod(dto);
  }

  @Post('lock-period')
  lockPeriod(@Body() dto: LockPeriodDto) {
    return this.acc.lockPeriod(dto);
  }

  @Post('reverse-period')
  reversePeriod(@Body() dto: MassReversePeriodDto) {
    return this.acc.massReversePeriodEntries(dto);
  }

  @Post('reconcile-statement')
  reconcileStatement(@Body() dto: ReconcileStatementDto) {
    return this.acc.reconcileFinancialStatements(dto);
  }

  // ====== Cierre de ejercicio (NUEVO) ======
  @Post('close-year')
  closeYear(@Body() dto: CloseYearDto) {
    return this.acc.closeFiscalYear(dto);
  }
}
