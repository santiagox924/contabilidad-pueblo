// api/src/accounting/reconciliation/matching/matching.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface MatchOptions {
  /** Tolerancia de días para matchear por fecha (±). Default: 3 */
  daysTolerance?: number;
  /** Tolerancia de monto en unidades monetarias. Default: 0 (exacto) */
  amountTolerance?: number;
  /** Puntaje mínimo para considerar candidato “aceptable” (0..100). Default: 60 */
  minScore?: number;
}

/** Normaliza descripciones/referencias: minúsculas, sin tildes, sin símbolos redundantes */
function normalizeRef(s?: string | null): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Conjunto de trigramas de un string para Jaccard */
function trigrams(s: string): Set<string> {
  const set = new Set<string>();
  const pad = `  ${s}  `;
  for (let i = 0; i < pad.length - 2; i++) {
    set.add(pad.slice(i, i + 3));
  }
  return set;
}

/** Similaridad Jaccard de trigramas (0..1) */
function trigramJaccard(a: string, b: string): number {
  if (!a || !b) return 0;
  const A = trigrams(a);
  const B = trigrams(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

/** Diferencia de días absoluta entre dos fechas (utc) */
function absDayDiff(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / 86400000);
}

/** Calcula puntaje 0..100 ponderando monto (50), fecha (30), referencia (20) */
function scoreMatch(params: {
  amountDiffAbs: number;
  amountTolerance: number;
  dayDiff: number;
  daysTolerance: number;
  refSim: number; // 0..1
}): number {
  const { amountDiffAbs, amountTolerance, dayDiff, daysTolerance, refSim } =
    params;

  // Monto: si dentro de tolerancia ⇒ 1; si no ⇒ decae rápido
  let amountScore = 0;
  if (amountDiffAbs <= amountTolerance) {
    amountScore = 1;
  } else {
    // penalización proporcional (más allá de la tolerancia, cae hacia 0)
    const over = amountDiffAbs - amountTolerance;
    // caída suave: 1 / (1 + over) con escala en moneda
    amountScore = 1 / (1 + over);
    amountScore = Math.max(0, Math.min(1, amountScore));
  }

  // Fecha: si dentro de tolerancia ⇒ 1; si no ⇒ decae lineal hasta 0 a +14 días
  let dateScore = 0;
  if (dayDiff <= daysTolerance) {
    dateScore = 1;
  } else {
    const over = Math.min(14, Math.max(0, dayDiff - daysTolerance));
    dateScore = Math.max(0, 1 - over / 14);
  }

  // Referencia: ya es 0..1
  const refScore = refSim;

  // Ponderación
  const total = amountScore * 0.5 + dateScore * 0.3 + refScore * 0.2;

  return Math.round(total * 100);
}

/** Suma contable: credit - debit (no podemos hacerlo en el query, lo hacemos en JS) */
function journalSignedAmount(j: {
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
}): number {
  const debit = Number(j.debit ?? 0);
  const credit = Number(j.credit ?? 0);
  return credit - debit;
}

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Genera sugerencias para todas las líneas del extracto:
   * - Actualiza BankStatementLine.matchScore y matchedLineId (mejor candidato o null)
   * - NO marca conciliación en JournalLine (eso lo hace applyMatches)
   * Retorna un resumen con conteos.
   */
  async suggestMatches(
    statementId: number,
    opts?: MatchOptions,
  ): Promise<{
    processed: number;
    suggested: number;
    options: Required<MatchOptions>;
  }> {
    const daysTolerance = opts?.daysTolerance ?? 3;
    const amountTolerance = opts?.amountTolerance ?? 0;
    const minScore = opts?.minScore ?? 60;

    const statement = await this.prisma.bankStatement.findUnique({
      where: { id: statementId },
    });
    if (!statement) throw new NotFoundException('Extracto no encontrado');

    // Traer líneas del extracto
    const lines = await this.prisma.bankStatementLine.findMany({
      where: { statementId },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    if (!lines.length)
      return {
        processed: 0,
        suggested: 0,
        options: { daysTolerance, amountTolerance, minScore },
      };

    // Rango de fechas ampliado por tolerancia para traer candidatos de JournalLine
    const minDate = new Date(Math.min(...lines.map((l) => l.date.getTime())));
    const maxDate = new Date(Math.max(...lines.map((l) => l.date.getTime())));
    const from = new Date(minDate.getTime() - (daysTolerance + 7) * 86400000); // pequeño buffer extra
    const to = new Date(maxDate.getTime() + (daysTolerance + 7) * 86400000);

    // Candidatos: JournalLines NO conciliadas en rango y con cuenta bancaria o reconcilable
    const candidates = await this.prisma.journalLine.findMany({
      where: {
        reconciled: false,
        entry: { date: { gte: from, lte: to } },
        // filtra cuentas “banco” si tu plan de cuentas lo usa
        account: { isBank: true },
      },
      include: {
        entry: true,
        account: {
          select: { code: true, name: true, isBank: true, reconcilable: true },
        },
      },
      orderBy: [{ entry: { date: 'asc' } }, { id: 'asc' }],
    });

    // Precalcular referencias normalizadas para candidatos
    const candMemo = candidates.map((c) => ({
      id: c.id,
      date: c.entry.date,
      debit: c.debit,
      credit: c.credit,
      signed: journalSignedAmount(c),
      description: c.description ?? '',
      accountCode: c.accountCode,
      refNorm: normalizeRef(c.description ?? ''),
      existingBankRef: normalizeRef(String(c['bankRef'] ?? '')),
    }));

    let suggested = 0;

    // Procesar cada línea del extracto
    for (const bl of lines) {
      const bankAmt = Number(bl.amount);
      const bankSign = Math.sign(bankAmt) || 0;
      const refNorm = normalizeRef(bl.reference ?? bl.description ?? '');

      // filtra candidatos por signo y ventana de monto amplia (± 10 * tolerancia como pre-filtro)
      const pre = candMemo.filter((c) => {
        const sign = Math.sign(c.signed) || 0;
        if (sign !== bankSign) return false; // signos distintos rara vez matchean
        const roughDiff = Math.abs(c.signed - bankAmt);
        return (
          roughDiff <= Math.max(amountTolerance * 10, Math.abs(bankAmt) * 5 + 1)
        ); // pre-filtro generoso
      });

      let best: { id: number; score: number } | null = null;

      for (const c of pre) {
        const dayDiff = absDayDiff(bl.date, c.date);
        const amountDiffAbs = Math.abs(c.signed - bankAmt);
        const refSim = Math.max(
          trigramJaccard(refNorm, c.refNorm),
          trigramJaccard(refNorm, c.existingBankRef),
        );

        const score = scoreMatch({
          amountDiffAbs,
          amountTolerance,
          dayDiff,
          daysTolerance,
          refSim,
        });

        if (!best || score > best.score) best = { id: c.id, score };
      }

      // Guarda el mejor candidato si pasa el umbral; si no, limpia cualquier match previo
      if (best && best.score >= minScore) {
        await this.prisma.bankStatementLine.update({
          where: { id: bl.id },
          data: { matchedLineId: best.id, matchScore: best.score },
        });
        suggested++;
      } else {
        await this.prisma.bankStatementLine.update({
          where: { id: bl.id },
          data: { matchedLineId: null, matchScore: null },
        });
      }
    }

    // Marcar encabezado como "matched" si hubo sugerencias
    await this.prisma.bankStatement.update({
      where: { id: statementId },
      data: { status: suggested > 0 ? 'matched' : 'parsed' },
    });

    return {
      processed: lines.length,
      suggested,
      options: { daysTolerance, amountTolerance, minScore },
    };
  }

  /**
   * Aplica conciliación:
   * - Toma BankStatementLine con matchedLineId y matchScore >= minScore
   * - Marca JournalLine.reconciled = true, bankRef, reconciledAt
   * - Mantiene BankStatementLine.matchedLineId y matchScore como evidencia
   */
  async applyMatches(
    statementId: number,
    minScore = 60,
  ): Promise<{ applied: number; totalCandidates: number }> {
    const statement = await this.prisma.bankStatement.findUnique({
      where: { id: statementId },
    });
    if (!statement) throw new NotFoundException('Extracto no encontrado');

    const lines = await this.prisma.bankStatementLine.findMany({
      where: {
        statementId,
        matchedLineId: { not: null },
        matchScore: { gte: minScore },
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });

    const totalCandidates = lines.length;
    if (!totalCandidates) return { applied: 0, totalCandidates };

    let applied = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const bl of lines) {
        const jl = await tx.journalLine.findUnique({
          where: { id: bl.matchedLineId! },
        });
        if (!jl) continue;
        if (jl.reconciled) continue; // ya conciliada; evitar dobles marcas

        await tx.journalLine.update({
          where: { id: jl.id },
          data: {
            reconciled: true,
            bankRef: bl.reference ?? bl.description ?? jl.bankRef ?? null,
            reconciledAt: new Date(),
          },
        });

        applied++;
      }

      // Si aplicamos algo, elevamos status del encabezado
      await tx.bankStatement.update({
        where: { id: statementId },
        data: { status: applied > 0 ? 'posted' : 'matched' },
      });
    });

    return { applied, totalCandidates };
  }

  /**
   * Revierte la conciliación aplicada desde este extracto.
   * - Si se pasan lineIds, solo revierte esas líneas del extracto.
   * - Si no, revierte todas las líneas del extracto que tuvieran matchedLineId.
   * No toca las líneas del extracto (conserva el score y el link) a menos que pidas limpiar.
   */
  async undoMatch(
    statementId: number,
    lineIds?: number[],
    { clearSuggestion = false }: { clearSuggestion?: boolean } = {},
  ): Promise<{ undone: number }> {
    const statement = await this.prisma.bankStatement.findUnique({
      where: { id: statementId },
    });
    if (!statement) throw new NotFoundException('Extracto no encontrado');

    const whereLines: Prisma.BankStatementLineWhereInput = {
      statementId,
      ...(lineIds?.length ? { id: { in: lineIds } } : {}),
      matchedLineId: { not: null },
    };

    const lines = await this.prisma.bankStatementLine.findMany({
      where: whereLines,
      select: { id: true, matchedLineId: true },
    });
    if (!lines.length) return { undone: 0 };

    let undone = 0;

    await this.prisma.$transaction(async (tx) => {
      // 1) marcar JournalLine.reconciled = false
      const jlIds = lines.map((l) => l.matchedLineId!);
      if (jlIds.length) {
        await tx.journalLine.updateMany({
          where: { id: { in: jlIds } },
          data: { reconciled: false, bankRef: null, reconciledAt: null },
        });
        undone = jlIds.length;
      }

      // 2) opcional: limpiar sugerencia en BankStatementLine
      if (clearSuggestion) {
        await tx.bankStatementLine.updateMany({
          where: { id: { in: lines.map((l) => l.id) } },
          data: { matchedLineId: null, matchScore: null },
        });
      }

      // 3) bajar status del encabezado
      await tx.bankStatement.update({
        where: { id: statementId },
        data: { status: 'matched' },
      });
    });

    return { undone };
  }
}
