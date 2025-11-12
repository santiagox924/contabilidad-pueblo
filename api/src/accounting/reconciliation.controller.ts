import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { ReconcileDto } from './dto/reconcile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('accounting/reconciliation')
@UseGuards(JwtAuthGuard)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  // ====== EXISTENTES ======

  @Get('search')
  search(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('amount') amount?: string,
    @Query('ref') ref?: string,
  ) {
    const parsedAmount = amount != null ? Number(amount) : undefined;
    return this.reconciliationService.search({
      from,
      to,
      amount: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
      ref,
    });
  }

  @Post('mark')
  mark(@Body() dto: ReconcileDto) {
    return this.reconciliationService.mark(dto);
  }

  // ====== NUEVOS ======

  /**
   * Genera sugerencias de conciliación para un extracto.
   * Body (opcional):
   * {
   *   "daysTolerance": 3,
   *   "amountTolerance": 0,
   *   "minScore": 60
   * }
   */
  @Post(':statementId/suggest')
  suggest(
    @Param('statementId', ParseIntPipe) statementId: number,
    @Body()
    body?: {
      daysTolerance?: number;
      amountTolerance?: number;
      minScore?: number;
    },
  ) {
    return this.reconciliationService.suggestMatches(statementId, body);
  }

  /**
   * Aplica conciliación para las sugerencias con score >= minScore.
   * Body (opcional): { "minScore": 60 }
   */
  @Post(':statementId/apply')
  apply(
    @Param('statementId', ParseIntPipe) statementId: number,
    @Body('minScore') minScore?: number,
  ) {
    return this.reconciliationService.applyMatches(
      statementId,
      Number(minScore) || 60,
    );
  }

  /**
   * Revierte la conciliación aplicada desde un extracto.
   * Body:
   * {
   *   "statementId": 123,
   *   "lineIds": [1,2,3],        // opcional; si se omite, revierte todas las líneas del extracto
   *   "clearSuggestion": false   // opcional; si true, borra matchedLineId y matchScore
   * }
   */
  @Post('undo')
  undo(
    @Body('statementId', ParseIntPipe) statementId: number,
    @Body('lineIds') lineIds?: number[],
    @Body('clearSuggestion') clearSuggestion?: boolean,
  ) {
    return this.reconciliationService.undoMatch(
      statementId,
      lineIds,
      !!clearSuggestion,
    );
  }
}
