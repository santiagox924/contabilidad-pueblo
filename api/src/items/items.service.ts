// api/src/items/items.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, ItemType, Unit, UnitKind, TaxProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { unitFamily, FAMILY_BASE } from '../common/units';
import { ACCOUNTS } from '../accounting/config/accounts.map';

type ListParams = {
  q?: string;
  categoryId?: number;
  type?: ItemType;
  active?: boolean;
  skip?: number;
  take?: number;
  orderBy?: 'name' | 'createdAt' | 'updatedAt';
  orderDir?: 'asc' | 'desc';
};

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Helpers de unidades ----------

  /** Deduce UnitKind a partir de una Unit usando la familia real */
  private inferKind(u: Unit): UnitKind {
    const fam = unitFamily(u);
    switch (fam) {
      case 'WEIGHT':
        return UnitKind.WEIGHT;
      case 'VOLUME':
        return UnitKind.VOLUME;
      case 'LENGTH':
        return UnitKind.LENGTH;
      case 'AREA':
        return UnitKind.AREA;
      default:
        return UnitKind.COUNT;
    }
  }

  /** Base canónica por UnitKind (apunta a FAMILY_BASE) */
  private canonicalBase(kind: UnitKind): Unit {
    const map: Record<UnitKind, Unit> = {
      [UnitKind.COUNT]: FAMILY_BASE.COUNT,
      [UnitKind.WEIGHT]: FAMILY_BASE.WEIGHT,
      [UnitKind.VOLUME]: FAMILY_BASE.VOLUME,
      [UnitKind.LENGTH]: FAMILY_BASE.LENGTH,
      [UnitKind.AREA]: FAMILY_BASE.AREA,
    };
    return map[kind];
  }

  /** Catálogo de unidades permitidas para mostrar por UnitKind */
  private allowedDisplay(kind: UnitKind): Unit[] {
    switch (kind) {
      case UnitKind.WEIGHT:
        return [Unit.MG, Unit.G, Unit.KG, Unit.LB];
      case UnitKind.VOLUME:
        return [Unit.ML, Unit.L, Unit.M3, Unit.CM3, Unit.OZ_FL, Unit.GAL];
      case UnitKind.LENGTH:
        return [Unit.MM, Unit.CM, Unit.M, Unit.KM, Unit.IN, Unit.FT, Unit.YD];
      case UnitKind.AREA:
        return [Unit.CM2, Unit.M2, Unit.IN2, Unit.FT2, Unit.YD2];
      default:
        return [Unit.UN, Unit.DZ, Unit.PKG, Unit.BOX, Unit.PR, Unit.ROLL];
    }
  }

  /** Mapeo desde string legado de UI a Unit */
  private unitFromLegacy(str?: string | null): Unit | undefined {
    if (!str) return undefined;
    const s = String(str).trim().toUpperCase();

    // COUNT
    if (s === 'UN') return Unit.UN;
    if (s === 'DZ' || s === 'DOCENA' || s === 'DOZ') return Unit.DZ;
    if (s === 'PKG' || s === 'PAQ' || s === 'PAQUETE') return Unit.PKG;
    if (s === 'BOX' || s === 'CAJA') return Unit.BOX;
    if (s === 'PR' || s === 'PAR') return Unit.PR;
    if (s === 'ROLL' || s === 'ROLLO') return Unit.ROLL;

    // WEIGHT
    if (s === 'MG' || s === 'MIGRAMO' || s === 'MILIGRAMO') return Unit.MG;
    if (s === 'G' || s === 'GR' || s === 'GRAMO') return Unit.G;
    if (s === 'KG' || s === 'KILO' || s === 'KILOGRAMO') return Unit.KG;
    if (s === 'LB' || s === 'LIBRA' || s === 'LBS') return Unit.LB;

    // VOLUME
    if (s === 'ML' || s === 'MILILITRO' || s === 'CC') return Unit.ML;
    if (s === 'L' || s === 'LT' || s === 'LTS' || s === 'LITRO') return Unit.L;
    if (s === 'M3' || s === 'M^3' || s === 'METRO3' || s === 'METRO CUBICO')
      return Unit.M3;
    if (s === 'CM3' || s === 'CM^3' || s === 'CENTIMETRO CUBICO')
      return Unit.CM3;
    if (s === 'OZ_FL' || s === 'OZ' || s === 'ONZA FLUIDA') return Unit.OZ_FL;
    if (s === 'GAL' || s === 'GALON' || s === 'GALÓN') return Unit.GAL;

    // LENGTH
    if (s === 'MM' || s === 'MILIMETRO' || s === 'MILÍMETRO') return Unit.MM;
    if (s === 'CM' || s === 'CENTIMETRO' || s === 'CENTÍMETRO') return Unit.CM;
    if (s === 'M' || s === 'METRO') return Unit.M;
    if (s === 'KM' || s === 'KILOMETRO' || s === 'KILÓMETRO') return Unit.KM;
    if (s === 'IN' || s === 'PULGADA') return Unit.IN;
    if (s === 'FT' || s === 'PIE' || s === 'PIES') return Unit.FT;
    if (s === 'YD' || s === 'YARDA' || s === 'YARDAS') return Unit.YD;

    // AREA
    if (s === 'CM2' || s === 'CM^2' || s === 'CENTIMETRO CUADRADO')
      return Unit.CM2;
    if (s === 'M2' || s === 'M^2' || s === 'METRO CUADRADO') return Unit.M2;
    if (s === 'IN2' || s === 'IN^2' || s === 'PULGADA CUADRADA')
      return Unit.IN2;
    if (
      s === 'FT2' ||
      s === 'FT^2' ||
      s === 'PIE CUADRADO' ||
      s === 'PIES CUADRADOS'
    )
      return Unit.FT2;
    if (s === 'YD2' || s === 'YD^2' || s === 'YARDA CUADRADA') return Unit.YD2;

    return undefined;
  }

  private sameFamily(a: Unit, b: Unit): boolean {
    return unitFamily(a) === unitFamily(b);
  }

  private async findTaxIdByCode(code: string): Promise<number | null> {
    const tax = await this.prisma.tax.findUnique({ where: { code } });
    return tax?.id ?? null;
  }

  /**
   * Normaliza unidades desde los DTOs.
   * Reglas:
   *  - COUNT  → base=UN, display ∈ {UN, DZ, PKG, BOX, PR, ROLL}
   *  - WEIGHT → base=G,  display ∈ {MG, G, KG, LB}
   *  - VOLUME → base=ML, display ∈ {ML, L, M3, CM3, OZ_FL, GAL}
   *  - LENGTH → base=MM, display ∈ {MM, CM, M, KM, IN, FT, YD}
   *  - AREA   → base=CM2,display ∈ {CM2, M2, IN2, FT2, YD2}
   *  - Si viene `unit` (legado), se interpreta como displayUnit por defecto.
   */
  private normalizeUnitsFromDto(dto: Partial<CreateItemDto | UpdateItemDto>): {
    unitKind: UnitKind;
    baseUnit: Unit;
    displayUnit: Unit;
    unitLegacy: string;
  } {
    // 1) entrada cruda
    let base = dto.baseUnit;
    let display = dto.displayUnit;
    let kind = dto.unitKind;

    // 2) soporte legado (unit: string)
    const legacy = this.unitFromLegacy((dto as any).unit);
    if (!display && legacy) display = legacy;

    // 3) deducir kind: explícito > base > display > legacy > COUNT
    if (!kind) {
      if (base) kind = this.inferKind(base);
      else if (display) kind = this.inferKind(display);
      else if (legacy) kind = this.inferKind(legacy);
      else kind = UnitKind.COUNT;
    }

    // 4) fijar base canónica por kind (siempre)
    const canonicalBase = this.canonicalBase(kind);
    base = canonicalBase;

    // 5) display por defecto si no vino: igual a base
    if (!display) display = base;

    // 6) validar que display sea permitido para el kind
    const allowed = this.allowedDisplay(kind);
    if (!allowed.includes(display)) {
      throw new BadRequestException(
        `displayUnit inválida para ${kind}: "${display}". Permitidas: ${allowed.join(', ')}`,
      );
    }

    // mantener compat del campo legado `unit` como string del display
    const unitLegacy = display as unknown as string;
    return { unitKind: kind, baseUnit: base, displayUnit: display, unitLegacy };
  }

  // ---------- Helpers fiscales (IVA efectivo) ----------

  /**
   * Resuelve el taxId efectivo de IVA para un ítem dado (según prioridad solicitada):
   *  1) Si el ítem tiene defaultTaxId → úsalo.
   *  2) Si NO tiene defaultTaxId:
   *     - Si item.taxProfile === NA → caer a la categoría (category.defaultTaxId si existe).
   *     - Si item.taxProfile === EXENTO | EXCLUIDO → 0% (retorna null).
   *     - Si item.taxProfile === IVA_RESPONSABLE → intenta categoría.defaultTaxId; si no existe, null.
   *
   * Devuelve el taxId o null si corresponde 0% o no hay mapeo disponible.
   */
  private async resolveEffectiveTaxIdFor(
    itemId: number,
  ): Promise<number | null> {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: {
        defaultTaxId: true,
        taxProfile: true,
        categoryId: true,
        category: { select: { defaultTaxId: true, taxProfile: true } },
      },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado');

    // 1) Prioridad: defaultTaxId del ítem
    if (item.defaultTaxId != null) return item.defaultTaxId;

    // 2) Según taxProfile del ítem
    switch (item.taxProfile) {
      case TaxProfile.NA: {
        // Caer a la categoría
        if (item.category?.defaultTaxId != null)
          return item.category.defaultTaxId;
        // Si la categoría también está en NA o no tiene tax, no forzamos nada
        return null;
      }
      case TaxProfile.EXENTO:
      case TaxProfile.EXCLUIDO:
        return null; // 0% → sin taxId
      case TaxProfile.IVA_RESPONSABLE: {
        // Sin defaultTaxId en el ítem, intentamos con la categoría
        if (item.category?.defaultTaxId != null)
          return item.category.defaultTaxId;
        return null;
      }
      default:
        return null;
    }
  }

  // ---------- CRUD ----------

  async create(dto: CreateItemDto) {
    const { unitKind, baseUnit, displayUnit, unitLegacy } =
      this.normalizeUnitsFromDto(dto);

    // Validaciones de bandas (si vienen)
    const { priceMin, priceMid, priceMax, costAvg } = dto;
    if (
      priceMin != null &&
      costAvg != null &&
      Number(priceMin) < Number(costAvg)
    ) {
      throw new BadRequestException(
        'El precio mínimo no puede ser menor que el costo.',
      );
    }
    if (
      (priceMin != null &&
        priceMid != null &&
        Number(priceMid) < Number(priceMin)) ||
      (priceMid != null &&
        priceMax != null &&
        Number(priceMax) < Number(priceMid)) ||
      (priceMin != null &&
        priceMax != null &&
        Number(priceMax) < Number(priceMin))
    ) {
      throw new BadRequestException(
        'Las bandas de precio deben cumplir: min ≤ mid ≤ max.',
      );
    }

    const category =
      dto.categoryId != null
        ? await this.prisma.category.findUnique({
            where: { id: dto.categoryId },
            select: {
              id: true,
              incomeAccountCode: true,
              expenseAccountCode: true,
              inventoryAccountCode: true,
              taxAccountCode: true,
              taxProfile: true,
              defaultTaxId: true,
            },
          })
        : null;

    if (dto.categoryId != null && !category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    const itemType = dto.type;
    const isService = itemType === ItemType.SERVICE;

    const taxProfile =
      dto.taxProfile ??
      category?.taxProfile ??
      (isService ? TaxProfile.NA : TaxProfile.IVA_RESPONSABLE);

    let defaultTaxId: number | null;
    if (dto.defaultTaxId === null) {
      defaultTaxId = null;
    } else if (dto.defaultTaxId !== undefined) {
      defaultTaxId = dto.defaultTaxId;
    } else if (category?.defaultTaxId != null) {
      defaultTaxId = category.defaultTaxId;
    } else if (taxProfile === TaxProfile.IVA_RESPONSABLE) {
      defaultTaxId = await this.findTaxIdByCode('IVA19');
    } else {
      defaultTaxId = null;
    }

    const incomeAccountCode =
      dto.incomeAccountCode ??
      category?.incomeAccountCode ??
      ACCOUNTS.salesIncome;

    const expenseAccountCode =
      dto.expenseAccountCode ??
      category?.expenseAccountCode ??
      (isService ? ACCOUNTS.purchaseExpense : ACCOUNTS.cogs);

    let inventoryAccountCode: string | null =
      dto.inventoryAccountCode ??
      category?.inventoryAccountCode ??
      (isService ? null : ACCOUNTS.inventory);

    let taxAccountCode: string | null =
      dto.taxAccountCode ??
      category?.taxAccountCode ??
      (taxProfile === TaxProfile.IVA_RESPONSABLE ? ACCOUNTS.salesVat : null);
    let purchaseTaxAccountCode: string | null =
      (dto as any).purchaseTaxAccountCode ??
      (taxProfile === TaxProfile.IVA_RESPONSABLE ? ACCOUNTS.purchaseVat : null);

    if (isService) {
      inventoryAccountCode = null;
    }

    if (taxProfile !== TaxProfile.IVA_RESPONSABLE) {
      taxAccountCode = null;
      defaultTaxId = null;
    }

    const defaultDiscountPct =
      dto.defaultDiscountPct === undefined ? null : dto.defaultDiscountPct;

    const createData: any = {
      sku: dto.sku,
      name: dto.name,
      type: dto.type,
      unitKind,
      baseUnit,
      displayUnit,
      unit: unitLegacy, // compat legado

      // Económico (opcionales)
      price: dto.price ?? undefined,
      ivaPct: dto.ivaPct ?? undefined,
      defaultDiscountPct,
      costAvg: dto.costAvg ?? undefined,

      // Bandas — nombres exactamente como en Prisma
      priceMin: dto.priceMin ?? null,
      priceMid: dto.priceMid ?? null,
      priceMax: dto.priceMax ?? null,

      categoryId: dto.categoryId ?? null,

      // ===== NUEVOS: persistencia fiscal por ítem =====
      taxProfile,
      defaultTaxId,
      incomeAccountCode: incomeAccountCode ?? null,
      expenseAccountCode: expenseAccountCode ?? null,
      inventoryAccountCode: inventoryAccountCode ?? null,
      taxAccountCode: taxAccountCode ?? null,
  purchaseTaxAccountCode: purchaseTaxAccountCode ?? null,
    };

    try {
      const item = await this.prisma.item.create({
        data: createData,
        include: { category: true },
      });
      return item;
    } catch (e: any) {
      if (this.isUniqueViolation(e, 'Item_sku_key')) {
        throw new ConflictException('Ya existe un ítem con ese SKU');
      }
      if (this.isUniqueViolation(e, 'Category_name_key')) {
        throw new ConflictException(
          'La categoría indicada tiene un nombre duplicado',
        );
      }
      throw e;
    }
  }

  async findAll(params: ListParams = {}) {
    const {
      q,
      categoryId,
      type,
      active,
      skip = 0,
      take = 50,
      orderBy = 'name',
      orderDir = 'asc',
    } = params;

    const where: Prisma.ItemWhereInput = {
      ...(typeof active === 'boolean' ? { active } : {}),
      ...(type ? { type } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { sku: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.item.findMany({
        where,
        include: { category: true },
        skip,
        take,
        orderBy: { [orderBy]: orderDir },
      }),
      this.prisma.item.count({ where }),
    ]);

    // Resolver effectiveVatPct para cada item (si aplica), usando el resolved taxId
    const itemsWithEffective = await Promise.all(items.map(async (it) => {
      let effectiveVat: number | null = null
      // Prefer an explicit positive ivaPct. If ivaPct === 0 but a defaultTaxId
      // exists for the item, prefer the tax rate from defaultTaxId (this covers
      // cases where ivaPct was left as 0 but the category/defaultTaxId defines
      // a real VAT rate).
      if (it.ivaPct != null && Number(it.ivaPct) !== 0) {
        effectiveVat = Number(it.ivaPct)
      } else if (it.defaultTaxId != null) {
        const t = await this.prisma.tax.findUnique({ where: { id: it.defaultTaxId }, select: { ratePct: true } })
        if (t) effectiveVat = Number(t.ratePct)
      } else {
        try {
          const tid = await this.getEffectiveVatTaxId(it.id)
          if (tid != null) {
            const t2 = await this.prisma.tax.findUnique({ where: { id: tid }, select: { ratePct: true } })
            if (t2) effectiveVat = Number(t2.ratePct)
          }
        } catch {}
      }
      return { ...it, effectiveVatPct: effectiveVat }
    }))

    return { items: itemsWithEffective, total, skip, take };
  }

  async findOne(id: number) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado');
    // Resolver effectiveVatPct
    let effectiveVat: number | null = null
    // Same logic as in findAll: prefer an explicit positive ivaPct. If ivaPct === 0
    // and there's a defaultTaxId, use the defaultTaxId's rate. Otherwise fall back
    // to the resolver that inspects category/taxProfile.
    if (item.ivaPct != null && Number(item.ivaPct) !== 0) {
      effectiveVat = Number(item.ivaPct)
    } else if (item.defaultTaxId != null) {
      const t = await this.prisma.tax.findUnique({ where: { id: item.defaultTaxId }, select: { ratePct: true } })
      if (t) effectiveVat = Number(t.ratePct)
    } else {
      try {
        const tid = await this.getEffectiveVatTaxId(item.id)
        if (tid != null) {
          const t2 = await this.prisma.tax.findUnique({ where: { id: tid }, select: { ratePct: true } })
          if (t2) effectiveVat = Number(t2.ratePct)
        }
      } catch {}
    }

    return { ...item, effectiveVatPct: effectiveVat };
  }

  async update(id: number, dto: UpdateItemDto) {
    const existing = await this.prisma.item.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            incomeAccountCode: true,
            expenseAccountCode: true,
            inventoryAccountCode: true,
            taxAccountCode: true,
            taxProfile: true,
            defaultTaxId: true,
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('Ítem no encontrado');

    let targetCategory = existing.category;
    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null) {
        targetCategory = null;
      } else {
        targetCategory = await this.prisma.category.findUnique({
          where: { id: dto.categoryId },
          select: {
            id: true,
            incomeAccountCode: true,
            expenseAccountCode: true,
            inventoryAccountCode: true,
            taxAccountCode: true,
            taxProfile: true,
            defaultTaxId: true,
          },
        });
        if (!targetCategory)
          throw new NotFoundException('Categoría no encontrada');
      }
    }

    const categoryIdToSet =
      dto.categoryId === null
        ? null
        : dto.categoryId !== undefined
          ? dto.categoryId
          : existing.categoryId;

    // unidades: sólo si vienen en dto (o unit legado)
    let unitKind = existing.unitKind;
    let baseUnit = existing.baseUnit;
    let displayUnit = existing.displayUnit;
    let unitLegacy = existing.unit;

    const touchesUnits =
      dto.unitKind !== undefined ||
      dto.baseUnit !== undefined ||
      dto.displayUnit !== undefined ||
      (dto as any).unit !== undefined;

    if (touchesUnits) {
      const norm = this.normalizeUnitsFromDto({
        unitKind: dto.unitKind ?? existing.unitKind,
        baseUnit: dto.baseUnit ?? existing.baseUnit,
        displayUnit: dto.displayUnit ?? existing.displayUnit,
        unit: (dto as any).unit ?? existing.unit,
      });
      unitKind = norm.unitKind;
      baseUnit = norm.baseUnit;
      displayUnit = norm.displayUnit;
      unitLegacy = norm.unitLegacy;
    }

    // Validaciones de bandas (si vienen)
    const priceMin = dto.priceMin ?? existing.priceMin ?? undefined;
    const priceMid = dto.priceMid ?? existing.priceMid ?? undefined;
    const priceMax = dto.priceMax ?? existing.priceMax ?? undefined;
    const costAvg = dto.costAvg ?? existing.costAvg ?? undefined;

    if (
      priceMin != null &&
      costAvg != null &&
      Number(priceMin) < Number(costAvg)
    ) {
      throw new BadRequestException(
        'El precio de venta mínimo no puede ser menor que el costo.',
      );
    }
    if (
      (priceMin != null &&
        priceMid != null &&
        Number(priceMid) < Number(priceMin)) ||
      (priceMid != null &&
        priceMax != null &&
        Number(priceMax) < Number(priceMid)) ||
      (priceMin != null &&
        priceMax != null &&
        Number(priceMax) < Number(priceMin))
    ) {
      throw new BadRequestException(
        'Las bandas de precio deben cumplir: min ≤ mid ≤ max.',
      );
    }

    const finalType = (dto.type as ItemType) ?? existing.type;
    const isService = finalType === ItemType.SERVICE;

    const taxProfile =
      dto.taxProfile ??
      existing.taxProfile ??
      targetCategory?.taxProfile ??
      (isService ? TaxProfile.NA : TaxProfile.IVA_RESPONSABLE);

    let defaultTaxId: number | null;
    if (dto.defaultTaxId === null) {
      defaultTaxId = null;
    } else if (dto.defaultTaxId !== undefined) {
      defaultTaxId = dto.defaultTaxId;
    } else if (existing.defaultTaxId != null) {
      defaultTaxId = existing.defaultTaxId;
    } else if (targetCategory?.defaultTaxId != null) {
      defaultTaxId = targetCategory.defaultTaxId;
    } else if (taxProfile === TaxProfile.IVA_RESPONSABLE) {
      defaultTaxId = await this.findTaxIdByCode('IVA19');
    } else {
      defaultTaxId = null;
    }

    let incomeAccountCode: string | null =
      existing.incomeAccountCode ??
      targetCategory?.incomeAccountCode ??
      ACCOUNTS.salesIncome;
    if (dto.incomeAccountCode === null) incomeAccountCode = null;
    else if (dto.incomeAccountCode !== undefined)
      incomeAccountCode = dto.incomeAccountCode;

    let expenseAccountCode: string | null =
      existing.expenseAccountCode ??
      targetCategory?.expenseAccountCode ??
      (isService ? ACCOUNTS.purchaseExpense : ACCOUNTS.cogs);
    if (dto.expenseAccountCode === null) expenseAccountCode = null;
    else if (dto.expenseAccountCode !== undefined)
      expenseAccountCode = dto.expenseAccountCode;

    let inventoryAccountCode: string | null =
      existing.inventoryAccountCode ??
      targetCategory?.inventoryAccountCode ??
      (isService ? null : ACCOUNTS.inventory);
    if (dto.inventoryAccountCode === null) inventoryAccountCode = null;
    else if (dto.inventoryAccountCode !== undefined)
      inventoryAccountCode = dto.inventoryAccountCode;

    let taxAccountCode: string | null =
      existing.taxAccountCode ??
      targetCategory?.taxAccountCode ??
      (taxProfile === TaxProfile.IVA_RESPONSABLE ? ACCOUNTS.salesVat : null);
    if (dto.taxAccountCode === null) taxAccountCode = null;
    else if (dto.taxAccountCode !== undefined)
      taxAccountCode = dto.taxAccountCode;

    let purchaseTaxAccountCode: string | null =
      (existing as any).purchaseTaxAccountCode ??
      (taxProfile === TaxProfile.IVA_RESPONSABLE ? ACCOUNTS.purchaseVat : null);
    if ((dto as any).purchaseTaxAccountCode === null) purchaseTaxAccountCode = null;
    else if ((dto as any).purchaseTaxAccountCode !== undefined)
      purchaseTaxAccountCode = (dto as any).purchaseTaxAccountCode;

    if (isService) {
      inventoryAccountCode = null;
    }

    if (taxProfile !== TaxProfile.IVA_RESPONSABLE) {
      taxAccountCode = null;
      defaultTaxId = null;
    }

    const existingDefaultDiscount = (existing as any).defaultDiscountPct as
      | number
      | null
      | undefined;

    let defaultDiscountPct: number | null = existingDefaultDiscount ?? null;
    if (dto.defaultDiscountPct === null) defaultDiscountPct = null;
    else if (dto.defaultDiscountPct !== undefined)
      defaultDiscountPct = dto.defaultDiscountPct;

    const updateData: any = {
      sku: dto.sku ?? existing.sku,
      name: dto.name ?? existing.name,
      type: finalType,

      unitKind,
      baseUnit,
      displayUnit,
      unit: unitLegacy,

      // económicos
      price: dto.price ?? existing.price,
      ivaPct: dto.ivaPct ?? existing.ivaPct,
      defaultDiscountPct,
      costAvg: dto.costAvg ?? existing.costAvg,

      // bandas (nombres Prisma)
      priceMin: priceMin ?? null,
      priceMid: priceMid ?? null,
      priceMax: priceMax ?? null,

      // categoría / activo
      categoryId: categoryIdToSet,

      active: dto.active ?? existing.active,

      // ===== NUEVOS: persistencia fiscal por ítem =====
      taxProfile,
      defaultTaxId,
      incomeAccountCode: incomeAccountCode ?? null,
      expenseAccountCode: expenseAccountCode ?? null,
      inventoryAccountCode: inventoryAccountCode ?? null,
      taxAccountCode: taxAccountCode ?? null,
  purchaseTaxAccountCode: purchaseTaxAccountCode ?? null,
    };

    try {
      const item = await this.prisma.item.update({
        where: { id },
        data: updateData,
        include: { category: true },
      });
      return item;
    } catch (e: any) {
      if (this.isUniqueViolation(e, 'Item_sku_key')) {
        throw new ConflictException('Ya existe un ítem con ese SKU');
      }
      throw e;
    }
  }

  async remove(id: number, hard = false) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Ítem no encontrado');

    if (hard) {
      return this.prisma.item.delete({ where: { id } });
    }

    return this.prisma.item.update({
      where: { id },
      data: { active: false },
      include: { category: true },
    });
  }

  /**
   * Método público útil si otra capa necesita saber el taxId efectivo de un ítem.
   * Retorna el taxId o null (0% / sin impuesto / sin mapeo).
   */
  async getEffectiveVatTaxId(itemId: number): Promise<number | null> {
    return this.resolveEffectiveTaxIdFor(itemId);
  }

  // === NUEVO: buscar ítem por código de barras ===
  async findByBarcode(code: string) {
    const barcode = String(code || '').trim();
    if (!barcode) throw new BadRequestException('Código de barras vacío.');

    const item = await this.prisma.item.findUnique({
      where: { barcode },
      include: { category: true },
    });
    if (!item)
      throw new NotFoundException('Item no encontrado por código de barras.');

    return item;
  }

  // ---------- util ----------
  private isUniqueViolation(e: any, constraint?: string) {
    if (e?.code === 'P2002') {
      if (!constraint) return true;
      const metaTarget = Array.isArray(e?.meta?.target)
        ? e.meta.target.join(',')
        : String(e?.meta?.target ?? '');
      return metaTarget.includes(constraint);
    }
    return false;
  }
}
