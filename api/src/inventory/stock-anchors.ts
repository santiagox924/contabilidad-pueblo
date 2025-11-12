// api/src/inventory/stock-anchors.ts
import { Prisma, StockMoveType, Unit, ItemType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { convertToBase } from '../common/units';

// =======================
// Decimal helpers
// =======================
type Dec = Prisma.Decimal;
const DecimalCtor = Prisma.Decimal;
const D = (n: Dec | number | string) => new DecimalCtor(n as any);

const dSum = (vals: Array<Dec | number | string>): Dec =>
  vals.reduce<Dec>((a, b) => a.plus(D(b)), D(0));

// =======================
// UoM conversion (centralizado con common/units)
// =======================
function toBaseQty({
  qty,
  itemBaseUnit,
  providedUom,
}: {
  qty: number | Dec;
  itemBaseUnit: Unit;
  providedUom?: Unit;
}): Dec {
  const n = Number(D(qty).toString());
  const from = providedUom ?? itemBaseUnit;
  // convertToBase valida familia y maneja TODAS las conversiones (G↔KG, ML↔L, MM↔M, CM2↔M2, etc.)
  const v = convertToBase(n, from, itemBaseUnit);
  return D(v);
}

// =======================
// Recipe helpers
// =======================
export async function getActiveRecipeWithComponents(
  prisma: PrismaService,
  outputItemId: number,
) {
  return prisma.recipe.findFirst({
    where: { outputItemId, active: true },
    include: { components: true }, // incluye componentId en cada fila
  });
}

/**
 * Devuelve demanda en BASE por itemId para una cantidad de salida en BASE.
 * Si no hay receta activa: demanda del propio ítem (consumo directo).
 */
export async function explodeRecipeDemand(
  prisma: PrismaService,
  outputItemId: number,
  qtyOutBase: Dec,
): Promise<Map<number, Dec>> {
  const recipe = await getActiveRecipeWithComponents(prisma, outputItemId);
  const demand = new Map<number, Dec>();

  if (!recipe) {
    demand.set(outputItemId, D(qtyOutBase));
    return demand;
  }

  const denom = D(recipe.outputQtyBase || 1);
  if (denom.lte(0))
    throw new Error('La receta tiene outputQtyBase inválida (<= 0)');

  for (const c of recipe.components) {
    const need = D(c.qtyBasePerOut).mul(qtyOutBase).div(denom);
    const prev = demand.get(c.componentId) || D(0);
    demand.set(c.componentId, prev.plus(need));
  }
  return demand;
}

// =======================
// Stock helpers
// =======================
export async function getAvailableBase(
  prisma: PrismaService,
  itemId: number,
  warehouseId: number,
): Promise<Dec> {
  const layers = await prisma.stockLayer.findMany({
    where: { itemId, warehouseId },
    select: { remainingQty: true },
  });
  return dSum(layers.map((l) => l.remainingQty));
}

/** FEFO: expiry asc con NULL al final, luego createdAt asc */
async function loadLayersFefo(
  prisma: PrismaService,
  itemId: number,
  warehouseId: number,
) {
  const withDate = await prisma.stockLayer.findMany({
    where: { itemId, warehouseId, expiryDate: { not: null } },
    orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, remainingQty: true, unitCost: true },
  });
  const noDate = await prisma.stockLayer.findMany({
    where: { itemId, warehouseId, expiryDate: null },
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, remainingQty: true, unitCost: true },
  });
  return [...withDate, ...noDate];
}

/**
 * Plan de consumo FEFO por capas (no escribe DB)
 */
export async function planFefoConsumption(
  prisma: PrismaService,
  itemId: number,
  warehouseId: number,
  qtyBase: Dec,
): Promise<{
  parts: Array<{ layerId: number; takeBase: Dec; unitCost: Dec }>;
  available: Dec;
  shortage: Dec;
}> {
  const layers = await loadLayersFefo(prisma, itemId, warehouseId);

  let remain: Dec = D(qtyBase);
  const parts: Array<{ layerId: number; takeBase: Dec; unitCost: Dec }> = [];
  let available: Dec = D(0);

  for (const l of layers) {
    const can = D(l.remainingQty);
    if (can.lte(0)) continue;
    available = available.plus(can);
    if (remain.lte(0)) break;

    const take = Prisma.Decimal.min(can, remain);
    if (take.gt(0)) {
      parts.push({ layerId: l.id, takeBase: take, unitCost: D(l.unitCost) });
      remain = remain.minus(take);
    }
  }

  const shortage = remain.gt(0) ? remain : D(0);
  return { parts, available, shortage };
}

/**
 * Verifica disponibilidad para una demanda múltiple.
 */
export async function checkMultiAvailability(
  prisma: PrismaService,
  warehouseId: number,
  demand: Map<number, Dec>,
  allowNegative = false,
): Promise<{
  ok: boolean;
  shortages: Array<{
    itemId: number;
    required: Dec;
    available: Dec;
    shortage: Dec;
  }>;
}> {
  const shortages: Array<{
    itemId: number;
    required: Dec;
    available: Dec;
    shortage: Dec;
  }> = [];

  for (const [itemId, req] of demand.entries()) {
    const available = await getAvailableBase(prisma, itemId, warehouseId);
    const shortage = Prisma.Decimal.max(D(0), D(req).minus(available));
    if (!allowNegative && shortage.gt(0)) {
      shortages.push({ itemId, required: D(req), available, shortage });
    }
  }

  return { ok: shortages.length === 0, shortages };
}

async function ensureZeroLayerForNegative(
  tx: Prisma.TransactionClient,
  itemId: number,
  warehouseId: number,
  unitCost: Dec,
): Promise<number> {
  const layer = await tx.stockLayer.create({
    data: {
      itemId,
      warehouseId,
      remainingQty: D(0), // esta capa quedará negativa tras el decrement
      unitCost,
      lotCode: 'NEG',
    },
    select: { id: true },
  });
  return layer.id;
}

async function getItemBaseUnit(
  tx: Prisma.TransactionClient,
  itemId: number,
): Promise<Unit> {
  const it = await tx.item.findUnique({
    where: { id: itemId },
    select: { baseUnit: true },
  });
  if (!it) throw new Error(`Ítem #${itemId} no existe`);
  return it.baseUnit;
}

/**
 * Consume demanda como movimientos SALE (por componente), soporta inventario negativo.
 * Crea:
 *  - stockMove (SALE) con qty NEGATIVA en BASE
 *  - stockConsumption por capa
 *  - actualiza remainingQty (decrementa; puede quedar negativa si allowNegative)
 */
export async function consumeDemandAsSale(
  tx: Prisma.TransactionClient,
  warehouseId: number,
  demand: Map<number, Dec>,
  opts?: {
    refType?: string;
    refId?: number;
    note?: string;
    allowNegative?: boolean;
  },
): Promise<Array<{ itemId: number; qtyBase: Dec; avgCost: Dec }>> {
  const results: Array<{ itemId: number; qtyBase: Dec; avgCost: Dec }> = [];
  const allowNegative = !!opts?.allowNegative;

  for (const [itemId, qtyBase] of demand.entries()) {
    if (D(qtyBase).lte(0)) continue;

    const { parts, available, shortage } = await planFefoConsumption(
      tx as any,
      itemId,
      warehouseId,
      qtyBase,
    );

    if (!allowNegative && shortage.gt(0)) {
      throw new Error(
        `Stock insuficiente para ítem #${itemId}: requerido ${qtyBase.toString()}, disponible ${available.toString()}`,
      );
    }

    let negLayerId: number | null = null;
    if (allowNegative && shortage.gt(0)) {
      const it = await tx.item.findUnique({
        where: { id: itemId },
        select: { costAvg: true },
      });
      const fallbackCost = D(it?.costAvg ?? 0);
      negLayerId = await ensureZeroLayerForNegative(
        tx,
        itemId,
        warehouseId,
        fallbackCost,
      );
      parts.push({
        layerId: negLayerId,
        takeBase: shortage,
        unitCost: fallbackCost,
      });
    }

    // Costo promedio ponderado de lo consumido
    const totalVal: Dec = parts.reduce<Dec>(
      (acc, p) => acc.plus(D(p.unitCost).mul(p.takeBase)),
      D(0),
    );
    const totalQty: Dec = parts.reduce<Dec>(
      (acc, p) => acc.plus(p.takeBase),
      D(0),
    );
    const avgCost = totalQty.gt(0) ? totalVal.div(totalQty) : D(0);

    // Movimiento de SALIDA (qty NEGATIVA en base)
    const move = await tx.stockMove.create({
      data: {
        itemId,
        warehouseId,
        type: StockMoveType.SALE,
        qty: D(qtyBase).mul(-1), // ⬅️ OUT negativo (consistente con kardex/agregados)
        uom: await getItemBaseUnit(tx, itemId),
        unitCost: avgCost,
        refType: opts?.refType ?? 'SALE',
        refId: opts?.refId ?? null,
        note: opts?.note ?? null,
      },
      select: { id: true },
    });

    for (const p of parts) {
      await tx.stockConsumption.create({
        data: {
          moveOutId: move.id,
          layerId: p.layerId,
          itemId,
          warehouseId,
          qty: p.takeBase,
          unitCost: p.unitCost,
        },
      });
      await tx.stockLayer.update({
        where: { id: p.layerId },
        data: { remainingQty: { decrement: p.takeBase } as any },
      });
    }

    results.push({ itemId, qtyBase: D(qtyBase), avgCost });
  }

  return results;
}

/**
 * Orquestación de consumo para una línea de venta (respeta receta/servicio)
 */
export async function anchorAndConsumeForSaleLine(
  prisma: PrismaService,
  params: {
    itemId: number;
    warehouseId: number;
    qty: number | Dec;
    uom?: Unit;
    refType?: string;
    refId?: number;
    note?: string;
    allowNegative?: boolean;
  },
): Promise<{
  demand: Map<number, Dec>;
  applied: Array<{ itemId: number; qtyBase: Dec; avgCost: Dec }>;
  skippedByService: boolean;
}> {
  const it = await prisma.item.findUnique({
    where: { id: params.itemId },
    select: { id: true, type: true, baseUnit: true },
  });
  if (!it) throw new Error('Ítem no encontrado');

  if (it.type === ItemType.SERVICE) {
    return { demand: new Map(), applied: [], skippedByService: true };
  }

  // Cantidad de SALIDA en BASE del ítem (usando uom capturada si vino)
  const qtyOutBase = toBaseQty({
    qty: params.qty,
    itemBaseUnit: it.baseUnit,
    providedUom: params.uom ?? it.baseUnit,
  });

  // Demanda de componentes (o del propio ítem si no hay receta activa)
  const demand = await explodeRecipeDemand(prisma, it.id, qtyOutBase);

  // Consumir
  const applied = await prisma.$transaction(async (tx) =>
    consumeDemandAsSale(tx, params.warehouseId, demand, {
      refType: params.refType,
      refId: params.refId,
      note: params.note,
      allowNegative: !!params.allowNegative,
    }),
  );

  return { demand, applied, skippedByService: false };
}

/**
 * Validación previa para una línea de venta (detectar faltantes)
 */
export async function validateSaleLineStock(
  prisma: PrismaService,
  params: {
    itemId: number;
    warehouseId: number;
    qty: number | Dec;
    uom?: Unit;
    allowNegative?: boolean;
  },
): Promise<{
  ok: boolean;
  shortages: Array<{
    itemId: number;
    required: Dec;
    available: Dec;
    shortage: Dec;
  }>;
}> {
  const it = await prisma.item.findUnique({
    where: { id: params.itemId },
    select: { id: true, type: true, baseUnit: true },
  });
  if (!it) throw new Error('Ítem no encontrado');

  if (it.type === ItemType.SERVICE) {
    return { ok: true, shortages: [] };
  }

  const qtyOutBase = toBaseQty({
    qty: params.qty,
    itemBaseUnit: it.baseUnit,
    providedUom: params.uom ?? it.baseUnit,
  });

  const demand = await explodeRecipeDemand(prisma, it.id, qtyOutBase);
  return checkMultiAvailability(
    prisma,
    params.warehouseId,
    demand,
    !!params.allowNegative,
  );
}
