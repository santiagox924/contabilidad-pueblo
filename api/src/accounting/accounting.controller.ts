import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountingService } from './accounting.service';

@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly acc: AccountingService) {}

  @Get('trial-balance')
  trialBalance(@Query('from') from?: string, @Query('to') to?: string) {
    return this.acc.trialBalance(from, to);
  }

  @Get('ledger/:code')
  ledger(
    @Param('code') code: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.acc.ledger(code, from, to);
  }

  @Get('income-statement')
  income(@Query('from') from?: string, @Query('to') to?: string) {
    return this.acc.incomeStatement(from, to);
  }

  @Get('balance-sheet')
  balance(@Query('asOf') asOf?: string) {
    return this.acc.balanceSheet(asOf);
  }
}
