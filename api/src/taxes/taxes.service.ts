// api/src/taxes/taxes.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaxKind, RoundingMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxDto } from './dto/create-tax.dto';
import { UpdateTaxDto } from './dto/update-tax.dto';

type CalcLineInput = {
  // puedes pasar uno u otro; si vienen ambos, se prioriza taxId
  taxId?: number | null;
  ratePct?: number | null;
  // montos
  lineSubtotal: number; // base sin IVA (si included=false) o precio con IVA (si included=true)
  included?: boolean; // true si el precio ya incluye IVA (si no se envía, se usa FiscalSettings.priceIncludesTax)
};

type CalcLineOutput = {
  taxId?: number | null;
  base: number;
  ratePct: number;
  amount: number;
  included: boolean;
};

type CalcInvoiceInput = {
  lines: CalcLineInput[];
};

type CalcInvoiceOutput = {
  taxes: CalcLineOutput[];
  baseTotal: number;
  amountTotal: number;
};

@Injectable()
export class TaxesService {
  constructor(private readonly prisma: PrismaService) {}

  // ----------------- CRUD -----------------
  async create(dto: CreateTaxDto) {
    return this.prisma.tax.create({
      data: {
        code: dto.code,
        name: dto.name,
        kind: dto.kind ?? TaxKind.VAT,
        ratePct: new Prisma.Decimal(dto.ratePct),
        active: dto.active ?? true,
      },
    });
  }

  async findAll(params?: { active?: boolean; kind?: TaxKind }) {
    const { active, kind } = params || {};
    return this.prisma.tax.findMany({
      where: {
        ...(active === undefined ? {} : { active }),
        ...(kind ? { kind } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: number) {
    const tax = await this.prisma.tax.findUnique({ where: { id } });
    if (!tax) throw new NotFoundException(`Tax ${id} no encontrado`);
    return tax;
  }

  async update(id: number, dto: UpdateTaxDto) {
    await this.ensureExists(id);
    return this.prisma.tax.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        kind: dto.kind,
        ratePct:
          dto.ratePct !== undefined
            ? new Prisma.Decimal(dto.ratePct)
            : undefined,
        active: dto.active,
      },
    });
  }

  async remove(id: number) {
    await this.ensureExists(id);
    return this.prisma.tax.delete({ where: { id } });
  }

  private async ensureExists(id: number) {
    const found = await this.prisma.tax.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`Tax ${id} no encontrado`);
  }

  // ----------------- Fiscal defaults (FiscalSettings) -----------------

  private async getFiscalDefaults(): Promise<{
    roundingMode: RoundingMode;
    priceIncludesTax: boolean;
  }> {
    const fs = await this.prisma.fiscalSettings.findFirst({
      orderBy: { id: 'asc' },
      select: { roundingMode: true, priceIncludesTax: true },
    });
    return {
      roundingMode: fs?.roundingMode ?? RoundingMode.HALF_UP,
      priceIncludesTax: fs?.priceIncludesTax ?? false,
    };
  }

  // ----------------- Cálculo IVA -----------------

  /**
   * Helper principal para calcular IVA de una línea con redondeo consistente.
   * - Si `included` es undefined, usa FiscalSettings.priceIncludesTax
   * - Redondeo según FiscalSettings.roundingMode (a 2 decimales)
   */
  async calcLine(input: CalcLineInput): Promise<CalcLineOutput> {
    const { roundingMode, priceIncludesTax } = await this.getFiscalDefaults();
    const included = input.included ?? priceIncludesTax;

    // determinar tasa
    let ratePct = Number(input.ratePct ?? 0);
    let chosenTaxId: number | null | undefined = input.taxId ?? null;

    if (input.taxId != null) {
      const tax = await this.prisma.tax.findUnique({
        where: { id: input.taxId },
      });
      if (!tax) throw new NotFoundException(`Tax ${input.taxId} no encontrado`);
      ratePct = Number(tax.ratePct);
      chosenTaxId = input.taxId;
    }

    // normalización
    const baseValue = Number(input.lineSubtotal ?? 0);
    const r = ratePct > 0 ? ratePct / 100 : 0;

    if (r <= 0) {
      return {
        taxId: chosenTaxId,
        base: round(baseValue, 2, roundingMode),
        ratePct: ratePct, // porcentaje puede conservar su precisión
        amount: 0,
        included,
      };
    }

    if (included) {
      // precio con IVA incluido: base = total / (1 + r), iva = total - base
      const base = baseValue / (1 + r);
      const amount = baseValue - base;
      return {
        taxId: chosenTaxId,
        base: round(base, 2, roundingMode),
        ratePct,
        amount: round(amount, 2, roundingMode),
        included,
      };
    } else {
      // precio sin IVA: iva = base * r
      const amount = baseValue * r;
      return {
        taxId: chosenTaxId,
        base: round(baseValue, 2, roundingMode),
        ratePct,
        amount: round(amount, 2, roundingMode),
        included,
      };
    }
  }

  /**
   * Alias retrocompatible de calcLine.
   */
  async calculateLine(input: CalcLineInput): Promise<CalcLineOutput> {
    return this.calcLine(input);
  }

  /**
   * Calcula IVA consolidado de todas las líneas de una factura.
   * Usa el mismo redondeo de FiscalSettings y `calcLine` para cada línea.
   */
  async calcInvoice(input: CalcInvoiceInput): Promise<CalcInvoiceOutput> {
    const taxes: CalcLineOutput[] = [];
    for (const l of input.lines) {
      taxes.push(await this.calcLine(l));
    }
    const { roundingMode } = await this.getFiscalDefaults();
    const baseTotal = round(
      taxes.reduce((a, t) => a + t.base, 0),
      2,
      roundingMode,
    );
    const amountTotal = round(
      taxes.reduce((a, t) => a + t.amount, 0),
      2,
      roundingMode,
    );
    return { taxes, baseTotal, amountTotal };
  }

  /**
   * Alias retrocompatible de calcInvoice.
   */
  async calculateInvoice(input: CalcInvoiceInput): Promise<CalcInvoiceOutput> {
    return this.calcInvoice(input);
  }
}

// --------- utils locales de redondeo (2 decimales por defecto) ----------
function round(
  value: number,
  decimals = 2,
  mode: RoundingMode = RoundingMode.HALF_UP,
): number {
  const factor = Math.pow(10, decimals);
  const x = value * factor;

  switch (mode) {
    case RoundingMode.TRUNC:
      return Math.trunc(x) / factor;
    case RoundingMode.HALF_EVEN: {
      // Banker's rounding
      const floor = Math.floor(x);
      const diff = x - floor;
      if (diff > 0.5) return (floor + 1) / factor;
      if (diff < 0.5) return floor / factor;
      // exactly .5
      return (floor % 2 === 0 ? floor : floor + 1) / factor;
    }
    case RoundingMode.HALF_UP:
    default:
      return Math.round(x) / factor;
  }
}
