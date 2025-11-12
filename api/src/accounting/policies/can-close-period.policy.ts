// api/src/accounting/policies/can-close-period.policy.ts
import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, UserRoleCode } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Contexto de cierre de período.
 * start y end son inclusivo/exclusivo por defecto (gte/lt) para evitar zonas grises con horas.
 */
export interface ClosePeriodContext {
  user: {
    id: number;
    roles?: string[];
    permissions?: string[];
  };
  period: {
    start: Date;
    end: Date; // normalmente end = primer día del mes siguiente a las 00:00 para usar rango [start, end)
  };
}

/** Utilidad: ¿el cliente Prisma expone un modelo con este nombre? */
function hasModel(prisma: any, modelName: string): boolean {
  return !!prisma?.[modelName] && typeof prisma[modelName] === 'object';
}

/** Utilidad: evalúa si el usuario tiene alguno de los permisos/roles requeridos */
function hasAuth(
  u: ClosePeriodContext['user'],
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

/**
 * canClosePeriod:
 * Devuelve { ok, issues[] } sin lanzar excepciones. Útil para previews en UI.
 */
export async function canClosePeriod(
  prisma: PrismaService | Prisma.TransactionClient,
  ctx: ClosePeriodContext,
): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];

  // 0) Validaciones básicas de fechas
  const start = new Date(ctx.period.start);
  const end = new Date(ctx.period.end);
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    issues.push('Fecha de inicio inválida');
  }
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
    issues.push('Fecha de fin inválida');
  }
  if (start >= end) {
    issues.push('El inicio del período debe ser anterior al fin del período');
  }

  // 1) Permisos / Roles
  if (
    !hasAuth(ctx.user, {
      perms: ['ACCOUNTING_CLOSE_PERIOD'],
      roles: [UserRoleCode.ACCOUNTING_ADMIN],
    })
  ) {
    issues.push('Permisos insuficientes para cerrar períodos');
  }

  // Convertir a filtros (rango medio-abierto [start, end))
  const dateFilter = { gte: start, lt: end } as const;

  // 2) Periodo ya cerrado (si el modelo existe)
  if (hasModel(prisma, 'accountingPeriod')) {
    try {
      const alreadyClosed = await (prisma as any).accountingPeriod.findFirst({
        where: {
          startDate: start,
          endDate: end,
          status: { in: ['CLOSED', 'LOCKED'] }, // soporta ambos estados si existen
        },
        select: { id: true },
      });
      if (alreadyClosed) {
        issues.push('El período ya está cerrado/bloqueado');
      }
    } catch {
      // ignorar si el modelo no coincide exactamente; la verificación de existencia ya se hizo
    }
  }

  // 3) Asientos en borrador (journalEntry.posted === false) si existe journalEntry
  if (hasModel(prisma, 'journalEntry')) {
    try {
      const drafts = await (prisma as any).journalEntry.count({
        where: {
          date: dateFilter,
          posted: false,
        },
      });
      if (drafts > 0) {
        issues.push(
          `Existen ${drafts} asientos contables sin postear en el período`,
        );
      }
    } catch {
      /* noop */
    }
  }

  // 4) Ventas emitidas sin asiento contable
  //    Estrategia: si existen ambos modelos (salesInvoice y journalEntry con ref), validamos cobertura.
  if (hasModel(prisma, 'salesInvoice') && hasModel(prisma, 'journalEntry')) {
    try {
      const sales = await (prisma as any).salesInvoice.findMany({
        where: { issueDate: dateFilter, status: 'ISSUED' },
        select: { id: true },
      });
      if (sales.length > 0) {
        const ids = sales.map((s: any) => s.id);
        const jeCount = await (prisma as any).journalEntry.count({
          where: {
            date: dateFilter,
            posted: true,
            refType: 'SalesInvoice',
            refId: { in: ids },
          },
        });
        if (jeCount < sales.length) {
          issues.push(
            `Hay facturas de venta emitidas sin asiento contable (${sales.length - jeCount} faltantes)`,
          );
        }
      }
    } catch {
      /* noop */
    }
  }

  // 5) Compras emitidas sin asiento contable
  if (hasModel(prisma, 'purchaseInvoice') && hasModel(prisma, 'journalEntry')) {
    try {
      const purchases = await (prisma as any).purchaseInvoice.findMany({
        where: { issueDate: dateFilter, status: 'ISSUED' },
        select: { id: true },
      });
      if (purchases.length > 0) {
        const ids = purchases.map((p: any) => p.id);
        const jeCount = await (prisma as any).journalEntry.count({
          where: {
            date: dateFilter,
            posted: true,
            refType: 'PurchaseInvoice',
            refId: { in: ids },
          },
        });
        if (jeCount < purchases.length) {
          issues.push(
            `Hay facturas de compra emitidas sin asiento contable (${purchases.length - jeCount} faltantes)`,
          );
        }
      }
    } catch {
      /* noop */
    }
  }

  // 6) Tesorería: recibos sin asiento
  if (hasModel(prisma, 'cashReceipt') && hasModel(prisma, 'journalEntry')) {
    try {
      const receipts = await (prisma as any).cashReceipt.findMany({
        where: { date: dateFilter },
        select: { id: true },
      });
      if (receipts.length > 0) {
        const ids = receipts.map((r: any) => r.id);
        const jeCount = await (prisma as any).journalEntry.count({
          where: {
            date: dateFilter,
            posted: true,
            refType: 'CashReceipt',
            refId: { in: ids },
          },
        });
        if (jeCount < receipts.length) {
          issues.push(
            `Hay recibos de caja/banco sin asiento contable (${receipts.length - jeCount} faltantes)`,
          );
        }
      }
    } catch {
      /* noop */
    }
  }

  // 7) Tesorería: pagos a proveedores sin asiento
  if (hasModel(prisma, 'vendorPayment') && hasModel(prisma, 'journalEntry')) {
    try {
      const pays = await (prisma as any).vendorPayment.findMany({
        where: { date: dateFilter },
        select: { id: true },
      });
      if (pays.length > 0) {
        const ids = pays.map((p: any) => p.id);
        const jeCount = await (prisma as any).journalEntry.count({
          where: {
            date: dateFilter,
            posted: true,
            refType: 'VendorPayment',
            refId: { in: ids },
          },
        });
        if (jeCount < pays.length) {
          issues.push(
            `Hay pagos a proveedores sin asiento contable (${pays.length - jeCount} faltantes)`,
          );
        }
      }
    } catch {
      /* noop */
    }
  }

  // 8) (Opcional) Movimientos de inventario sin valorización (si usas costo promedio y posteas COGS al cierre)
  //    Puedes añadir validaciones específicas de tu negocio aquí.

  return { ok: issues.length === 0, issues };
}

/**
 * assertCanClosePeriod:
 * Variante que lanza excepciones 403/400 si no se cumplen los requisitos.
 * Úsala directamente en comandos de cierre.
 */
export async function assertCanClosePeriod(
  prisma: PrismaService | Prisma.TransactionClient,
  ctx: ClosePeriodContext,
): Promise<void> {
  const { ok, issues } = await canClosePeriod(prisma, ctx);
  if (!ok) {
    // Si es por permisos, usamos 403; si son reglas de negocio, 400.
    const permIssue = issues.find((x) => x.toLowerCase().includes('permiso'));
    if (permIssue) {
      throw new ForbiddenException(issues.join(' · '));
    }
    throw new BadRequestException(issues.join(' · '));
  }
}

@Injectable()
export class ClosePeriodPolicy {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifica y lanza si no se puede cerrar.
   * Suele llamarse desde el servicio de contabilidad antes de consolidar/sellar el período.
   */
  async assert(
    user: ClosePeriodContext['user'],
    period: ClosePeriodContext['period'],
  ) {
    return assertCanClosePeriod(this.prisma, { user, period });
  }

  /**
   * Devuelve diagnóstico no intrusivo para UI (issues).
   */
  async check(
    user: ClosePeriodContext['user'],
    period: ClosePeriodContext['period'],
  ) {
    return canClosePeriod(this.prisma, { user, period });
  }
}

/* ===================== USO SUGERIDO =====================

1) Registrar el provider en tu AccountingModule:

  import { ClosePeriodPolicy } from './policies/can-close-period.policy'
  @Module({
    providers: [AccountingService, ClosePeriodPolicy],
    exports:   [AccountingService, ClosePeriodPolicy],
  })

2) En tu AccountingService (método closePeriod):

  async closePeriod(user: CurrentUser, start: Date, end: Date) {
    await this.closePeriodPolicy.assert(user, { start, end })
    // ... consolidar saldos, generar asiento de cierre si aplica, marcar período como cerrado
  }

3) En el controlador, para un preview:

  @Get('period/close/check')
  check(@Query('start') s: string, @Query('end') e: string, @Req() req) {
    return this.closePeriodPolicy.check(req.user, { start: new Date(s), end: new Date(e) })
  }

========================================================= */
