// api/src/sales/sales.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  Prisma,
  InstallmentFrequency,
  PaymentType,
  StockAdjustmentReason,
  StockMoveType,
  Unit,
  ItemType,
  TaxProfile,
  TaxKind,
  RuleScope,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BomService } from '../bom/bom.service';
import { AccountingService } from '../accounting/accounting.service';
import {
  CreateSalesInvoiceDto,
  SalesLineDto,
  WithholdingInputDto,
} from './dto/create-sales-invoice.dto';
import { ListSalesQueryDto } from './dto/list-sales.dto';
import { CreateSalesInvoiceWithStockDto } from './dto/create-sales-invoice-with-stock.dto';
import { CreateSalesInvoiceWithPaymentsDto } from './dto/create-sales-invoice-with-payments.dto';
import { convertToBase } from '../common/units';
import { TreasuryService } from '../treasury/treasury.service';
import { ReceiptRescheduleStrategy } from '../treasury/dto/create-cash-receipt.dto';

// Integración fiscal (opcionales)
import { TaxesService } from '../taxes/taxes.service';
import { WithholdingsService } from '../withholdings/withholdings.service';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const roundQty = (n: number) =>
  Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;

const decimalToNumber = (
  value: Prisma.Decimal | number | string | null | undefined,
): number => {
  if (value == null) return 0;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  const parsed = typeof value === 'string' ? Number(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// ===== Helpers de precio por unidad =====
function unitFactor(fromUom: Unit, toUom: Unit, baseUnit: Unit) {
  const oneFromInBase = convertToBase(1, fromUom, baseUnit);
  const oneToInBase = convertToBase(1, toUom, baseUnit);
  return oneFromInBase / oneToInBase;
}
function convertUnitPrice(
  price: number,
  fromUom: Unit,
  toUom: Unit,
  baseUnit: Unit,
) {
  return r2(price / unitFactor(fromUom, toUom, baseUnit));
}

type CalcDet = { sub: number; vat: number; tot: number };
type CalcResult = {
  det: CalcDet[];
  subtotal: number;
  tax: number;
  total: number;
};

// === Totales con DESCUENTO por línea (SIN retenciones; IVA básico) ===
const calcSales = (lines: NormalizedSalesLine[]): CalcResult => {
  const det: CalcDet[] = lines.map((l) => {
    const qty = Number(l.qty);
    const unit = Number(l.unitPrice);
    const discPct = Math.min(100, Math.max(0, Number(l.discountPct ?? 0))); // <- quitamos paréntesis extra
    const rate = Math.max(0, Number(l.vatPct ?? 0));

    const gross = r2(qty * unit);
    const afterDisc = r2(gross * (1 - discPct / 100));

    if (l.priceIncludesTax) {
      const base = r2(afterDisc / (1 + rate / 100));
      const vat = r2(afterDisc - base);
      const tot = r2(base + vat);
      return { sub: base, vat, tot };
    } else {
      const vat = r2(afterDisc * (rate / 100));
      const tot = r2(afterDisc + vat);
      return { sub: afterDisc, vat, tot };
    }
  });
  const subtotal = r2(det.reduce((a: number, b: CalcDet) => a + b.sub, 0));
  const tax = r2(det.reduce((a: number, b: CalcDet) => a + b.vat, 0));
  const total = r2(det.reduce((a: number, b: CalcDet) => a + b.tot, 0));
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
function splitEven(
  total: Prisma.Decimal | number,
  n: number,
): Prisma.Decimal[] {
  const DecimalCtor = Prisma.Decimal;
  const totalDecimal =
    total instanceof DecimalCtor ? total : new DecimalCtor(total);
  const base = totalDecimal
    .div(n)
    .toDecimalPlaces(2, DecimalCtor.ROUND_HALF_UP);

  const amounts = Array.from({ length: n }, () => new DecimalCtor(base));
  const sum = amounts.reduce(
    (acc, value) => acc.plus(value),
    new DecimalCtor(0),
  );
  const diff = totalDecimal.minus(sum);
  amounts[n - 1] = amounts[n - 1].plus(diff);
  return amounts;
}

type FiscalBreakdown = {
  ivaByRate: { ratePct: number; amount: number }[];
  ivaTotal: number;
  withholdings: {
    type: 'RTF' | 'RIVA' | 'RICA';
    base: number;
    ratePct: number;
    amount: number;
    ruleId?: number | null;
  }[];
  withholdingTotal: number;
};

// ===== Helpers fiscales (resolución de IVA/tax por línea) =====
type LineTaxResolved = {
  taxId?: number;
  vatPct: number; // 0, 5, 19, etc.
  excludeTaxBase?: boolean; // para EXCLUIDO (no acumular base gravada)
};

interface NormalizedSalesLine {
  itemId: number;
  qty: number;
  uom?: Unit;
  unitPrice: number;
  lineTotal?: number;
  taxId?: number | null;
  taxPct?: number;
  vatPct?: number;
  priceIncludesTax: boolean;
  discountPct: number;
  withholdings?: WithholdingInputDto[];
  __excludeTaxBase?: boolean;
  warehouseId?: number;
}

type ItemPricingInfo = Prisma.ItemGetPayload<{
  select: {
    id: true;
    displayUnit: true;
    baseUnit: true;
    price: true;
    priceMax: true;
    priceMin: true;
    costAvg: true;
    ivaPct: true;
  };
}>;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bom: BomService,
    private readonly accounting: AccountingService,
    private readonly treasury: TreasuryService,
    private readonly taxesService: TaxesService,
    private readonly withholdingsService: WithholdingsService,
  ) {}

  // ---------- Resolución de tax por línea ----------
  private async findTaxIdByRate(rate: number): Promise<number | undefined> {
    const t = await this.prisma.tax.findFirst({
      where: { kind: TaxKind.VAT, ratePct: rate },
      select: { id: true },
    });
    return t?.id;
  }

  private mapProfile(profile: TaxProfile | null | undefined) {
    switch (profile) {
      case 'EXENTO':
        return { rate: 0, excludeBase: false as const };
      case 'EXCLUIDO':
        return { rate: 0, excludeBase: true as const };
      case 'IVA_RESPONSABLE':
        return { rate: 19, excludeBase: false as const };
      default:
        return { rate: null as number | null, excludeBase: false as const };
    }
  }

  private async resolveLineTax(opts: {
    line: NormalizedSalesLine;
    item: Prisma.ItemGetPayload<{ include: { category: true } }>;
    third: {
      taxProfile: TaxProfile | null;
      defaultVatId: number | null;
    } | null;
  }): Promise<LineTaxResolved> {
    const { line, item, third } = opts;

    // 0) Overrides por tercero (EXENTO/EXCLUIDO)
    const thirdMap = this.mapProfile(third?.taxProfile);
    if (thirdMap.rate === 0 && third?.taxProfile === 'EXENTO') {
      return { taxId: await this.findTaxIdByRate(0), vatPct: 0 };
    }
    if (thirdMap.rate === 0 && third?.taxProfile === 'EXCLUIDO') {
      return {
        taxId: await this.findTaxIdByRate(0),
        vatPct: 0,
        excludeTaxBase: true,
      };
    }

    // 1) taxId explícito en línea
    if (line.taxId != null) {
      const t = await this.prisma.tax.findUnique({
        where: { id: Number(line.taxId) },
        select: { ratePct: true },
      });
      return {
        taxId: Number(line.taxId),
        vatPct: t ? Number(t.ratePct) : Number(line.vatPct ?? 0) || 0,
      };
    }

    // 2) item.defaultTaxId
    if (item.defaultTaxId != null) {
      const t = await this.prisma.tax.findUnique({
        where: { id: item.defaultTaxId },
        select: { ratePct: true },
      });
      return { taxId: item.defaultTaxId, vatPct: t ? Number(t.ratePct) : 0 };
    }

    // 3) perfil del ítem
    {
      const mp = this.mapProfile(item.taxProfile as TaxProfile | null);
      if (mp.rate !== null) {
        if (item.taxProfile === 'EXCLUIDO') {
          return {
            taxId: await this.findTaxIdByRate(0),
            vatPct: 0,
            excludeTaxBase: true,
          };
        }
        return { taxId: await this.findTaxIdByRate(mp.rate), vatPct: mp.rate };
      }
    }

    // 4) category.defaultTaxId
    if (item.category?.defaultTaxId != null) {
      const t = await this.prisma.tax.findUnique({
        where: { id: item.category.defaultTaxId },
        select: { ratePct: true },
      });
      return {
        taxId: item.category.defaultTaxId,
        vatPct: t ? Number(t.ratePct) : 0,
      };
    }

    // 5) category.taxProfile
    if (item.category?.taxProfile) {
      const mp = this.mapProfile(item.category.taxProfile);
      if (mp.rate !== null) {
        if (item.category.taxProfile === 'EXCLUIDO') {
          return {
            taxId: await this.findTaxIdByRate(0),
            vatPct: 0,
            excludeTaxBase: true,
          };
        }
        return { taxId: await this.findTaxIdByRate(mp.rate), vatPct: mp.rate };
      }
    }

    // 6) tercero por convenio: defaultVatId o taxProfile (si llega aquí ya no es EXENTO/EXCLUIDO)
    if (third?.defaultVatId != null) {
      const t = await this.prisma.tax.findUnique({
        where: { id: third.defaultVatId },
        select: { ratePct: true },
      });
      return { taxId: third.defaultVatId, vatPct: t ? Number(t.ratePct) : 0 };
    }
    if (third?.taxProfile) {
      const mp = this.mapProfile(third.taxProfile);
      if (mp.rate !== null) {
        return { taxId: await this.findTaxIdByRate(mp.rate), vatPct: mp.rate };
      }
    }

    // fallback → 0%
    return { taxId: await this.findTaxIdByRate(0), vatPct: 0 };
  }

  private async attachTaxesToLines(params: {
    lines: NormalizedSalesLine[];
    thirdPartyId: number;
  }): Promise<NormalizedSalesLine[]> {
    const { lines, thirdPartyId } = params;

    const third = await this.prisma.thirdParty.findUnique({
      where: { id: thirdPartyId },
      select: { taxProfile: true, defaultVatId: true },
    });

    const ids = Array.from(new Set(lines.map((l) => l.itemId)));
    const items = await this.prisma.item.findMany({
      where: { id: { in: ids } },
      include: { category: true },
    });
    const byId = new Map(items.map((i) => [i.id, i]));

    return Promise.all(
      lines.map(async (l): Promise<NormalizedSalesLine> => {
        const item = byId.get(l.itemId);
        if (!item)
          throw new NotFoundException(`Ítem no encontrado (${l.itemId})`);

        const resolved = await this.resolveLineTax({ line: l, item, third });

        return {
          ...l,
          vatPct: resolved.vatPct,
          taxId: resolved.taxId ?? null,
          __excludeTaxBase: !!resolved.excludeTaxBase,
        };
      }),
    );
  }

  // ========= Helpers de IVA / retenciones =========
  private consolidateIva(normLines: NormalizedSalesLine[]) {
    const map = new Map<number, number>();
    for (const l of normLines) {
      if (l.__excludeTaxBase) continue; // EXCLUIDO: no acumular base gravada
      const { det } = calcSales([l]);
      const vat = det[0].vat;
      const rate = Math.max(0, Number(l.vatPct ?? 0));
      map.set(rate, r2((map.get(rate) ?? 0) + vat));
    }
    const ivaByRate = Array.from(map.entries()).map(([ratePct, amount]) => ({
      ratePct,
      amount,
    }));
    const ivaTotal = r2(
      ivaByRate.reduce((a: number, b: { amount: number }) => a + b.amount, 0),
    );
    return { ivaByRate, ivaTotal };
  }

  private async calcWithholdingsForInvoice(params: {
    normLines: NormalizedSalesLine[];
    thirdPartyId: number;
  }): Promise<FiscalBreakdown> {
    const { normLines, thirdPartyId } = params;

    // 1) IVA (usamos nuestro consolidado para respetar EXCLUIDO)
    let ivaByRate: FiscalBreakdown['ivaByRate'] = [];
    let ivaTotal = 0;
    try {
      const agg = this.consolidateIva(normLines);
      ivaByRate = agg.ivaByRate;
      ivaTotal = agg.ivaTotal;
    } catch {
      const agg = this.consolidateIva(normLines);
      ivaByRate = agg.ivaByRate;
      ivaTotal = agg.ivaTotal;
    }

    // 2) Retenciones: si EXCLUIDO, la base para reglas estándar debe ser 0
    let withholdings: FiscalBreakdown['withholdings'] = [];

    // explícitas en líneas
    for (const l of normLines) {
      const { det } = calcSales([l]);
      const base = l.__excludeTaxBase ? 0 : det[0].sub;
      const wlist = l.withholdings ?? [];
      for (const w of wlist) {
        const rate = Number(w.ratePct ?? 0);
        const b = w.base != null ? Number(w.base) : base;
        const amount = r2(b * (rate / 100));
        withholdings.push({
          type: w.type,
          base: b,
          ratePct: rate,
          amount,
          ruleId: w.ruleId ?? null,
        });
      }
    }

    // motor de reglas (opcional)
    try {
      if (
        this.withholdingsService &&
        (this.withholdingsService as any).calculateForInvoice
      ) {
        const res = await (this.withholdingsService as any).calculateForInvoice(
          {
            scope: RuleScope.SALES,
            thirdPartyId,
            operationDate: new Date(),
            lines: normLines.map((l) => {
              const { det } = calcSales([l]);
              const base = l.__excludeTaxBase ? 0 : det[0].sub;
              const vatAmount = det[0].vat;
              return {
                base,
                vatAmount,
                thirdPartyId,
              };
            }),
          },
        );
        if (Array.isArray(res?.lines)) {
          const flattened = (res.lines as any[]).flat().filter(Boolean);
          withholdings = flattened.map((w: any) => ({
            type: w.type,
            base: Number(w.base),
            ratePct: w.ratePct == null ? 0 : Number(w.ratePct),
            amount: r2(Number(w.amount)),
            ruleId: w.ruleId ?? null,
          }));
        }
      }
    } catch {
      // si falla, nos quedamos con las explícitas
    }

    const withholdingTotal = r2(
      withholdings.reduce(
        (a: number, b: { amount: number }) => a + b.amount,
        0,
      ),
    );
    return { ivaByRate, ivaTotal, withholdings, withholdingTotal };
  }

  /** Crea/borrra desglose fiscal usando updates anidados (evita usar invoiceId en where) */
  private async persistFiscalBreakdown(
    tx: Prisma.TransactionClient,
    opts: { invoiceId: number; breakdown: FiscalBreakdown; update?: boolean },
  ) {
    const { invoiceId, breakdown, update } = opts;

    // 1) Buscar Tax por tasa (kind = 'VAT')
    const uniqueRates = Array.from(
      new Set(breakdown.ivaByRate.map((x) => Number(x.ratePct))),
    );
    let taxes: any[] = [];
    try {
      taxes = await (tx as any).tax.findMany({
        where: {
          kind: TaxKind.VAT,
          OR: uniqueRates.map((r) => ({ ratePct: r })),
        },
        select: { id: true, ratePct: true },
      });
      if (!taxes.length) {
        const allIva = await (tx as any).tax.findMany({
          where: { kind: TaxKind.VAT },
        });
        taxes = allIva;
      }
    } catch {
      const allIva = await (tx as any).tax.findMany({
        where: { kind: TaxKind.VAT },
      });
      taxes = allIva;
    }
    const rateToTaxId = new Map<number, number>();
    for (const t of taxes) {
      const r = Number(t.ratePct ?? t.pct ?? 0);
      if (uniqueRates.includes(r)) rateToTaxId.set(r, t.id);
    }

    // 2) Inferir base por tasa: base ≈ iva / (tasa/100)
    const baseByRate = new Map<number, number>();
    for (const entry of breakdown.ivaByRate) {
      const r = Number(entry.ratePct);
      const iva = Number(entry.amount);
      const base = r > 0 ? r2(iva / (r / 100)) : 0;
      baseByRate.set(r, (baseByRate.get(r) ?? 0) + base);
    }

    // 3) Payloads
    const taxCreates: any[] = [];
    for (const entry of breakdown.ivaByRate) {
      const r = Number(entry.ratePct);
      const taxId = rateToTaxId.get(r);
      if (!taxId) continue;
      taxCreates.push({
        taxId,
        base: (baseByRate.get(r) ?? 0) as any,
        ratePct: r as any,
        amount: entry.amount as any,
        included: false,
      });
    }
    const whCreates = breakdown.withholdings.map((w) => ({
      type: w.type as any,
      base: w.base as any,
      ratePct: w.ratePct,
      amount: w.amount as any,
      ruleId: w.ruleId ?? null,
    }));

    // 4) Update anidado en SalesInvoice
    await tx.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        ...(update
          ? { taxes: { deleteMany: {} }, withholdings: { deleteMany: {} } }
          : {}),
        ...(taxCreates.length ? { taxes: { create: taxCreates } } : {}),
        ...(whCreates.length ? { withholdings: { create: whCreates } } : {}),
      },
    });
  }

  // ====================================

  async findOne(id: number) {
    const inv = await this.prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        lines: { include: { item: true } },
        thirdParty: true,
        ar: { include: { installments: true } },
        receiptAllocations: {
          include: {
            receipt: {
              include: { method: { select: { id: true, name: true } } },
            },
            installment: true,
          },
        },
        taxes: true,
        withholdings: true,
      },
    });
    if (!inv) throw new NotFoundException('Factura de venta no encontrada');
    return inv;
  }

  async list(qs: ListSalesQueryDto) {
    const toInt = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const toDate = (v: any) => {
      if (!v) return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };

    const pageNum = Math.max(1, toInt((qs as any).page) ?? 1);
    const pageSizeNum = Math.max(
      1,
      Math.min(100, toInt((qs as any).pageSize) ?? 10),
    );

    const q = (qs as any).q as string | undefined;
    const from = toDate((qs as any).from);
    const to = toDate((qs as any).to);
    const thirdPartyId = toInt((qs as any).thirdPartyId);
    const paymentTypeRaw = (qs as any).paymentType as string | undefined;
    const statusRaw = (qs as any).status as string | undefined;
    const sortRaw = (qs as any).sort as string | undefined;
    const orderRaw = (qs as any).order as string | undefined;
    const methodId = toInt((qs as any).methodId);

    const sortField: 'issueDate' | 'number' | 'total' =
      sortRaw === 'number' || (sortRaw as any) === 'total'
        ? (sortRaw as any)
        : 'issueDate';
    const orderDir: 'asc' | 'desc' = orderRaw === 'asc' ? 'asc' : 'desc';

    const where: Prisma.SalesInvoiceWhereInput = {};

    if (from || to) {
      where.issueDate = {};
      if (from) (where.issueDate as any).gte = from;
      if (to) (where.issueDate as any).lte = to;
    }

    if (q) {
      const qNum = Number.isFinite(Number(q)) ? Number(q) : undefined;
      where.OR = [
        ...(qNum ? [{ number: { equals: qNum } }] : []),
        {
          thirdParty: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { document: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    if (typeof thirdPartyId === 'number') where.thirdPartyId = thirdPartyId;
    if (paymentTypeRaw === 'CASH' || paymentTypeRaw === 'CREDIT') {
      where.paymentType = paymentTypeRaw as PaymentType;
    }
    if (statusRaw && (statusRaw === 'ISSUED' || statusRaw === 'VOID')) {
      where.status = statusRaw as any;
    }
    if (typeof methodId === 'number') {
      where.receiptAllocations = { some: { receipt: { methodId } } };
    }

    const skip = (pageNum - 1) * pageSizeNum;
    const take = pageSizeNum;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesInvoice.findMany({
        where,
        include: { thirdParty: true, _count: { select: { lines: true } } },
        orderBy: { [sortField]: orderDir },
        skip,
        take,
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);

    const pages = Math.ceil(total / pageSizeNum) || 1;
    return { items, total, page: pageNum, pageSize: pageSizeNum, pages };
  }

  private async nextSalesNumber(tx: Prisma.TransactionClient) {
    const last = await tx.salesInvoice.findFirst({
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  }

  // ==== Normalización de líneas (garantiza unitPrice:number y qty:number) ====
  private async normalizeLinesWithPrices(
    lines: SalesLineDto[],
  ): Promise<NormalizedSalesLine[]> {
    const ids = Array.from(new Set(lines.map((line) => line.itemId)));
    if (ids.length === 0) return [];

    const items = await this.prisma.item.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        displayUnit: true,
        baseUnit: true,
        price: true,
        priceMax: true,
        priceMin: true,
        costAvg: true,
        ivaPct: true,
      },
    });
    const byId = new Map<number, ItemPricingInfo>(
      items.map((item) => [item.id, item]),
    );

    return lines.map((line) => {
      const item = byId.get(line.itemId);
      if (!item)
        throw new NotFoundException(`Ítem no encontrado (${line.itemId})`);

      const baseUnit = item.baseUnit;
      const displayUnit = item.displayUnit ?? baseUnit;
      if (!baseUnit || !displayUnit) {
        throw new BadRequestException(
          `El ítem ${line.itemId} no tiene unidades configuradas correctamente`,
        );
      }

      const lineUom = line.uom ?? displayUnit;
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new BadRequestException(
          `Cantidad inválida para la línea del ítem ${line.itemId}`,
        );
      }

      const rawDiscount = line.discountPct ?? 0;
      const discountPct = Math.min(100, Math.max(0, Number(rawDiscount)));
      const priceIncludesTax = line.priceIncludesTax ?? false;

      const rawVatPct =
        line.vatPct ?? line.taxPct ?? decimalToNumber(item.ivaPct);
      const vatPct = Math.max(
        0,
        Number.isFinite(rawVatPct) ? Number(rawVatPct) : 0,
      );

      const hasLineTotal =
        typeof line.lineTotal === 'number' && Number.isFinite(line.lineTotal);
      const hasUnitPrice =
        typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice);

      let unitPrice: number;
      if (hasLineTotal) {
        const totalAmount = Number(line.lineTotal);
        const discountFactor = 1 - discountPct / 100;
        const divisor = priceIncludesTax
          ? discountFactor
          : (1 + vatPct / 100) * discountFactor;
        if (divisor <= 0) {
          throw new BadRequestException(
            `No se puede calcular el precio unitario para el ítem ${line.itemId} con los valores enviados`,
          );
        }
        unitPrice = r2(totalAmount / divisor / qty);
      } else if (hasUnitPrice) {
        unitPrice = Number(line.unitPrice);
      } else {
        const fallback = decimalToNumber(item.priceMax ?? item.price);
        unitPrice = convertUnitPrice(fallback, displayUnit, lineUom, baseUnit);
      }

      const priceMin = item.priceMin
        ? convertUnitPrice(
            decimalToNumber(item.priceMin),
            displayUnit,
            lineUom,
            baseUnit,
          )
        : 0;
      const costAvg = item.costAvg
        ? convertUnitPrice(
            decimalToNumber(item.costAvg),
            baseUnit,
            lineUom,
            baseUnit,
          )
        : 0;
      const minAllowed = Math.max(priceMin, costAvg);
      if (unitPrice < minAllowed) {
        throw new BadRequestException(
          `El precio de la línea (ítem ${line.itemId}) ${unitPrice} es menor que el mínimo permitido ${minAllowed} para ${lineUom}.`,
        );
      }

      const { warehouseId } = line as SalesLineDto & { warehouseId?: number };

      const normalizedLine: NormalizedSalesLine = {
        itemId: line.itemId,
        qty,
        uom: lineUom,
        unitPrice,
        lineTotal: line.lineTotal,
        taxId: line.taxId ?? null,
        taxPct: line.taxPct,
        vatPct,
        priceIncludesTax,
        discountPct,
        withholdings: line.withholdings,
        warehouseId,
      };

      return normalizedLine;
    });
  }

  // ===== Crear =====
  async create(dto: CreateSalesInvoiceDto) {
    if (!dto.lines?.length)
      throw new BadRequestException('La factura debe tener líneas');

    const third = await this.prisma.thirdParty.findUnique({
      where: { id: dto.thirdPartyId },
    });
    if (!third) throw new NotFoundException('Tercero no encontrado');

    // 1) Precios normalizados
    const normPrices = await this.normalizeLinesWithPrices(dto.lines);
    // 2) Resolver tax/vat por línea con el orden indicado
    const normLines = await this.attachTaxesToLines({
      lines: normPrices,
      thirdPartyId: dto.thirdPartyId,
    });
    // 3) Totales con redondeo consistente
    const { det, subtotal, total } = calcSales(normLines);

    const fiscal = await this.calcWithholdingsForInvoice({
      normLines,
      thirdPartyId: dto.thirdPartyId,
    });

    const markupPct =
      dto.paymentType === PaymentType.CREDIT && (dto as any).creditMarkupPct
        ? Number((dto as any).creditMarkupPct)
        : 0;

    const adjustedTotal =
      markupPct > 0 ? r2(total * (1 + markupPct / 100)) : total;
    const dp =
      dto.paymentType === PaymentType.CREDIT && (dto as any).creditPlan
        ? Math.max(0, Number((dto as any).creditPlan.downPaymentAmount || 0))
        : 0;

    const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const number = dto.number ?? (await this.nextSalesNumber(tx));

      const inv = await tx.salesInvoice.create({
        data: {
          number,
          thirdPartyId: dto.thirdPartyId,
          issueDate,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          paymentType: dto.paymentType,
          subtotal,
          tax: fiscal.ivaTotal,
          total: adjustedTotal,
          creditMarkupPct: markupPct > 0 ? Math.round(markupPct) : null,
          downPaymentAmount: dp > 0 ? (dp as any) : null,
          note: dto.note ?? null,
          lines: {
            create: normLines.map((l, i) => ({
              itemId: l.itemId,
              qty: l.qty,
              unitPrice: l.unitPrice,
              discountPct: l.discountPct ?? null,
              vatPct: l.vatPct ?? null,
              taxId: l.taxId ?? null,
              // NO persistimos priceIncludesTax (no existe en schema)
              lineSubtotal: det[i].sub,
              lineVat: det[i].vat,
              lineTotal: det[i].tot,
            })),
          },
        },
        include: {
          lines: { include: { item: true } },
          thirdParty: true,
        },
      });

      await this.persistFiscalBreakdown(tx, {
        invoiceId: inv.id,
        breakdown: fiscal,
      });

      const remaining = Math.max(
        0,
        Number(inv.total) - dp - fiscal.withholdingTotal,
      );

      let receivableId: number | null = null;
      if (dto.paymentType === PaymentType.CREDIT) {
        const ar = await tx.accountsReceivable.create({
          data: {
            thirdPartyId: inv.thirdPartyId,
            invoiceId: inv.id,
            balance: remaining as any,
          },
        });
        receivableId = ar.id;
      }

      if (dto.paymentType === PaymentType.CREDIT && (dto as any).creditPlan) {
        const plan = (dto as any).creditPlan;
        const n = Math.max(0, Number(plan.installments || 0));
        const freq = (plan.frequency as InstallmentFrequency) ?? 'MONTHLY';
        const firstDue = plan.firstDueDate
          ? new Date(plan.firstDueDate)
          : addPeriod(issueDate, freq);

        if (remaining > 0 && n > 0) {
          const parts = splitEven(remaining as any, n);
          for (let i = 0; i < n; i++) {
            await tx.installment.create({
              data: {
                receivableId:
                  receivableId ??
                  (
                    await tx.accountsReceivable.findUniqueOrThrow({
                      where: { invoiceId: inv.id },
                    })
                  ).id,
                number: i + 1,
                dueDate: addPeriods(firstDue, freq, i),
                amount: parts[i],
              },
            });
          }

          await tx.salesInvoice.update({
            where: { id: inv.id },
            data: {
              installments: n,
              installmentFrequency: freq,
              firstInstallmentDueDate: firstDue,
            },
          });
        }
      }

      const out = await tx.salesInvoice.findUnique({
        where: { id: inv.id },
        include: {
          lines: { include: { item: true } },
          ar: { include: { installments: true } },
          thirdParty: true,
          taxes: true,
          withholdings: true,
          receiptAllocations: {
            include: {
              receipt: {
                include: { method: { select: { id: true, name: true } } },
              },
              installment: true,
            },
          },
        },
      });
      return out!;
    });

    await this.postInvoiceAccounting(created.id, dto.paymentType);
    return created;
  }

  // ===== FIFO + movimiento =====
  private async consumeFifoAndMove(opts: {
    tx: Prisma.TransactionClient;
    itemId: number;
    warehouseId: number;
    qtyBase: number;
    uomForMove?: Unit;
    refType: string;
    refId: number;
    note?: string;
    allowNegative?: boolean;
  }): Promise<number> {
    const {
      tx,
      itemId,
      warehouseId,
      qtyBase,
      uomForMove,
      refType,
      refId,
      note,
      allowNegative,
    } = opts;
    let remainingQty = roundQty(qtyBase);
    let weightedCostSum = 0;
    let consumed = 0;

    const layers = await tx.stockLayer.findMany({
      where: { itemId, warehouseId, remainingQty: { gt: 0 as any } },
      orderBy: { createdAt: 'asc' },
    });

    for (const layer of layers) {
      if (remainingQty <= 0) break;
      const avail = Number(layer.remainingQty);
      const take = Math.min(avail, remainingQty);
      const cost = Number(layer.unitCost);

      weightedCostSum += take * cost;
      consumed += take;
      remainingQty = roundQty(remainingQty - take);

      await tx.stockLayer.update({
        where: { id: layer.id },
        data: { remainingQty: roundQty(avail - take) as any },
      });
    }

    if (remainingQty > 0 && !allowNegative) {
      throw new BadRequestException(
        `Stock insuficiente al consumir ítem ${itemId} en bodega ${warehouseId}`,
      );
    }

    const moveQty = -roundQty(consumed + (allowNegative ? remainingQty : 0));
    const avgCost = consumed > 0 ? r2(weightedCostSum / consumed) : 0;

    // store move uom as base unit for the item
    const itemRec = await tx.item.findUnique({
      where: { id: itemId },
      select: { baseUnit: true },
    });
    const mvUom = itemRec?.baseUnit ?? uomForMove ?? Unit.UN;
    const mv = await tx.stockMove.create({
      data: {
        type: StockMoveType.SALE,
        itemId,
        warehouseId,
        qty: moveQty as any,
        uom: mvUom,
        unitCost: avgCost as any,
        refType,
        refId,
        note: note ?? undefined,
      },
    });

    return mv.id;
  }

  // ===== Crear con stock + BOM =====
  async createWithStock(
    dto: CreateSalesInvoiceWithStockDto,
    payments?: { methodId: number; amount: number; note?: string }[],
  ) {
    const { thirdPartyId, paymentType, issueDate, dueDate, lines, note } = dto;
    if (!lines?.length)
      throw new BadRequestException('La factura debe tener líneas');

    const third = await this.prisma.thirdParty.findUnique({
      where: { id: thirdPartyId },
    });
    if (!third) throw new NotFoundException('Tercero no encontrado');

    const normPrices = await this.normalizeLinesWithPrices(lines);

    const itemIds = Array.from(new Set(normPrices.map((l) => l.itemId)));
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
    });
    const byId = new Map(items.map((i) => [i.id, i]));

    const productLines = normPrices
      .filter((l) => byId.get(l.itemId)?.type === ItemType.PRODUCT)
      .map((l) => {
        const it = byId.get(l.itemId)!;
        const lineUom = l.uom ?? it.displayUnit;
        return { ...l, uom: lineUom };
      });

    const serviceLines = normPrices.filter(
      (l) => byId.get(l.itemId)?.type === ItemType.SERVICE,
    );
    // (serviceLines no afectan inventario)

    const lineWarehouseIds = productLines
      .map((ln) => ln.warehouseId ?? dto.warehouseId)
      .filter((id): id is number => typeof id === 'number');
    if (
      productLines.length &&
      lineWarehouseIds.length !== productLines.length
    ) {
      throw new BadRequestException(
        'Cada línea de PRODUCTO debe indicar warehouseId o definir uno por defecto en la factura',
      );
    }
    const uniqueWhIds = Array.from(new Set(lineWarehouseIds));
    if (uniqueWhIds.length) {
      const whList = await this.prisma.warehouse.findMany({
        where: { id: { in: uniqueWhIds } },
      });
      const foundIds = new Set(whList.map((w) => w.id));
      for (const wid of uniqueWhIds) {
        if (!foundIds.has(wid))
          throw new NotFoundException(`Bodega no encontrada (id=${wid})`);
      }
    }

    // Planeación en base
    type PerWh = Map<number, number>;
    const byWh: Map<number, PerWh> = new Map();
    for (const ln of productLines) {
      const whSource = ln.warehouseId ?? dto.warehouseId;
      const whId = Number(whSource);
      const it = byId.get(ln.itemId)!;
      const qtyBase = convertToBase(Number(ln.qty), ln.uom, it.baseUnit);
      const map = byWh.get(whId) ?? new Map<number, number>();
      map.set(ln.itemId, (map.get(ln.itemId) ?? 0) + qtyBase);
      byWh.set(whId, map);
    }

    const plannedPreparedUse: Map<string, number> = new Map();
    const leftoversPerWh: Map<number, { itemId: number; qty: number }[]> =
      new Map();

    for (const [whId, itemsMap] of byWh.entries()) {
      const leftovers: { itemId: number; qty: number }[] = [];
      for (const [itemId, qtyBase] of itemsMap.entries()) {
        const agg = await this.prisma.stockLayer.aggregate({
          _sum: { remainingQty: true },
          where: { itemId, warehouseId: whId, remainingQty: { gt: 0 } },
        });
        const available = Number(agg._sum.remainingQty ?? 0);
        const takeFromProduct = Math.min(available, qtyBase);
        const rem = roundQty(qtyBase - takeFromProduct);
        plannedPreparedUse.set(`${whId}:${itemId}`, takeFromProduct);
        if (rem > 0) leftovers.push({ itemId, qty: rem });
      }
      leftoversPerWh.set(whId, leftovers);
    }

    // Explosión BOM
    const leavesByWh: Map<number, { itemId: number; qty: number }[]> =
      new Map();
    for (const [whId, remainder] of leftoversPerWh.entries()) {
      if (!remainder.length) {
        leavesByWh.set(whId, []);
        continue;
      }
      const exploded = await this.bom.explodeRequirements({
        items: remainder,
        warehouseId: undefined,
      });
      leavesByWh.set(
        whId,
        (exploded.leaves ?? []).map((l: any) => ({
          itemId: l.itemId,
          qty: Number(l.qtyBase ?? l.qty ?? 0),
        })),
      );
    }

    // Resolver IVA/tax por línea antes de totales
    const normLines = await this.attachTaxesToLines({
      lines: normPrices,
      thirdPartyId,
    });

    const { det, subtotal, total } = calcSales(normLines);
    const fiscal = await this.calcWithholdingsForInvoice({
      normLines,
      thirdPartyId,
    });

    const markupPct =
      paymentType === PaymentType.CREDIT && (dto as any).creditMarkupPct
        ? Number((dto as any).creditMarkupPct)
        : 0;
    const adjustedTotal =
      markupPct > 0 ? r2(total * (1 + markupPct / 100)) : total;
    const dp =
      paymentType === PaymentType.CREDIT && (dto as any).creditPlan
        ? Math.max(0, Number((dto as any).creditPlan.downPaymentAmount || 0))
        : 0;

    const saleMoveIds: number[] = [];

    const created = await this.prisma.$transaction(async (tx) => {
      const number = await this.nextSalesNumber(tx);

      const inv = await tx.salesInvoice.create({
        data: {
          number,
          thirdPartyId,
          issueDate: issueDate ? new Date(issueDate) : new Date(),
          dueDate: dueDate ? new Date(dueDate) : null,
          paymentType,
          subtotal,
          tax: fiscal.ivaTotal,
          total: adjustedTotal,
          creditMarkupPct: markupPct > 0 ? Math.round(markupPct) : null,
          downPaymentAmount: dp > 0 ? (dp as any) : null,
          note: note ?? null,
          lines: {
            // cast to any because Prisma client types need regeneration after schema change
            create: normLines.map((l, i) => ({
              itemId: l.itemId,
              qty: l.qty,
              uom: l.uom ?? undefined,
              unitPrice: l.unitPrice,
              discountPct: l.discountPct ?? null,
              vatPct: l.vatPct ?? null,
              taxId: l.taxId ?? null,
              lineSubtotal: det[i].sub,
              lineVat: det[i].vat,
              lineTotal: det[i].tot,
            })) as any,
          },
        },
        include: { lines: true },
      });

      await this.persistFiscalBreakdown(tx, {
        invoiceId: inv.id,
        breakdown: fiscal,
      });

      const remaining = Math.max(
        0,
        Number(inv.total) - dp - fiscal.withholdingTotal,
      );
      let receivableId: number | null = null;
      if (paymentType === PaymentType.CREDIT) {
        const ar = await tx.accountsReceivable.create({
          data: {
            thirdPartyId: inv.thirdPartyId,
            invoiceId: inv.id,
            balance: remaining as any,
          },
        });
        receivableId = ar.id;
      }

      if (paymentType === PaymentType.CREDIT && (dto as any).creditPlan) {
        const plan = (dto as any).creditPlan;
        const n = Math.max(0, Number(plan.installments || 0));
        const freq = (plan.frequency as InstallmentFrequency) ?? 'MONTHLY';
        const issue = inv.issueDate;
        const firstDue = plan.firstDueDate
          ? new Date(plan.firstDueDate)
          : addPeriod(issue, freq);

        if (remaining > 0 && n > 0) {
          const parts = splitEven(remaining as any, n);
          const arId =
            receivableId ??
            (
              await tx.accountsReceivable.findUniqueOrThrow({
                where: { invoiceId: inv.id },
              })
            ).id;
          for (let i = 0; i < n; i++) {
            await tx.installment.create({
              data: {
                receivableId: arId,
                number: i + 1,
                dueDate: addPeriods(firstDue, freq, i),
                amount: parts[i],
              },
            });
          }

          await tx.salesInvoice.update({
            where: { id: inv.id },
            data: {
              installments: n,
              installmentFrequency: freq,
              firstInstallmentDueDate: firstDue,
            },
          });
        } else {
          await tx.salesInvoice.update({
            where: { id: inv.id },
            data: {
              installments: null,
              installmentFrequency: null,
              firstInstallmentDueDate: null,
            },
          });
        }
      }

      // Movimientos de inventario
      for (const ln of productLines) {
        const whSource = ln.warehouseId ?? dto.warehouseId;
        const whId = Number(whSource);
        const key = `${whId}:${ln.itemId}`;
        const takeBase = plannedPreparedUse.get(key) ?? 0;
        if (takeBase > 0) {
          const item = byId.get(ln.itemId)!;
          const mvId = await this.consumeFifoAndMove({
            tx,
            itemId: ln.itemId,
            warehouseId: whId,
            qtyBase: takeBase,
            uomForMove: item.displayUnit,
            refType: 'SalesInvoice',
            refId: inv.id,
            note: `Venta #${inv.number} (producto preparado)`,
            allowNegative: false,
          });
          saleMoveIds.push(mvId);
        }
      }
      for (const [whId, leaves] of leavesByWh.entries()) {
        for (const leaf of leaves) {
          const it = byId.get(leaf.itemId);
          const mvId = await this.consumeFifoAndMove({
            tx,
            itemId: leaf.itemId,
            warehouseId: Number(whId),
            qtyBase: leaf.qty,
            uomForMove: it?.displayUnit ?? Unit.UN,
            refType: 'SalesInvoice',
            refId: inv.id,
            note: `Venta #${inv.number} (componentes BOM)`,
            allowNegative: true,
          });
          saleMoveIds.push(mvId);
        }
      }

      const out = await tx.salesInvoice.findUnique({
        where: { id: inv.id },
        include: {
          lines: { include: { item: true } },
          ar: { include: { installments: true } },
          thirdParty: true,
          taxes: true,
          withholdings: true,
        },
      });

      (out as any).__saleMoveIds = saleMoveIds;
      return out!;
    });

    await this.postInvoiceAccounting(
      created.id,
      paymentType,
      payments?.map((p) => ({
        methodId: p.methodId,
        amount: Number(p.amount),
        note: p.note,
      })),
    );

    const ids: number[] = (created as any).__saleMoveIds ?? [];
    for (const id of ids) {
      await this.accounting.postStockMove(id);
    }

    return created;
  }

  private async postInvoiceAccounting(
    invoiceId: number,
    paymentType: PaymentType,
    payments?: { methodId?: number | null; amount: number; note?: string }[],
  ) {
    if (paymentType === PaymentType.CREDIT) {
      await this.accounting.postSalesInvoice(invoiceId);
      return;
    }

    await this.accounting.postCashSale(
      invoiceId,
      (payments ?? []).map((p) => ({
        methodId: p.methodId ?? null,
        amount: Number(p.amount ?? 0),
        note: p.note,
      })),
    );
  }

  // ===== Crear con pagos =====
  async createWithPayments(
    dto: CreateSalesInvoiceWithPaymentsDto,
    userId?: number,
  ) {
    const inv = await this.createWithStock(dto, dto.payments);

    const pays = dto.payments ?? [];
    if (pays.length) {
      const sum = pays.reduce((a, p) => a + Number(p.amount || 0), 0);
      const total = Number(inv.total || 0);
      const withholdingTotal = Number((inv as any).withholdingTotal ?? 0);
      const isCash = inv.paymentType === PaymentType.CASH;

      const expectedCash = Math.max(0, total - withholdingTotal);

      if (isCash && Math.round(sum * 100) !== Math.round(expectedCash * 100)) {
        throw new BadRequestException(
          `En ventas de CONTADO la suma de pagos (${sum}) debe ser igual al neto a cobrar (${expectedCash}).`,
        );
      }
      if (!isCash && sum > total) {
        throw new BadRequestException(
          `En ventas a CRÉDITO la suma de pagos (${sum}) no puede exceder el total (${total}).`,
        );
      }
    }

    for (const p of pays) {
      if (!p.thirdPartyId || !p.methodId || !p.amount || p.amount <= 0) {
        throw new BadRequestException(
          'Cada pago requiere thirdPartyId, methodId y amount > 0',
        );
      }
      const pm = await this.prisma.paymentMethod.findUnique({
        where: { id: p.methodId },
        select: { id: true, active: true },
      });
      if (!pm)
        throw new NotFoundException(
          `Método de pago no encontrado (id=${p.methodId})`,
        );
      if (!pm.active)
        throw new BadRequestException(
          `El método de pago (id=${p.methodId}) está inactivo`,
        );
    }

    if (pays.length) {
      const applyToReceivable = inv.paymentType === PaymentType.CREDIT;
      const postAccountingReceipt = inv.paymentType === PaymentType.CREDIT;
      for (const p of pays) {
        await this.treasury.createReceipt({
          thirdPartyId: p.thirdPartyId,
          methodId: p.methodId,
          total: Number(p.amount),
          date: dto.issueDate,
          note: p.note,
          allocations: [
            {
              invoiceId: inv.id,
              amount: Number(p.amount),
            },
          ],
          reschedule: ReceiptRescheduleStrategy.KEEP,
          userId: userId ?? 0,
          applyToReceivable,
          postAccounting: postAccountingReceipt,
        });
      }
    }

    return this.prisma.salesInvoice.findUnique({
      where: { id: inv.id },
      include: {
        lines: { include: { item: true } },
        ar: { include: { installments: true } },
        thirdParty: true,
        taxes: true,
        withholdings: true,
        receiptAllocations: {
          include: {
            receipt: {
              include: { method: { select: { id: true, name: true } } },
            },
            installment: true,
          },
        },
      },
    });
  }

  // ===== Editar =====
  async update(id: number, dto: CreateSalesInvoiceDto) {
    const current = await this.prisma.salesInvoice.findUnique({
      where: { id },
      include: { ar: { include: { installments: true } }, lines: true },
    });
    if (!current) throw new NotFoundException('Factura de venta no encontrada');
    if (!dto.lines?.length)
      throw new BadRequestException('La factura debe tener líneas');

    const normPrices = await this.normalizeLinesWithPrices(dto.lines);
    const normLines = await this.attachTaxesToLines({
      lines: normPrices,
      thirdPartyId: dto.thirdPartyId,
    });

    const { det, subtotal, total } = calcSales(normLines);
    const fiscal = await this.calcWithholdingsForInvoice({
      normLines,
      thirdPartyId: dto.thirdPartyId,
    });

    const markupPct =
      dto.paymentType === PaymentType.CREDIT && (dto as any).creditMarkupPct
        ? Number((dto as any).creditMarkupPct)
        : 0;
    const adjustedTotal =
      markupPct > 0 ? r2(total * (1 + markupPct / 100)) : total;

    const dp =
      dto.paymentType === PaymentType.CREDIT && (dto as any).creditPlan
        ? Math.max(0, Number((dto as any).creditPlan.downPaymentAmount || 0))
        : 0;

    type ARWithInst = Prisma.AccountsReceivableGetPayload<{
      include: { installments: true };
    }>;
    let ar: ARWithInst | null = (current.ar as ARWithInst) || null;

    return this.prisma.$transaction(async (tx) => {
      await tx.salesInvoice.update({
        where: { id },
        data: {
          thirdPartyId: dto.thirdPartyId,
          issueDate: dto.issueDate
            ? new Date(dto.issueDate)
            : current.issueDate,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          paymentType: dto.paymentType,
          subtotal,
          tax: fiscal.ivaTotal,
          total: adjustedTotal,
          creditMarkupPct: markupPct > 0 ? Math.round(markupPct) : null,
          downPaymentAmount: dp > 0 ? (dp as any) : null,
          note: dto.note ?? null,
        },
      });

      await tx.salesInvoiceLine.deleteMany({ where: { invoiceId: id } });
      for (let i = 0; i < normLines.length; i++) {
        const l = normLines[i];
        await tx.salesInvoiceLine.create({
          // cast to any because Prisma client types need regeneration after schema change
          data: {
            invoiceId: id,
            itemId: l.itemId,
            qty: l.qty,
            uom: l.uom ?? undefined,
            unitPrice: l.unitPrice,
            discountPct: l.discountPct ?? null,
            vatPct: l.vatPct ?? null,
            taxId: l.taxId ?? null,
            // NO persistimos priceIncludesTax
            lineSubtotal: det[i].sub,
            lineVat: det[i].vat,
            lineTotal: det[i].tot,
          } as any,
        });
      }

      await this.persistFiscalBreakdown(tx, {
        invoiceId: id,
        breakdown: fiscal,
        update: true,
      });

      if (!ar) {
        ar = await tx.accountsReceivable.create({
          data: {
            thirdPartyId: dto.thirdPartyId,
            invoiceId: id,
            balance: 0 as any,
          },
          include: { installments: true },
        });
      }
      if (!ar) throw new Error('No se pudo crear la cuenta por cobrar');

      const remaining = Math.max(
        0,
        adjustedTotal - dp - fiscal.withholdingTotal,
      );
      await tx.accountsReceivable.update({
        where: { id: ar.id },
        data: { thirdPartyId: dto.thirdPartyId, balance: remaining as any },
      });
      await tx.installment.deleteMany({ where: { receivableId: ar.id } });

      if (dto.paymentType === PaymentType.CREDIT && (dto as any).creditPlan) {
        const plan = (dto as any).creditPlan;
        const n = Math.max(0, Number(plan.installments || 0));
        const freq = (plan.frequency as InstallmentFrequency) ?? 'MONTHLY';
        const firstDue = plan.firstDueDate
          ? new Date(plan.firstDueDate)
          : addPeriod(current.issueDate, freq);

        if (remaining > 0 && n > 0) {
          const parts = splitEven(remaining as any, n);
          for (let i = 0; i < n; i++) {
            await tx.installment.create({
              data: {
                receivableId: ar.id,
                number: i + 1,
                dueDate: addPeriods(firstDue, freq, i),
                amount: parts[i],
              },
            });
          }

          await tx.salesInvoice.update({
            where: { id },
            data: {
              installments: n,
              installmentFrequency: freq,
              firstInstallmentDueDate: firstDue,
            },
          });
        } else {
          await tx.salesInvoice.update({
            where: { id },
            data: {
              installments: null,
              installmentFrequency: null,
              firstInstallmentDueDate: null,
            },
          });
        }
      } else {
        await tx.salesInvoice.update({
          where: { id },
          data: {
            installments: null,
            installmentFrequency: null,
            firstInstallmentDueDate: null,
          },
        });
      }

      return this.prisma.salesInvoice.findUnique({
        where: { id },
        include: {
          lines: { include: { item: true } },
          ar: { include: { installments: true } },
          thirdParty: true,
          taxes: true,
          withholdings: true,
        },
      });
    });
  }

  // ===== Anular =====
  async void(id: number, reason?: string) {
    const adjustMoveIds: number[] = [];

    const out = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.salesInvoice.findUnique({
        where: { id },
        include: { ar: { include: { installments: true } } },
      });
      if (!inv) throw new NotFoundException('Factura de venta no encontrada');
      if ((inv as any).status === 'VOID') {
        throw new BadRequestException('La factura ya está anulada');
      }

      const hasPaid = !!inv.ar?.installments?.some(
        (c) =>
          c.status === 'PAID' ||
          c.status === 'PARTIALLY_PAID' ||
          Number(c.paidAmount ?? 0) > 0,
      );
      if (hasPaid)
        throw new BadRequestException(
          'No se puede anular: existen pagos registrados',
        );

      const saleMoves = await tx.stockMove.findMany({
        where: {
          refType: 'SalesInvoice',
          refId: inv.id,
          type: StockMoveType.SALE,
          qty: { lt: 0 as any },
        },
      });

      for (const mv of saleMoves) {
        const qtyAbs = Math.abs(Number(mv.qty || 0));
        if (qtyAbs <= 0) continue;

        await tx.stockLayer.create({
          data: {
            itemId: mv.itemId,
            warehouseId: mv.warehouseId,
            unitCost: mv.unitCost as any,
            remainingQty: qtyAbs as any,
          },
        });

        const adjustMove = await tx.stockMove.create({
          data: {
            type: StockMoveType.ADJUSTMENT,
            itemId: mv.itemId,
            warehouseId: mv.warehouseId,
            qty: qtyAbs as any,
            uom: mv.uom,
            unitCost: mv.unitCost as any,
            refType: 'SalesInvoice',
            refId: inv.id,
            note: `Anulación de venta #${inv.number}${reason ? ` · ${reason}` : ''}`,
            adjustmentReason: StockAdjustmentReason.CUSTOMER_RETURN,
          },
        });
        adjustMoveIds.push(adjustMove.id);
      }

      if (inv.ar) {
        await tx.installment.updateMany({
          where: { receivableId: inv.ar.id },
          data: { status: 'CANCELED' as any },
        });
        await tx.accountsReceivable.update({
          where: { id: inv.ar.id },
          data: { balance: 0 as any },
        });
      }

      // Borrar desgloses fiscales anidados
      await tx.salesInvoice.update({
        where: { id: inv.id },
        data: {
          taxes: { deleteMany: {} },
          withholdings: { deleteMany: {} },
          status: 'VOID' as any,
        },
      });

      const refreshed = await tx.salesInvoice.findUnique({
        where: { id: inv.id },
        include: {
          lines: { include: { item: true } },
          ar: { include: { installments: true } },
          thirdParty: true,
          taxes: true,
          withholdings: true,
        },
      });
      (refreshed as any).__adjustMoveIds = adjustMoveIds;
      return refreshed!;
    });

    await this.accounting.reverseSalesInvoice(out.id);

    const ids: number[] = (out as any).__adjustMoveIds ?? [];
    for (const id2 of ids) {
      await this.accounting.postStockMove(id2);
    }

    return out;
  }

  // ===== Postear =====
  async postSalesInvoice(id: number) {
    await this.accounting.postSalesInvoice(id);
    const saleMoves = await this.prisma.stockMove.findMany({
      where: { refType: 'SalesInvoice', refId: id, type: StockMoveType.SALE },
    });
    for (const mv of saleMoves) {
      await this.accounting.postStockMove(mv.id);
    }
    return this.findOne(id);
  }
}
