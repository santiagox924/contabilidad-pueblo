// api/src/withholdings/withholdings.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RuleScope, WithholdingType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWithholdingRuleDto } from './dto/create-withholding-rule.dto';
import { UpdateWithholdingRuleDto } from './dto/update-withholding-rule.dto';

/** Info mínima del tercero que afecta la aplicación de reglas */
export type PartnerFiscal = {
  id?: number;
  isWithholdingAgent?: boolean | null;
  ciiuCode?: string | null;
  municipalityCode?: string | null;
  departmentCode?: string | null;
};

/**
 * Para líneas dentro de factura permitimos omitir `scope`
 * (se hereda del scope raíz). Para el endpoint calc-line
 * sí exigimos `scope` (el método lo tipa con intersección).
 */
export type CalcLineInput = {
  base: number; // base gravable (RTF/RICA)
  vatAmount?: number; // IVA de la línea (base de RIVA)
  type?: WithholdingType; // filtrar por tipo específico
  scope?: RuleScope; // puede omitirse en factura
  thirdParty?: PartnerFiscal; // perfil fiscal contraparte
  thirdPartyId?: number; // fallback para resolver perfil
  operationDate?: Date | string; // fecha del documento
};

export type CalcLineOutput = {
  type: WithholdingType;
  ruleId?: number | null;
  base: number;
  ratePct?: number | null;
  amount: number;
  segmentId?: number | null;
};

export type CalcInvoiceInput = {
  scope: RuleScope;
  thirdParty?: PartnerFiscal;
  thirdPartyId?: number;
  operationDate?: Date | string;
  lines: CalcLineInput[]; // cada línea puede omitir scope/thirdParty
};

export type CalcInvoiceOutput = {
  lines: CalcLineOutput[][];
  totalsByType: Record<WithholdingType, number>;
  total: number;
};

@Injectable()
export class WithholdingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ----------------- CRUD Reglas -----------------
  async createRule(dto: CreateWithholdingRuleDto) {
    return this.prisma.withholdingRule.create({
      data: {
        type: dto.type,
        scope: dto.scope ?? RuleScope.BOTH,
        ratePct:
          dto.fixedAmount != null
            ? new Prisma.Decimal(0)
            : new Prisma.Decimal(dto.ratePct ?? 0),
        minBase: dto.minBase != null ? new Prisma.Decimal(dto.minBase) : null,
        fixedAmount:
          dto.fixedAmount != null ? new Prisma.Decimal(dto.fixedAmount) : null,
        ciiuCode: dto.ciiuCode ?? null,
        municipalityCode: dto.municipalityCode ?? null,
        onlyForAgents: !!dto.onlyForAgents,
        active: dto.active ?? true,
      },
    });
  }

  async findRules(params?: {
    active?: boolean;
    scope?: RuleScope;
    type?: WithholdingType;
  }) {
    const { active, scope, type } = params || {};
    return this.prisma.withholdingRule.findMany({
      where: {
        ...(active === undefined ? {} : { active }),
        ...(type ? { type } : {}),
        // BOTH también aplica
        ...(scope ? { OR: [{ scope }, { scope: RuleScope.BOTH }] } : {}),
      },
      orderBy: [{ type: 'asc' }, { id: 'asc' }],
    });
  }

  async findRule(id: number) {
    const rule = await this.prisma.withholdingRule.findUnique({
      where: { id },
    });
    if (!rule)
      throw new NotFoundException(`WithholdingRule ${id} no encontrada`);
    return rule;
  }

  async updateRule(id: number, dto: UpdateWithholdingRuleDto) {
    await this.ensureRule(id);
    return this.prisma.withholdingRule.update({
      where: { id },
      data: {
        type: dto.type,
        scope: dto.scope,
        ratePct:
          dto.ratePct !== undefined
            ? new Prisma.Decimal(dto.ratePct)
            : undefined,
        minBase:
          dto.minBase !== undefined
            ? dto.minBase == null
              ? null
              : new Prisma.Decimal(dto.minBase)
            : undefined,
        fixedAmount:
          dto.fixedAmount !== undefined
            ? dto.fixedAmount == null
              ? null
              : new Prisma.Decimal(dto.fixedAmount)
            : undefined,
        ciiuCode: dto.ciiuCode,
        municipalityCode: dto.municipalityCode,
        onlyForAgents: dto.onlyForAgents,
        active: dto.active,
      },
    });
  }

  async removeRule(id: number) {
    await this.ensureRule(id);
    return this.prisma.withholdingRule.delete({ where: { id } });
  }

  private async ensureRule(id: number) {
    const found = await this.prisma.withholdingRule.findUnique({
      where: { id },
    });
    if (!found)
      throw new NotFoundException(`WithholdingRule ${id} no encontrada`);
  }

  // ----------------- Resolución de reglas y cálculo -----------------
  /**
   * Obtiene las reglas aplicables según scope, tipo (opcional) y perfil del tercero.
   * Soporta reglas ICA (RICA) por municipio y CIIU.
   */
  async resolveRules(params: {
    scope: RuleScope;
    thirdParty?: PartnerFiscal;
    type?: WithholdingType;
  }) {
    const { scope, thirdParty, type } = params;
    const all = (await this.prisma.withholdingRule.findMany({
      where: {
        active: true,
        OR: [{ scope }, { scope: RuleScope.BOTH }],
        ...(type ? { type } : {}),
      },
      include: { segments: true } as any,
    })) as Array<any>;

    return all.filter((r) => {
      if (r.onlyForAgents && !thirdParty?.isWithholdingAgent) return false;
      if (r.ciiuCode && r.ciiuCode !== (thirdParty?.ciiuCode ?? null))
        return false;
      if (
        r.municipalityCode &&
        r.municipalityCode !== (thirdParty?.municipalityCode ?? null)
      )
        return false;
      return true;
    });
  }

  /**
   * Calcula retenciones para una línea. Devuelve una lista porque pueden aplicar varias.
   * Nota: aquí `scope` es obligatorio (en el tipo, vía intersección).
   *
   * - RIVA   => base = vatAmount
   * - RTF/RICA=> base = base
   * - Respeta minBase, fixedAmount o ratePct% (por regla)
   */
  async calculateForLine(
    input: CalcLineInput & { scope: RuleScope },
  ): Promise<CalcLineOutput[]> {
    const scope = input.scope;
    const profile = await this.resolveThirdPartyProfile(
      input.thirdParty,
      input.thirdPartyId,
    );
    const operationDate = this.normalizeDate(input.operationDate);
    const rules = await this.resolveRules({
      scope,
      thirdParty: profile,
      type: input.type,
    });

    const baseForRF_RICA = toNumber(input.base);
    const baseForRIVA = toNumber(input.vatAmount ?? 0);

    const outputs: CalcLineOutput[] = [];
    for (const r of rules) {
      const base =
        r.type === WithholdingType.RIVA ? baseForRIVA : baseForRF_RICA;
      if (base <= 0) continue;

      const segment = this.pickSegment({
        rule: r,
        segments: (r.segments ?? []) as any[],
        profile,
        base,
        operationDate,
      });

      const minBaseRule = r.minBase != null ? toNumber(r.minBase) : null;
      const applicableMinBase =
        segment?.minBase != null ? toNumber(segment.minBase) : minBaseRule;
      if (applicableMinBase != null && base < applicableMinBase) continue;
      const maxBaseSegment =
        segment?.maxBase != null ? toNumber(segment.maxBase) : null;
      if (maxBaseSegment != null && base > maxBaseSegment) continue;

      let amount = 0;
      let ratePct: number | null = null;

      if (segment && segment.fixedAmount != null) {
        amount = toNumber(segment.fixedAmount);
      } else if (segment && segment.ratePct != null) {
        ratePct = toNumber(segment.ratePct);
        amount = round2((base * ratePct) / 100);
      } else if (r.fixedAmount != null) {
        amount = toNumber(r.fixedAmount);
      } else {
        ratePct = toNumber(r.ratePct);
        amount = round2((base * ratePct) / 100);
      }

      if (amount <= 0) continue;

      outputs.push({
        type: r.type,
        ruleId: r.id,
        base: round2(base),
        ratePct,
        amount: round2(amount),
        segmentId: segment?.id ?? null,
      });
    }
    return outputs;
  }

  /**
   * Calcula retenciones de toda la factura. Si una línea no trae scope/thirdParty,
   * se hereda del input raíz. Devuelve desglose por línea y totales por tipo.
   */
  async calculateForInvoice(
    input: CalcInvoiceInput,
  ): Promise<CalcInvoiceOutput> {
    const results: CalcLineOutput[][] = [];
    const totalsByType: Record<WithholdingType, number> = {
      RTF: 0,
      RIVA: 0,
      RICA: 0,
    };
    const headerThirdParty = await this.resolveThirdPartyProfile(
      input.thirdParty,
      input.thirdPartyId,
    );

    for (const ln of input.lines) {
      const lineProfile = ln.thirdParty
        ? this.normalizeProfile(ln.thirdParty)
        : headerThirdParty;
      const opDate = this.normalizeDate(
        ln.operationDate ?? input.operationDate,
      );
      const lineRes = await this.calculateForLine({
        scope: ln.scope ?? input.scope,
        thirdParty: lineProfile,
        thirdPartyId: ln.thirdPartyId ?? input.thirdPartyId,
        operationDate: opDate,
        base: ln.base,
        vatAmount: ln.vatAmount,
        type: ln.type,
      });
      results.push(lineRes);
      for (const r of lineRes) {
        totalsByType[r.type] = round2(totalsByType[r.type] + r.amount);
      }
    }

    const total = round2(
      Object.values(totalsByType).reduce((a, b) => a + b, 0),
    );
    return { lines: results, totalsByType, total };
  }

  /**
   * Alias por compatibilidad: algunos controladores/servicios pueden esperar `calcForInvoice`.
   */
  async calcForInvoice(input: CalcInvoiceInput): Promise<CalcInvoiceOutput> {
    return this.calculateForInvoice(input);
  }

  private normalizeProfile(
    thirdParty?: PartnerFiscal,
  ): PartnerFiscal | undefined {
    if (!thirdParty) return undefined;
    if (
      !thirdParty.departmentCode &&
      thirdParty.municipalityCode &&
      thirdParty.municipalityCode.length >= 2
    ) {
      return {
        ...thirdParty,
        departmentCode: thirdParty.municipalityCode.slice(0, 2),
      };
    }
    return thirdParty;
  }

  private async resolveThirdPartyProfile(
    thirdParty?: PartnerFiscal,
    thirdPartyId?: number,
  ) {
    const normalized = this.normalizeProfile(thirdParty);
    const hasPayload =
      normalized &&
      (normalized.ciiuCode ||
        normalized.municipalityCode ||
        normalized.isWithholdingAgent !== undefined ||
        normalized.departmentCode);

    if (hasPayload) return normalized;

    const id = normalized?.id ?? thirdPartyId;
    if (!id) return normalized;

    try {
      const tp = await this.prisma.thirdParty.findUnique({
        where: { id },
        select: {
          id: true,
          isWithholdingAgent: true,
          ciiuCode: true,
          municipalityCode: true,
        },
      });
      if (!tp) return normalized;
      return this.normalizeProfile({
        id: tp.id,
        isWithholdingAgent: tp.isWithholdingAgent,
        ciiuCode: tp.ciiuCode,
        municipalityCode: tp.municipalityCode,
      });
    } catch {
      return normalized;
    }
  }

  private normalizeDate(date?: Date | string): Date | undefined {
    if (!date) return undefined;
    if (date instanceof Date) return date;
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private pickSegment(params: {
    rule: any;
    segments: any[];
    profile?: PartnerFiscal;
    base: number;
    operationDate?: Date;
  }) {
    const { segments, profile, base, operationDate } = params;
    if (!segments?.length) return null;

    const referenceDate = operationDate ?? new Date();

    const scored = segments
      .filter((seg) => {
        if (
          seg.municipalityCode &&
          profile?.municipalityCode &&
          seg.municipalityCode !== profile.municipalityCode
        ) {
          return false;
        }
        if (
          !seg.municipalityCode &&
          seg.departmentCode &&
          profile?.departmentCode &&
          seg.departmentCode !== profile.departmentCode
        ) {
          return false;
        }
        if (seg.validFrom && new Date(seg.validFrom) > referenceDate)
          return false;
        if (seg.validTo && new Date(seg.validTo) < referenceDate) return false;
        const minBase = seg.minBase != null ? toNumber(seg.minBase) : null;
        if (minBase != null && base < minBase) return false;
        const maxBase = seg.maxBase != null ? toNumber(seg.maxBase) : null;
        if (maxBase != null && base > maxBase) return false;
        return true;
      })
      .map((seg) => {
        let score = 0;
        if (seg.municipalityCode) score += 4;
        else if (seg.departmentCode) score += 2;
        if (seg.validFrom) score += 1;
        return {
          seg,
          score,
          validFrom: seg.validFrom ? new Date(seg.validFrom) : undefined,
        };
      });

    if (!scored.length) return null;

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.validFrom ? a.validFrom.getTime() : 0;
      const bTime = b.validFrom ? b.validFrom.getTime() : 0;
      return bTime - aTime;
    });

    return scored[0].seg;
  }
}

// ---------------- utils ----------------
function toNumber(x: any): number {
  if (x == null) return 0;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') return Number(x);
  if (typeof x.toNumber === 'function') return x.toNumber();
  return Number(x);
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
