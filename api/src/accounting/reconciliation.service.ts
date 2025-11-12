import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReconcileDto } from './dto/reconcile.dto';
import {
  MatchingService,
  MatchOptions,
} from './reconciliation/matching/matching.service';

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
  ) {}

  // === EXISTENTE: no quitar ===
  async search(filters: {
    from?: string;
    to?: string;
    amount?: number;
    ref?: string;
  }) {
    const where: any = {};

    if (filters.from || filters.to) {
      where.entry = { date: {} };
      if (filters.from) where.entry.date.gte = new Date(filters.from);
      if (filters.to) where.entry.date.lte = new Date(filters.to);
    }

    // JournalLine no tiene "amount" directo; si lo estás usando como filtro exacto,
    // tomamos coincidencia por debit = amount o credit = amount (simple).
    if (typeof filters.amount === 'number') {
      where.OR = [{ debit: filters.amount }, { credit: filters.amount }];
    }

    if (filters.ref) {
      where.bankRef = { contains: filters.ref, mode: 'insensitive' };
    }

    return this.prisma.journalLine.findMany({
      where: {
        ...where,
        // ojo: el esquema usa "reconcilable" (no "isReconciliable")
        account: { reconcilable: true },
      },
      include: {
        entry: true,
        account: true,
        thirdParty: true,
        costCenter: true,
      },
      orderBy: [{ entry: { date: 'desc' } }, { id: 'desc' }],
      take: 500,
    });
  }

  // === EXISTENTE: no quitar ===
  async mark(dto: ReconcileDto) {
    if (!dto.lineIds?.length) {
      throw new BadRequestException(
        'Debe indicar al menos una línea a conciliar.',
      );
    }

    return this.prisma.journalLine.updateMany({
      where: { id: { in: dto.lineIds } },
      data: {
        reconciled: dto.reconciled,
        bankRef: dto.bankRef,
        reconciledAt: dto.reconciled ? new Date() : null,
      },
    });
  }

  // === NUEVO: generar sugerencias (no marca contablemente) ===
  async suggestMatches(statementId: number, opts?: MatchOptions) {
    return this.matching.suggestMatches(statementId, opts);
  }

  // === NUEVO: aplicar conciliación según minScore ===
  async applyMatches(statementId: number, minScore = 60) {
    return this.matching.applyMatches(statementId, minScore);
  }

  // === NUEVO (opcional): deshacer conciliación aplicada ===
  async undoMatch(
    statementId: number,
    lineIds?: number[],
    clearSuggestion = false,
  ) {
    return this.matching.undoMatch(statementId, lineIds, { clearSuggestion });
  }
}
