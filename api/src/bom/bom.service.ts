// api/src/bom/bom.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Unit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { convertToBase, convertFromBase } from '../common/units';

type D = Prisma.Decimal;
const d = (v: number | string | Prisma.Decimal) =>
  v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v as any);
const d0 = () => new Prisma.Decimal(0);
const d1 = () => new Prisma.Decimal(1);
const toNum = (x: D | number | string | null | undefined) =>
  x == null ? 0 : Number(x instanceof Prisma.Decimal ? x.toString() : x);

export type ExplodeLeaf = {
  itemId: number;
  qtyBase: number;
};

@Injectable()
export class BomService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================
  // Helpers
  // ==========================
  /** Receta activa con componentes + metadatos del ítem terminado y componentes (base/display) */
  private async getActiveRecipeRaw(outputItemId: number) {
    return this.prisma.recipe.findFirst({
      where: { outputItemId, active: true },
      include: {
        outputItem: {
          select: { id: true, baseUnit: true, displayUnit: true, name: true },
        },
        components: {
          include: {
            component: {
              select: {
                id: true,
                baseUnit: true,
                displayUnit: true,
                name: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
  }

  /**
   * DTO de salida amigable al front:
   * - Mantiene el formato “nuevo” (outputItemId, outputQtyBase, outputUom, components[] con componentId/qtyBasePerOut)
   * - Expone atajos `yieldUom` y `yieldQty` en la UOM recordada del parent (o display por defecto)
   * - Para cada componente, “unit/uom” refleja la `componentUom` elegida (o displayUnit del ítem).
   */
  private toRecipeDto(
    rec: NonNullable<Awaited<ReturnType<BomService['getActiveRecipeRaw']>>>,
  ) {
    const parentBase = rec.outputItem?.baseUnit ?? Unit.UN;
    const uiUom =
      (rec as any).outputUom ?? rec.outputItem?.displayUnit ?? Unit.UN;
    const outBase = toNum(rec.outputQtyBase ?? 1);
    const yieldQty = convertFromBase(outBase, parentBase, uiUom as Unit);

    return {
      id: rec.id,
      outputItemId: rec.outputItemId,
      outputQtyBase: rec.outputQtyBase, // en baseUnit del ítem terminado
      outputUom: (rec as any).outputUom ?? null, // preferencia guardada (puede ser null)
      yieldUom: uiUom as Unit, // atajo para UI
      yieldQty: yieldQty, // atajo para UI en yieldUom

      note: rec.note ?? null,
      active: rec.active,

      components: rec.components.map((c) => {
        const preferred = (c as any).componentUom as Unit | undefined;
        const fallback =
          (c.component?.displayUnit as Unit | undefined) ?? Unit.UN;
        const u = preferred ?? fallback;

        return {
          id: c.id,
          recipeId: c.recipeId,
          componentId: c.componentId,
          qtyBasePerOut: c.qtyBasePerOut, // SIEMPRE en base del componente
          componentUom: u, // unidad preferida recordada
          unit: u, // alias
          uom: u, // alias
          wastePct: c.wastePct ?? 0,
          optional: !!c.optional,
          note: c.note ?? null,
        };
      }),
    };
  }

  private async sumPreparedStock(
    itemId: number,
    warehouseId: number,
  ): Promise<D> {
    const agg = await this.prisma.stockLayer.aggregate({
      _sum: { remainingQty: true },
      where: { itemId, warehouseId },
    });
    return d(agg._sum.remainingQty ?? 0);
  }

  // Resolver id por SKU (case-insensitive)
  private async itemIdFromSku(raw?: string): Promise<number | null> {
    const sku = (raw ?? '').trim();
    if (!sku) return null;
    const it = await this.prisma.item.findFirst({
      where: { sku: { equals: sku, mode: 'insensitive' } },
      select: { id: true },
    });
    return it?.id ?? null;
  }

  /**
   * Normaliza payloads del front (acepta varios alias por compatibilidad):
   * - parentItemId | itemId | parentSku | sku | code
   * - yieldQty (output cantidad) + yieldUom (unidad preferida del rendimiento)
   * - components[].{ componentItemId | itemId | id | componentSku | sku | code, qty, unit|uom, wastePct, optional }
   * - wastagePct (global) se usa como default para componentes que no envíen wastePct
   */
  private normalizeUpsertPayload(input: any) {
    const parentItemId = input?.parentItemId ?? input?.itemId ?? undefined;
    const parentSku =
      input?.parentSku ?? input?.sku ?? input?.code ?? undefined;

    const yieldQty =
      input?.yieldQty ?? input?.outputQty ?? input?.rindeQty ?? 1;
    const yieldUom = (input?.yieldUom ??
      input?.outputUom ??
      input?.rindeUom) as Unit | undefined;

    const globalWaste = Number.isFinite(Number(input?.wastagePct))
      ? Number(input?.wastagePct)
      : undefined;

    const components = Array.isArray(input?.components)
      ? input.components.map((c: any) => ({
          componentItemId:
            c?.componentItemId ?? c?.itemId ?? c?.id ?? undefined,
          componentSku: c?.componentSku ?? c?.sku ?? c?.code ?? undefined,
          qty: Number(c?.qty ?? 0),
          unit: (c?.unit as Unit) ?? (c?.uom as Unit) ?? undefined,
          wastePct: Number.isFinite(Number(c?.wastagePct ?? c?.wastePct))
            ? Number(c?.wastagePct ?? c?.wastePct)
            : (globalWaste ?? 0),
          optional: !!c?.optional,
        }))
      : [];

    return {
      parentItemId,
      parentSku,
      name: input?.name ?? input?.note ?? undefined,
      isActive: typeof input?.isActive === 'boolean' ? input.isActive : true,
      yieldQty: Number(yieldQty ?? 1),
      yieldUom,
      components,
    };
  }

  // ==========================
  // API pública
  // ==========================

  /** Obtiene la receta activa (si existe) con unidades persistidas por componente + yield para UI */
  async getRecipe(itemId: number) {
    const rec = await this.getActiveRecipeRaw(itemId);
    if (!rec) return null;
    return this.toRecipeDto(rec);
  }

  /**
   * Upsert receta ACTIVA.
   * - Guarda outputQtyBase calculado desde yieldQty/yieldUom (o 1 si no se envía).
   * - Guarda outputUom (unidad preferida de rendimiento) para la UI.
   * - Reemplaza componentes (qty en base; recuerda componentUom).
   */
  async upsertRecipe(
    inputDto:
      | {
          parentItemId?: number;
          parentSku?: string;
          name?: string;
          isActive?: boolean;
          yieldQty?: number;
          yieldUom?: Unit;
          components: Array<{
            componentItemId?: number;
            componentSku?: string;
            qty: number;
            unit?: Unit;
            wastePct?: number;
            optional?: boolean;
          }>;
        }
      | any,
  ) {
    if (!inputDto) throw new BadRequestException('payload requerido');

    const dto = this.normalizeUpsertPayload(inputDto);

    if (!dto?.components?.length) {
      throw new BadRequestException('Agrega al menos 1 componente');
    }

    // Resolver parentId por id o sku
    const parentId =
      dto.parentItemId ?? (await this.itemIdFromSku(dto.parentSku));
    if (!parentId) {
      throw new BadRequestException(
        `Debe enviar parentItemId o parentSku válidos (recibido parentItemId=${dto.parentItemId ?? 'null'}, parentSku="${(dto.parentSku ?? '').trim()}")`,
      );
    }

    // Resolver ids de componentes (y validar existencia)
    const resolvedComponents = await Promise.all(
      dto.components.map(async (c: any, idx: number) => {
        const compId =
          c.componentItemId ?? (await this.itemIdFromSku(c.componentSku));
        if (!compId) {
          throw new BadRequestException(
            `Componente #${idx + 1}: debe enviar componentItemId o componentSku válidos (recibido componentItemId=${c.componentItemId ?? 'null'}, componentSku="${(c.componentSku ?? '').trim()}")`,
          );
        }
        return { ...c, componentItemId: compId };
      }),
    );

    // Validar existencia explícita de parent + componentes y traer metadatos de unidades
    const ids = [
      parentId,
      ...resolvedComponents.map((c) => c.componentItemId!),
    ];
    const items = await this.prisma.item.findMany({
      where: { id: { in: ids } },
      select: { id: true, baseUnit: true, displayUnit: true },
    });
    const foundIds = new Set(items.map((x) => x.id));
    for (const id of ids)
      if (!foundIds.has(id))
        throw new BadRequestException(`Ítem ${id} no existe`);
    const metaById = new Map(items.map((i) => [i.id, i]));

    // Preparar outputQtyBase según yieldQty/yieldUom (en base del terminado)
    const parentMeta = metaById.get(parentId)!;
    const parentBase = parentMeta.baseUnit;
    const hasYield =
      dto.yieldUom &&
      Number.isFinite(Number(dto.yieldQty)) &&
      Number(dto.yieldQty) > 0;
    let outQtyBaseNum = 1;
    let outUom: Unit | null = null;
    if (hasYield) {
      try {
        outQtyBaseNum = convertToBase(
          Number(dto.yieldQty),
          dto.yieldUom as Unit,
          parentBase,
        );
        outUom = dto.yieldUom as Unit;
      } catch {
        throw new BadRequestException(
          `yieldUom incompatible con el ítem terminado (base=${parentBase})`,
        );
      }
    }
    const outQtyBase = d(outQtyBaseNum);

    // Transacción
    const saved = await this.prisma.$transaction(async (tx) => {
      // 1) Upsert cabecera
      const rec = await tx.recipe.upsert({
        where: { outputItemId: parentId },
        update: {
          note: dto.name ?? null,
          active: dto.isActive ?? true,
          outputQtyBase: outQtyBase, // 👈 puede ser ≠ 1
          outputUom: outUom, // 👈 guardamos preferencia UI
        },
        create: {
          outputItemId: parentId,
          outputQtyBase: outQtyBase,
          outputUom: outUom,
          note: dto.name ?? null,
          active: dto.isActive ?? true,
        },
      });

      // 2) Reemplazar componentes
      await tx.recipeComponent.deleteMany({ where: { recipeId: rec.id } });

      if (resolvedComponents.length) {
        const rows = resolvedComponents.map((c: any) => {
          const meta = metaById.get(c.componentItemId)!;
          const compBase = meta.baseUnit;
          const chosenUom: Unit =
            (c.unit as Unit) ?? meta.displayUnit ?? Unit.UN;

          const qtyNum = Number(c.qty ?? 0);
          let qtyBaseNum: number;
          try {
            qtyBaseNum = convertToBase(qtyNum, chosenUom, compBase); // → number en base
          } catch {
            throw new BadRequestException(
              `UOM incompatible para componente ${c.componentItemId}: '${chosenUom}' no pertenece a la misma familia (base=${compBase})`,
            );
          }

          const wastePct = Math.max(0, Number(c.wastePct ?? 0));
          const factor = 1 + wastePct / 100;
          const qtyBasePerOut = d(qtyBaseNum).mul(d(factor)); // Decimal en base

          return {
            recipeId: rec.id,
            componentId: c.componentItemId!,
            qtyBasePerOut,
            optional: !!c.optional,
            wastePct,
            componentUom: chosenUom, // 👈 persistimos la UOM elegida
          };
        });

        await tx.recipeComponent.createMany({ data: rows });
      }

      // 3) Leer receta con metadatos
      return tx.recipe.findUnique({
        where: { id: (rec as any).id },
        include: {
          outputItem: {
            select: { id: true, baseUnit: true, displayUnit: true, name: true },
          },
          components: {
            include: {
              component: {
                select: {
                  id: true,
                  baseUnit: true,
                  displayUnit: true,
                  name: true,
                },
              },
            },
            orderBy: { id: 'asc' },
          },
        },
      });
    });

    return this.toRecipeDto(saved!);
  }

  /** Desactiva la receta activa del ítem (soft) */
  async deactivateRecipe(itemId: number) {
    const res = await this.prisma.recipe.updateMany({
      where: { outputItemId: itemId, active: true },
      data: { active: false },
    });
    if (res.count === 0)
      throw new NotFoundException('No hay receta activa para desactivar');
    return { ok: true, deactivated: res.count };
  }

  /**
   * Explota requerimientos:
   * - Si viene warehouseId: descuenta primero stock preparado del terminado.
   * - El remanente se explota contra la receta activa (recursivo).
   * - Nodos sin receta → hojas (insumos base).
   * - Detecta ciclos.
   *
   * Importante: qty que entra/sale aquí es SIEMPRE en **base**.
   */
  async explodeRequirements(dto: {
    items: Array<{ itemId: number; qty: number }>;
    warehouseId?: number;
  }): Promise<{ warehouseId?: number; leaves: ExplodeLeaf[] }> {
    if (!dto?.items?.length) throw new BadRequestException('items requerido');

    // Validar ítems solicitados
    const ids = dto.items.map((i) => i.itemId);
    const found = await this.prisma.item.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const ok = new Set(found.map((x) => x.id));
    for (const id of ids)
      if (!ok.has(id)) throw new BadRequestException(`Ítem ${id} no existe`);

    const acc = new Map<number, D>();
    const cache = new Map<
      number,
      Awaited<ReturnType<BomService['getActiveRecipeRaw']>> | null
    >();
    const visiting = new Set<number>();

    const getR = async (itemId: number) => {
      if (cache.has(itemId)) return cache.get(itemId)!;
      const r = await this.getActiveRecipeRaw(itemId);
      cache.set(itemId, r);
      return r;
    };

    const addLeaf = (itemId: number, qty: D) => {
      const cur = acc.get(itemId) ?? d0();
      acc.set(itemId, cur.plus(qty));
    };

    const walk = async (itemId: number, qtyNeeded: D) => {
      if (qtyNeeded.lte(0)) return;

      // 1) Stock preparado del producto en la bodega (si hay)
      let remaining = qtyNeeded;
      if (dto.warehouseId) {
        const available = await this.sumPreparedStock(itemId, dto.warehouseId);
        const use = available.lt(remaining) ? available : remaining;
        remaining = remaining.minus(use);
      }
      if (remaining.lte(0)) return;

      // 2) Explosión por receta activa
      const r = await getR(itemId);
      if (!r) {
        addLeaf(itemId, remaining);
        return;
      }

      // Ciclos
      if (visiting.has(itemId)) {
        throw new BadRequestException(
          `Ciclo detectado en recetas con itemId=${itemId}`,
        );
      }
      visiting.add(itemId);
      try {
        // 👇 Escalar por la salida real de la receta (puede ser ≠ 1 ahora)
        const outPerBatch = d(r.outputQtyBase ?? 1);
        if (outPerBatch.lte(0)) {
          throw new BadRequestException(
            `La receta del itemId=${itemId} tiene outputQtyBase inválido`,
          );
        }
        const scale = remaining.div(outPerBatch);

        for (const c of r.components) {
          const need = d(c.qtyBasePerOut).mul(scale);
          await walk((c as any).componentId, need);
        }
      } finally {
        visiting.delete(itemId);
      }
    };

    for (const it of dto.items) {
      await walk(it.itemId, d(it.qty));
    }

    const leaves: ExplodeLeaf[] = [...acc.entries()].map(([itemId, qty]) => ({
      itemId,
      qtyBase: toNum(qty),
    }));

    // Orden por nombre (UX)
    if (leaves.length) {
      const items = await this.prisma.item.findMany({
        where: { id: { in: leaves.map((l) => l.itemId) } },
        select: { id: true, name: true },
      });
      const nameMap = new Map(items.map((i) => [i.id, i.name ?? '']));
      leaves.sort((a, b) =>
        (nameMap.get(a.itemId) || '').localeCompare(
          nameMap.get(b.itemId) || '',
        ),
      );
    }

    return { warehouseId: dto.warehouseId, leaves };
  }

  /** Calcula el costo de una receta (por unidad de salida) usando costAvg de los insumos */
  async costOfRecipe(recipeId: number) {
    const r = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        components: {
          include: { component: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!r) throw new NotFoundException('Receta no encontrada');

    const outPerBatch = d(r.outputQtyBase ?? 1);
    if (outPerBatch.lte(0)) return { cost: 0 };

    let cost = d0();
    for (const c of r.components) {
      const qty = d(c.qtyBasePerOut ?? 0);
      const unitCost = d((c as any).component?.costAvg ?? 0);
      cost = cost.plus(qty.mul(unitCost));
    }

    const perUnit = cost.div(outPerBatch);
    return { cost: Number(perUnit) };
  }
}
