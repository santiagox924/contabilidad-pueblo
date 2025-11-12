// api/src/accounting/policies/can-post-manual-entry.policy.ts
import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, UserRoleCode } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/** Entrada manual candidata (payload típico antes de crear el asiento) */
export interface ManualEntryCandidate {
  date: Date | string;
  note?: string | null;
  /** Si usas referencia externa (opcional) */
  refType?: string | null;
  refId?: number | null;
  /** Líneas del asiento */
  lines: Array<{
    accountId?: number;
    accountCode?: string;
    debit?: number | Prisma.Decimal | string;
    credit?: number | Prisma.Decimal | string;
    note?: string | null;
  }>;
}

/** Contexto de autorización */
export interface ManualEntryContext {
  user: {
    id: number;
    roles?: string[];
    permissions?: string[];
  };
  /** Si quieres permitir uso de cuentas "sensibles" (IVA, CxC, CxP, inventario) en asientos manuales */
  allowSensitiveAccounts?: boolean;
}

/** Helpers */
function hasModel(prisma: any, modelName: string): boolean {
  return !!prisma?.[modelName] && typeof prisma[modelName] === 'object';
}

function hasAuth(
  u: ManualEntryContext['user'],
  need: { perms?: string[]; roles?: string[] },
) {
  const roles = new Set((u.roles ?? []).map((r) => r.toUpperCase()));
  const perms = new Set((u.permissions ?? []).map((p) => p.toUpperCase()));
  const requiredPerms = (need.perms ?? []).map((x) => x.toUpperCase());
  const requiredRoles = (need.roles ?? []).map((x) => x.toUpperCase());
  return (
    requiredPerms.some((p) => perms.has(p)) ||
    requiredRoles.some((r) => roles.has(r))
  );
}

const TWO_DECIMALS = new RegExp(/^-?\d+(\.\d{1,2})?$/);

/** Heurística de "cuentas sensibles": puedes ajustar códigos conforme a tu PUC/seed */
const SENSITIVE_CODE_PREFIXES = [
  // CxC, CxP
  '13',
  '23',
  // IVA (por pagar/descontable)
  '24',
  // Caja/Bancos
  '11',
  // Inventarios/COGS
  '14',
  '61',
];

/**
 * canPostManualEntry:
 * No lanza excepción; devuelve un diagnóstico acumulado.
 */
export async function canPostManualEntry(
  prisma: PrismaService | Prisma.TransactionClient,
  ctx: ManualEntryContext,
  candidate: ManualEntryCandidate,
): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];

  // 1) Permisos
  if (
    !hasAuth(ctx.user, {
      perms: ['ACCOUNTING_POST_MANUAL'],
      roles: [UserRoleCode.ACCOUNTING_ADMIN],
    })
  ) {
    issues.push('Permisos insuficientes para registrar asientos manuales');
  }

  // 2) Fecha válida
  const date = new Date(candidate.date as any);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    issues.push('Fecha del asiento inválida');
  }

  // 3) Periodo cerrado/bloqueado
  if (hasModel(prisma, 'accountingPeriod') && !Number.isNaN(date.getTime())) {
    try {
      const closed = await (prisma as any).accountingPeriod.findFirst({
        where: {
          startDate: { lte: date },
          endDate: { gt: date },
          status: { in: ['CLOSED', 'LOCKED'] },
        },
        select: { id: true },
      });
      if (closed) {
        issues.push(
          'El período contable para la fecha indicada está cerrado/bloqueado',
        );
      }
    } catch {
      /* noop */
    }
  }

  // 4) Líneas presentes
  const lines = Array.isArray(candidate.lines) ? candidate.lines : [];
  if (lines.length < 2) {
    issues.push('El asiento debe tener al menos dos líneas');
  }

  // 5) Montos válidos, 2 decimales, no negativos simultáneos, no ambos en la misma línea
  let debitTotal = new Prisma.Decimal(0);
  let creditTotal = new Prisma.Decimal(0);
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i] ?? {};
    const d =
      ln.debit != null
        ? new Prisma.Decimal(ln.debit as any)
        : new Prisma.Decimal(0);
    const c =
      ln.credit != null
        ? new Prisma.Decimal(ln.credit as any)
        : new Prisma.Decimal(0);

    if (ln.debit != null && !TWO_DECIMALS.test(String(ln.debit))) {
      issues.push(`Línea ${i + 1}: débito debe tener máximo 2 decimales`);
    }
    if (ln.credit != null && !TWO_DECIMALS.test(String(ln.credit))) {
      issues.push(`Línea ${i + 1}: crédito debe tener máximo 2 decimales`);
    }
    if (d.lt(0) || c.lt(0)) {
      issues.push(`Línea ${i + 1}: montos no pueden ser negativos`);
    }
    if (d.gt(0) && c.gt(0)) {
      issues.push(
        `Línea ${i + 1}: no puede tener débito y crédito simultáneamente`,
      );
    }
    if (d.eq(0) && c.eq(0)) {
      issues.push(`Línea ${i + 1}: monto en cero`);
    }

    // Evitar duplicados triviales: misma cuenta y mismo par (d,c) y misma nota
    const key = `${ln.accountId ?? ''}|${ln.accountCode ?? ''}|${d.toFixed()}|${c.toFixed()}|${(ln.note ?? '').trim()}`;
    if (seen.has(key)) {
      issues.push(`Línea ${i + 1}: línea duplicada`);
    } else {
      seen.add(key);
    }

    debitTotal = debitTotal.plus(d);
    creditTotal = creditTotal.plus(c);
  }

  if (!debitTotal.equals(creditTotal)) {
    issues.push(
      `Asiento no balanceado: Débito=${debitTotal.toFixed(2)} ≠ Crédito=${creditTotal.toFixed(2)}`,
    );
  }
  if (debitTotal.lte(0)) {
    issues.push('El total de débitos debe ser mayor que cero');
  }

  // 6) Validación de cuentas
  const needById = lines
    .filter((l) => typeof l.accountId === 'number')
    .map((l) => l.accountId!);
  const needByCode = lines
    .filter((l) => !!l.accountCode && !l.accountId)
    .map((l) => String(l.accountCode));

  let byId = new Map<number, any>();
  let byCode = new Map<string, any>();

  if (hasModel(prisma, 'coaAccount')) {
    try {
      if (needById.length) {
        const accs = await (prisma as any).coaAccount.findMany({
          where: { id: { in: needById } },
          select: {
            id: true,
            code: true,
            name: true,
            active: true,
            allowManual: true,
          },
        });
        byId = new Map(accs.map((a: any) => [a.id, a]));
      }
      if (needByCode.length) {
        const accs2 = await (prisma as any).coaAccount.findMany({
          where: { code: { in: needByCode } },
          select: {
            id: true,
            code: true,
            name: true,
            active: true,
            allowManual: true,
          },
        });
        byCode = new Map(accs2.map((a: any) => [String(a.code), a]));
      }
    } catch {
      /* noop */
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    let acc: any | undefined;
    if (typeof ln.accountId === 'number') acc = byId.get(ln.accountId);
    else if (ln.accountCode) acc = byCode.get(String(ln.accountCode));

    if (!acc) {
      issues.push(
        `Línea ${i + 1}: cuenta no encontrada (${ln.accountId ?? ln.accountCode ?? 'sin cuenta'})`,
      );
      continue;
    }
    if (acc.active === false) {
      issues.push(`Línea ${i + 1}: la cuenta ${acc.code} está inactiva`);
    }
    // allowManual: bandera útil en tu COA para restringir cuentas sensibles
    if (acc.allowManual === false && !ctx.allowSensitiveAccounts) {
      issues.push(
        `Línea ${i + 1}: la cuenta ${acc.code} no permite asientos manuales`,
      );
    }

    // Heurística adicional para restringir cuentas sensibles si no se habilita explícitamente
    if (!ctx.allowSensitiveAccounts) {
      const code: string = String(acc.code ?? '');
      if (SENSITIVE_CODE_PREFIXES.some((p) => code.startsWith(p))) {
        issues.push(
          `Línea ${i + 1}: la cuenta ${code} es sensible y está restringida para asientos manuales`,
        );
      }
    }
  }

  // 7) Si existe journalEntry, verificar que no haya “lock” del día (opcional)
  if (hasModel(prisma, 'journalEntry') && !Number.isNaN(date.getTime())) {
    try {
      // Si tu esquema tiene otra tabla de locks diarios, ajusta aquí.
      // Este check evita asiento manual con fecha anterior al último “seal” del día.
      const lastPosted = await (prisma as any).journalEntry.findFirst({
        where: { posted: true, date: { gt: date } },
        select: { id: true },
        orderBy: { date: 'desc' },
      });
      if (lastPosted) {
        // No es necesariamente un error, pero muchas políticas lo restringen:
        // registrar en una fecha anterior a asientos más recientes puede romper correlativos internos.
        // Si no quieres esta regla, comenta el push:
        // issues.push('No se permite registrar con fecha anterior a asientos ya posteados posteriores')
      }
    } catch {
      /* noop */
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * assertPostManualEntry:
 * Variante que lanza excepciones. Úsala en el servicio antes de crear el asiento.
 */
export async function assertPostManualEntry(
  prisma: PrismaService | Prisma.TransactionClient,
  ctx: ManualEntryContext,
  candidate: ManualEntryCandidate,
): Promise<void> {
  const { ok, issues } = await canPostManualEntry(prisma, ctx, candidate);
  if (!ok) {
    const permIssue = issues.find((x) => x.toLowerCase().includes('permiso'));
    if (permIssue) throw new ForbiddenException(issues.join(' · '));
    throw new BadRequestException(issues.join(' · '));
  }
}

@Injectable()
export class ManualEntryPolicy {
  constructor(private readonly prisma: PrismaService) {}

  /** Lanza si no se puede postear el asiento manual */
  async assert(
    user: ManualEntryContext['user'],
    candidate: ManualEntryCandidate,
    allowSensitiveAccounts = false,
  ) {
    return assertPostManualEntry(
      this.prisma,
      { user, allowSensitiveAccounts },
      candidate,
    );
  }

  /** Devuelve diagnóstico no intrusivo para UI (issues) */
  async check(
    user: ManualEntryContext['user'],
    candidate: ManualEntryCandidate,
    allowSensitiveAccounts = false,
  ) {
    return canPostManualEntry(
      this.prisma,
      { user, allowSensitiveAccounts },
      candidate,
    );
  }
}
