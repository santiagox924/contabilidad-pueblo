// api/src/purchases/purchases.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import {
  Prisma,
  PaymentType,
  InstallmentFrequency,
  StockMoveType,
  Unit,
  UnitKind,
  PurchaseStatus,
  WithholdingType, // ← enum del schema (RTF/RIVA/RICA)
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePurchaseInvoiceDto,
  PurchaseLineDto,
} from './dto/create-purchase-invoice.dto';
import { convertToBase } from '../common/units';
import { AccountingService } from '../accounting/accounting.service';
// (Opcional) si tienes un servicio central de retenciones:
import { WithholdingsService } from '../withholdings/withholdings.service';

/** === Contrato opcional local para el servicio de retenciones === */
type WithholdingsServiceContract = {
  computeForPurchaseLines?: (args: {
    thirdPartyId: number;
    lines: Array<{
      baseSubtotal: number;
      vatAmount: number;
      explicit: Array<{
        type: WithholdingType;
        rate?: number;
        amount?: number;
      }>;
    }>;
  }) => Promise<
    Array<
      Array<{
        type: WithholdingType;
        base: number;
        amount: number;
        rate?: number;
      }>
    >
  >;
};

/**
 * === Familias de UOM permitidas ===
 * Ajusta/expande según tu catálogo real de unidades.
 */
const ALLOWED_BY_KIND: Record<UnitKind, Unit[]> = {
  COUNT: [Unit.UN, Unit.DZ, Unit.PKG, Unit.BOX, Unit.PR, Unit.ROLL],
  WEIGHT: [Unit.MG, Unit.G, Unit.KG, Unit.LB],
  VOLUME: [Unit.ML, Unit.L, Unit.CM3, Unit.M3, Unit.OZ_FL, Unit.GAL],
  LENGTH: [Unit.MM, Unit.CM, Unit.M, Unit.KM, Unit.IN, Unit.FT, Unit.YD],
  AREA: [Unit.CM2, Unit.M2, Unit.IN2, Unit.FT2, Unit.YD2],
};

/** Mapa inverso: Unit -> UnitKind */
const KIND_OF_UNIT: Record<Unit, UnitKind> = Object.entries(
  ALLOWED_BY_KIND,
).reduce(
  (acc, [kind, units]) => {
    for (const u of units) acc[u] = kind as UnitKind;
    return acc;
  },
  {} as Record<Unit, UnitKind>,
);

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ==== NUEVO: mismo patrón que ventas, con IVA incluido/excluido y redondeo por paso ====
type PurchaseDet = { sub: number; vat: number; tot: number };
type PurchaseCalc = {
  det: PurchaseDet[];
  subtotal: number;
  tax: number;
  total: number;
};

const calcPurchase = (
  lines: (PurchaseLineDto & {
    priceIncludesTax?: boolean;
    discountPct?: number;
  })[],
): PurchaseCalc => {
  const det: PurchaseDet[] = lines.map((l) => {
    const qty = Number(l.qty);
    const unit = Number(l.unitCost);
    const rate = Math.max(0, Number(l.vatPct ?? 0));
    const discPct = Math.min(
      100,
      Math.max(0, Number((l as any).discountPct ?? 0)),
    );
    const priceIncludesTax = Boolean((l as any).priceIncludesTax);

    const gross = r2(qty * unit);
    const afterDisc = r2(gross * (1 - discPct / 100));

    if (priceIncludesTax) {
      // precio informado CON IVA: extraer base
      const base = r2(afterDisc / (1 + rate / 100));
      const vat = r2(afterDisc - base);
      const tot = r2(base + vat);
      return { sub: base, vat, tot };
    } else {
      // precio informado SIN IVA
      const base = afterDisc;
      const vat = r2(base * (rate / 100));
      const tot = r2(base + vat);
      return { sub: base, vat, tot };
    }
  });

  const subtotal = r2(det.reduce((a: number, b: PurchaseDet) => a + b.sub, 0));
  const tax = r2(det.reduce((a: number, b: PurchaseDet) => a + b.vat, 0));
  const total = r2(det.reduce((a: number, b: PurchaseDet) => a + b.tot, 0));
  return { det, subtotal, tax, total };
};

function addPeriod(d: Date, freq: InstallmentFrequency) {
  const x = new Date(d);
  if (freq === 'MONTHLY') x.setMonth(x.getMonth() + 1);
  else x.setDate(x.getDate() + 15);
  return x;
}
function addPeriods(d: Date, freq: InstallmentFrequency, n: number) {
  const x = new Date(d);
  if (freq === 'MONTHLY') x.setMonth(x.getMonth() + n);
  else x.setDate(x.getDate() + 15 * n);
  return x;
}
function splitEven(total: Prisma.Decimal | number, n: number) {
  const Decimal = Prisma.Decimal;
  const t = new Decimal(total as any);
  const base = t.div(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP as any);
  const arr = Array(n).fill(base);
  const sum = arr.reduce((a: any, b: any) => a.plus(b), new Decimal(0));
  const diff = t.minus(sum);
  arr[n - 1] = arr[n - 1].plus(diff);
  return arr;
}

type FindManyFilters = { q?: string; from?: string; to?: string };

/** ===== DTO opcional por línea =====
 * Permite declarar retenciones explícitas en la línea de compra.
 * Si ya lo tienes en tus DTOs, perfecto; si no, añade:
 *
 * export type PurchaseLineWithholdingInput = {
 *   type: WithholdingType;   // 'RTF' | 'RICA' | 'RIVA'
 *   rate?: number;           // % si viene explícito
 *   amount?: number;         // monto directo (prioridad sobre rate)
 * }
 * export class PurchaseLineDto { ...; withholdings?: PurchaseLineWithholdingInput[] }
 */

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    @Optional()
    private readonly withholdingsSvc?: WithholdingsService &
      WithholdingsServiceContract,
  ) {}

  // ================= Helpers =================
  private async nextPurchaseNumber(tx: Prisma.TransactionClient) {
    const last = await tx.purchaseInvoice.findFirst({
      select: { number: true },
      orderBy: { number: 'desc' },
    });
    return (last?.number ?? 5000) + 1;
  }

  /** Valida que la UOM pertenezca a la misma familia del ítem */
  private assertSameFamily(itemKind: UnitKind, uom: Unit) {
    const uomKind = KIND_OF_UNIT[uom];
    if (!uomKind) {
      throw new BadRequestException(
        `Unidad ${uom} no está soportada para validación`,
      );
    }
    if (uomKind !== itemKind) {
      throw new BadRequestException(
        `La unidad ${uom} no pertenece a la familia ${itemKind}`,
      );
    }
  }

  /** ==== NUEVO: cálculo de retenciones por línea (fallback local) ====
   * - RTF/RICA: base = lineSubtotal
   * - RIVA:     base = lineVat
   * - amount explícito tiene prioridad; luego rate% sobre base.
   */
  private computeLineWithholdingsFallback(
    line: PurchaseLineDto,
    det: { sub: number; vat: number },
  ) {
    const result: Array<{
      type: WithholdingType;
      base: number;
      amount: number;
      rate?: number;
    }> = [];

    const declared = (line as any).withholdings as
      | Array<{ type: WithholdingType; rate?: number; amount?: number }>
      | undefined;

    if (declared?.length) {
      for (const w of declared) {
        const type = w.type;
        const base = type === 'RIVA' ? det.vat : det.sub;
        const amount =
          w.amount != null
            ? r2(Number(w.amount))
            : r2(base * (Number(w.rate ?? 0) / 100));
        if (amount > 0) {
          result.push({ type, base: r2(base), amount, rate: w.rate });
        }
      }
      return result;
    }

    // Si no hay explícitas, no inferimos nada aquí (lo puede hacer el servicio si existe).
    return result;
  }

  /** ==== NUEVO: construir breakdown de retenciones de COMPRA ==== */
  private async buildPurchaseWithholdings(
    dto: CreatePurchaseInvoiceDto,
    det: { sub: number; vat: number }[],
  ) {
    type W = {
      type: WithholdingType;
      base: number;
      amount: number;
      rate?: number;
      lineIndex: number;
    };
    const acc: W[] = [];

    // 1) Si hay servicio y expone computeForPurchaseLines, úsalo
    if (this.withholdingsSvc?.computeForPurchaseLines) {
      const computed = await this.withholdingsSvc.computeForPurchaseLines({
        thirdPartyId: dto.thirdPartyId,
        lines: dto.lines.map((l, i) => ({
          baseSubtotal: det[i].sub,
          vatAmount: det[i].vat,
          explicit: (l as any).withholdings ?? [],
        })),
      });
      for (let i = 0; i < computed.length; i++) {
        for (const w of computed[i]) {
          if (w.amount > 0) {
            acc.push({
              type: w.type,
              base: r2(w.base),
              amount: r2(w.amount),
              rate: w.rate,
              lineIndex: i,
            });
          }
        }
      }
    } else {
      // 2) Fallback local por línea (solo explícitas)
      dto.lines.forEach((ln, i) => {
        const out = this.computeLineWithholdingsFallback(ln, det[i]);
        for (const w of out) acc.push({ ...w, lineIndex: i });
      });
    }

    // 3) Totales por tipo
    const totals = { RTF: 0, RICA: 0, RIVA: 0 } as Record<
      WithholdingType,
      number
    >;
    for (const w of acc) totals[w.type] += w.amount;
    const withholdingTotal = r2(totals.RTF + totals.RICA + totals.RIVA);

    return { list: acc, totals, withholdingTotal };
  }

  // ================= Listado =================
  async findMany({ q, from, to }: FindManyFilters) {
    const where: Prisma.PurchaseInvoiceWhereInput = {};
    const AND: Prisma.PurchaseInvoiceWhereInput[] = [];

    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) AND.push({ issueDate: { gte: d } });
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
        AND.push({ issueDate: { lt: end } });
      }
    }
    if (q && q.trim()) {
      const term = q.trim();
      const num = Number(term);
      const byNumber: Prisma.PurchaseInvoiceWhereInput = Number.isFinite(num)
        ? { OR: [{ number: num }, { id: num }] }
        : {};
      AND.push({
        OR: [
          byNumber,
          { thirdParty: { name: { contains: term, mode: 'insensitive' } } },
          { thirdParty: { document: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }
    if (AND.length) (where as any).AND = AND;

    // Solo mostrar facturas de compra cuyo tercero tiene el rol PROVIDER
    (where as any).thirdParty = {
      roles: { has: 'PROVIDER' },
    };
    return this.prisma.purchaseInvoice.findMany({
      where,
      include: {
        thirdParty: {
          select: { id: true, name: true, document: true, roles: true },
        },
      },
      orderBy: { issueDate: 'desc' },
    });
  }

  // ================= Detalle =================
  async findOne(id: number) {
    const inv = await this.prisma.purchaseInvoice.findUnique({
      where: { id },
      include: {
        lines: { include: { item: true } },
        withholdings: true, // ← NUEVO: trae retenciones
        ap: { include: { installments: true } },
        paymentAllocations: true,
        thirdParty: true,
      },
    });
    if (!inv) throw new NotFoundException('Factura de compra no encontrada');
    return inv;
  }

  // ================= Crear =================
  async create(dto: CreatePurchaseInvoiceDto) {
    // 👉 Si alguna línea incluye warehouseId, enrutar automáticamente a createWithStock
    if (dto?.lines?.some((l: any) => !!l?.warehouseId)) {
      return this.createWithStock(dto);
    }

    // Validar que el tercero sea proveedor
    const thirdParty = await this.prisma.thirdParty.findUnique({
      where: { id: dto.thirdPartyId },
      select: { roles: true, name: true },
    });
    if (!thirdParty) {
      throw new BadRequestException('Tercero no encontrado');
    }
    if (!thirdParty.roles?.includes('PROVIDER')) {
      throw new BadRequestException(
        `Solo se pueden realizar compras a terceros marcados como proveedores. Tercero: ${thirdParty.name}`,
      );
    }

    if (!dto.lines?.length)
      throw new BadRequestException('Debe incluir al menos una línea');

    // Obtener IVA por ítem para usar como fallback cuando la línea no lo declare
    const itemIds = dto.lines.map((l: any) => l.itemId);
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, ivaPct: true, defaultTaxId: true },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    // Prefetch taxes for any defaultTaxId present
    const taxIds = Array.from(new Set(items.map((it) => it.defaultTaxId).filter((x) => x != null))) as number[]
    const taxes = taxIds.length ? await this.prisma.tax.findMany({ where: { id: { in: taxIds } }, select: { id: true, ratePct: true } }) : []
    const taxById = new Map(taxes.map(t => [t.id, t.ratePct]))

    // Construir líneas temporales con vatPct resuelto (línea -> item -> defaultTax -> 0)
    const linesWithVat = dto.lines.map((l: any) => {
      const it = itemById.get(l.itemId)
      let resolved: number | null = null
      if (l.vatPct != null) resolved = Number(l.vatPct)
      else if (it?.ivaPct != null && Number(it.ivaPct) !== 0) resolved = Number(it.ivaPct)
      else if (it?.defaultTaxId != null) resolved = Number(taxById.get(it.defaultTaxId) ?? 0)
      else resolved = 0
      return { ...l, vatPct: resolved, priceIncludesTax: !!l.priceIncludesTax }
    })

    const { det, subtotal, tax, total } = calcPurchase(linesWithVat as any);
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();

    // ==== NUEVO: calcular breakdown de retenciones antes de persistir ====
    const breakdown = await this.buildPurchaseWithholdings(dto, det);

    const created = await this.prisma.$transaction(async (tx) => {
      const number = dto.number ?? (await this.nextPurchaseNumber(tx));

      const inv = await tx.purchaseInvoice.create({
        data: {
          number,
          thirdPartyId: dto.thirdPartyId,
          issueDate,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          paymentType: dto.paymentType,
          subtotal,
          tax,
          total,
          note: dto.note ?? null,
          // withholdingTotal: breakdown.withholdingTotal as any, // si tu modelo lo tiene
          lines: {
            // ✅ arreglo PLANO de objetos (no [][]):
            create: linesWithVat
              .map((l: any, i: number) => [
                {
                  itemId: l.itemId,
                  qty: l.qty as any,
                  unitCost: l.unitCost as any,
                  vatPct: l.vatPct ?? 0,
                  lineSubtotal: det[i].sub,
                  lineVat: det[i].vat,
                  lineTotal: det[i].tot,
                },
              ])
              .flat(),
          },
        },
      });

      // Obtenemos los ids de líneas (tipado seguro)
      const invLines = await tx.purchaseInvoiceLine.findMany({
        where: { invoiceId: inv.id },
        select: { id: true },
        orderBy: { id: 'asc' }, // coincide con orden de inserción
      });

      // ==== NUEVO: persistir InvoiceWithholding enlazando por factura y línea ====
      if (breakdown.list.length) {
        const rows = breakdown.list.map((w) => {
          const lineTarget = invLines[w.lineIndex];
          if (!lineTarget)
            throw new BadRequestException(
              `Índice de línea inválido para retención (index=${w.lineIndex})`,
            );
          return {
            type: w.type,
            amount: w.amount as any,
            base: w.base as any,
            purchaseInvoice: { connect: { id: inv.id } },
            line: { connect: { id: lineTarget.id } },
          };
        });
        await tx.purchaseInvoice.update({
          where: { id: inv.id },
          data: {
            withholdings: { create: rows as any },
          },
        });
      }

      // CxP: crear sólo si NO es compra en efectivo. Para compras en CASH
      // el posteo contable ya acreditará la cuenta de disponible (tesorería),
      // por lo que no debemos crear una CxP que luego sea pagada y genere
      // un segundo crédito a la misma cuenta.
      let ap: any = null;
      if (dto.paymentType !== PaymentType.CASH) {
        ap = await tx.accountsPayable.create({
          data: {
            thirdPartyId: inv.thirdPartyId,
            invoiceId: inv.id,
            balance: inv.total, // O neto = inv.total - breakdown.withholdingTotal
          },
        });
      }

      // Plan de cuotas (si crédito)
      if (dto.paymentType === PaymentType.CREDIT && dto.creditPlan) {
        const n = dto.creditPlan.installments;
        const freq = dto.creditPlan.frequency;
        const firstDue = dto.creditPlan.firstDueDate
          ? new Date(dto.creditPlan.firstDueDate)
          : addPeriod(issueDate, freq);

        const parts = splitEven(inv.total as any, n);
        for (let i = 0; i < n; i++) {
          await tx.installment.create({
            data: {
              payableId: ap.id,
              number: i + 1,
              dueDate: addPeriods(firstDue, freq, i),
              amount: parts[i],
            },
          });
        }
        await tx.purchaseInvoice.update({
          where: { id: inv.id },
          data: {
            installments: n,
            installmentFrequency: freq,
            firstInstallmentDueDate: firstDue,
          },
        });
      }

      return tx.purchaseInvoice.findUnique({
        where: { id: inv.id },
        include: {
          lines: { include: { item: true } },
          withholdings: true,
          ap: { include: { installments: true } },
          thirdParty: true,
        },
      });
    });

    // 👇 Posteo contable (ya soporta retenciones en A)
    await this.accounting.postPurchaseInvoice(created!.id);

    return created!;
  }

  // ================= Crear CON stock =================
  async createWithStock(dto: CreatePurchaseInvoiceDto) {
    if (!dto.lines?.length)
      throw new BadRequestException('Debe incluir al menos una línea');
    if (!dto.lines.every((l) => !!l.warehouseId && !!l.uom)) {
      throw new BadRequestException(
        'Cada línea debe indicar warehouseId y uom para registrar stock',
      );
    }

    // Validar que el tercero sea proveedor
    const thirdParty = await this.prisma.thirdParty.findUnique({
      where: { id: dto.thirdPartyId },
      select: { roles: true, name: true },
    });
    if (!thirdParty) {
      throw new BadRequestException('Tercero no encontrado');
    }
    if (!thirdParty.roles?.includes('PROVIDER')) {
      throw new BadRequestException(
        `Solo se pueden realizar compras a terceros marcados como proveedores. Tercero: ${thirdParty.name}`,
      );
    }

    // Pre-cálculo (ya soporta IVA incluido/excluido)
    // Usar ivaPct del ítem como fallback cuando la línea no lo indique
    const itemIds = dto.lines.map((l: any) => l.itemId);
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, ivaPct: true, baseUnit: true, unitKind: true, defaultTaxId: true, displayUnit: true },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    const taxIds = Array.from(new Set(items.map((it) => it.defaultTaxId).filter((x) => x != null))) as number[]
    const taxes = taxIds.length ? await this.prisma.tax.findMany({ where: { id: { in: taxIds } }, select: { id: true, ratePct: true } }) : []
    const taxById = new Map(taxes.map(t => [t.id, t.ratePct]))

    const linesWithVat = dto.lines.map((l: any) => {
      const it = itemById.get(l.itemId)
      let resolved: number | null = null
      if (l.vatPct != null) resolved = Number(l.vatPct)
      else if (it?.ivaPct != null && Number(it.ivaPct) !== 0) resolved = Number(it.ivaPct)
      else if (it?.defaultTaxId != null) resolved = Number(taxById.get(it.defaultTaxId) ?? 0)
      else resolved = 0
      return { ...l, vatPct: resolved, priceIncludesTax: !!l.priceIncludesTax }
    })

    const { det, subtotal, tax, total } = calcPurchase(linesWithVat as any);
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();

    // ==== NUEVO: cálculo de retenciones también para este flujo ====
    const breakdown = await this.buildPurchaseWithholdings(dto, det);

    const created = await this.prisma.$transaction(async (tx) => {
      // Cargamos items necesarios para validar UOM y convertir a base
      // (ya cargados arriba en la variable `items`, pero reconsultamos en el tx)
      const items = await tx.item.findMany({
        where: { id: { in: dto.lines.map((l) => l.itemId) } },
        select: { id: true, baseUnit: true, unitKind: true },
      });
      const itemById = new Map(items.map((i) => [i.id, i]));

      // Validaciones por línea + preparación de conversiones
      const prepared = dto.lines.map((l, i) => {
        const it = itemById.get(l.itemId);
        if (!it) throw new BadRequestException(`Ítem ${l.itemId} no existe`);
        if (!l.uom) throw new BadRequestException(`Línea ${i + 1}: falta uom`);
        this.assertSameFamily(it.unitKind, l.uom);

        const qtyBase = convertToBase(Number(l.qty), l.uom, it.baseUnit);
        if (!Number.isFinite(qtyBase) || qtyBase <= 0) {
          throw new BadRequestException(
            `Línea ${i + 1}: cantidad inválida tras conversión`,
          );
        }
        // Resolver vatPct usando linesWithVat
        const lineWithVat = linesWithVat[i];
        return { line: { ...l, vatPct: lineWithVat.vatPct }, det: det[i], item: it, qtyBase, index: i };
      });

      // Crear factura
      const number = dto.number ?? (await this.nextPurchaseNumber(tx));
      const inv = await tx.purchaseInvoice.create({
        data: {
          number,
          thirdPartyId: dto.thirdPartyId,
          issueDate,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          paymentType: dto.paymentType,
          subtotal,
          tax,
          total,
          note: dto.note ?? null,
          // withholdingTotal: breakdown.withholdingTotal as any, // si el modelo lo tiene
          lines: {
            // ✅ arreglo PLANO
            // cast to any because Prisma client types need regeneration after schema change
            create: prepared.map((p) => ({
              itemId: p.line.itemId,
              qty: p.line.qty as any,
              uom: p.line.uom ?? undefined,
              unitCost: p.line.unitCost as any,
              vatPct: p.line.vatPct ?? 0,
              lineSubtotal: p.det.sub,
              lineVat: p.det.vat,
              lineTotal: p.det.tot,
            })) as any,
          },
        },
      });

      // Ids de líneas (orden ascendente = orden de inserción)
      const invLines = await tx.purchaseInvoiceLine.findMany({
        where: { invoiceId: inv.id },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      // ==== NUEVO: persistir retenciones
      if (breakdown.list.length) {
        const rows = breakdown.list.map((w) => {
          const lineTarget = invLines[w.lineIndex];
          if (!lineTarget)
            throw new BadRequestException(
              `Índice de línea inválido para retención (index=${w.lineIndex})`,
            );
          return {
            type: w.type,
            amount: w.amount as any,
            base: w.base as any,
            purchaseInvoice: { connect: { id: inv.id } },
            line: { connect: { id: lineTarget.id } },
          };
        });
        await tx.purchaseInvoice.update({
          where: { id: inv.id },
          data: {
            withholdings: { create: rows as any },
          },
        });
      }

      // CxP: crear sólo si NO es compra en efectivo (ver comentario arriba)
      let ap: any = null;
      if (dto.paymentType !== PaymentType.CASH) {
        ap = await tx.accountsPayable.create({
          data: {
            thirdPartyId: inv.thirdPartyId,
            invoiceId: inv.id,
            balance: inv.total, // O neto = inv.total - breakdown.withholdingTotal
          },
        });
      }

      // Cuotas si es crédito
      if (dto.paymentType === PaymentType.CREDIT && dto.creditPlan) {
        const n = dto.creditPlan.installments;
        const freq = dto.creditPlan.frequency;
        const firstDue = dto.creditPlan.firstDueDate
          ? new Date(dto.creditPlan.firstDueDate)
          : addPeriod(issueDate, freq);

        const parts = splitEven(inv.total as any, n);
        for (let i = 0; i < n; i++) {
          await tx.installment.create({
            data: {
              payableId: ap.id,
              number: i + 1,
              dueDate: addPeriods(firstDue, freq, i),
              amount: parts[i],
            },
          });
        }
        await tx.purchaseInvoice.update({
          where: { id: inv.id },
          data: {
            installments: n,
            installmentFrequency: freq,
            firstInstallmentDueDate: firstDue,
          },
        });
      }

      // ===== Movimientos y capas de stock =====
      for (const p of prepared) {
        const l = p.line;
        const it = p.item;

        // Normalizar unitCost a precio por unidad base del ítem
        // Si el usuario envía unitCost en la UOM de línea (ej. 1 KG = 1500),
        // debemos convertirlo a precio por unidad base (ej. por gramo) porque
        // qty/qtyBase se guarda en la unidad base.
        const rawUnitCost = Number(l.unitCost ?? 0) || 0;
        const factor = convertToBase(1, l.uom as any, it.baseUnit as any);
        const unitCostBase =
          factor > 0 ? r2(rawUnitCost / factor) : rawUnitCost;

        // Movimiento de entrada (usa refType/refId para trazabilidad)
        const baseUom = p.item.baseUnit;
        const move = await tx.stockMove.create({
          data: {
            type: StockMoveType.PURCHASE,
            itemId: l.itemId,
            warehouseId: l.warehouseId!, // viene del DTO
            qty: p.qtyBase as any, // en base del ítem
            uom: baseUom as any,
            unitCost: unitCostBase as any,
            refType: 'PurchaseInvoice',
            refId: inv.id,
            note: `Compra #${inv.number} línea ${p.index + 1}`,
          },
        });

        // Capa asociada al movimiento de entrada
        await tx.stockLayer.create({
          data: {
            itemId: l.itemId,
            warehouseId: l.warehouseId!,
            moveInId: move.id,
            remainingQty: p.qtyBase as any,
            unitCost: unitCostBase as any,
            expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
            lotCode: l.lotCode ?? null,
            productionDate: l.productionDate
              ? new Date(l.productionDate)
              : null,
          },
        });
      }

      // Devolver factura completa
      return tx.purchaseInvoice.findUnique({
        where: { id: inv.id },
        include: {
          lines: { include: { item: true } },
          withholdings: true,
          ap: { include: { installments: true } },
          thirdParty: true,
        },
      });
    });

    // 👇 Posteo contable (ya soporta retenciones en A)
    await this.accounting.postPurchaseInvoice(created!.id);

    return created!;
  }

  // ================= UOM permitidas para un ítem =================
  async getAllowedUomsForItem(itemId: number) {
    const it = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: { unitKind: true },
    });
    if (!it) throw new NotFoundException('Ítem no encontrado');
    const kind = it.unitKind;
    const allowed = ALLOWED_BY_KIND[kind];
    if (!allowed?.length) {
      throw new BadRequestException(
        `No hay UOM configuradas para la familia ${kind}`,
      );
    }
    return allowed;
  }

  // ================= Anular compra =================
  async void(id: number) {
    const wasVoided = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.purchaseInvoice.findUnique({
        where: { id },
        include: {
          lines: true,
          ap: true,
          paymentAllocations: true,
        },
      });
      if (!inv) throw new NotFoundException('Factura de compra no encontrada');
      if (inv.status === PurchaseStatus.VOID) {
        return true; // ya anulada
      }

      // 1) ¿Tiene pagos aplicados? (vía PaymentAllocation)
      const allocCount = await tx.paymentAllocation.count({
        where: { invoiceId: inv.id },
      });
      if (allocCount > 0) {
        throw new ConflictException(
          'No se puede anular: la compra tiene pagos aplicados',
        );
      }

      // 2) Doble seguridad: si existe CxP y balance < total => hubo pagos
      if (inv.ap) {
        const apBalance = Number(inv.ap.balance as any);
        const invTotal = Number(inv.total as any);
        if (apBalance < invTotal) {
          throw new ConflictException(
            'No se puede anular: la compra tiene pagos aplicados (balance de CxP)',
          );
        }
      }

      // 3) Movimientos y capas creados por esta compra (usamos refType/refId)
      const moves = await tx.stockMove.findMany({
        where: {
          refType: 'PurchaseInvoice',
          refId: inv.id,
          type: StockMoveType.PURCHASE,
        },
      });
      const moveIds = moves.map((m) => m.id);
      const layers = await tx.stockLayer.findMany({
        where: { moveInId: { in: moveIds } },
      });

      // 4) Verificar que no haya consumo (remaining < original)
      for (const layer of layers) {
        const moveIn = moves.find((m) => m.id === layer.moveInId);
        if (moveIn) {
          const remaining = Number(layer.remainingQty as any);
          const original = Number(moveIn.qty as any);
          if (remaining < original) {
            throw new ConflictException(
              'No se puede anular: parte del stock ya fue consumida',
            );
          }
        }
      }

      // 5) Borrar capas y movimientos
      if (layers.length) {
        await tx.stockLayer.deleteMany({
          where: { id: { in: layers.map((l) => l.id) } },
        });
      }
      if (moves.length) {
        await tx.stockMove.deleteMany({ where: { id: { in: moveIds } } });
      }

      // 6) Borrar cuotas y CxP (si existe)
      if (inv.ap) {
        await tx.installment.deleteMany({ where: { payableId: inv.ap.id } });
        await tx.accountsPayable.delete({ where: { id: inv.ap.id } });
      }

      // 7) Marcar la factura como VOID
      await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: {
          status: PurchaseStatus.VOID,
          note: `ANULADA ${new Date().toISOString()} - ${inv.note ?? ''}`,
        },
      });

      return false; // fue anulada en este flujo
    });

    // 👇 Reversa contable solo si la acabamos de anular (no si ya estaba VOID)
    if (!wasVoided) {
      await this.accounting.reversePurchaseInvoice(id);
    }

    return { ok: true };
  }
}
