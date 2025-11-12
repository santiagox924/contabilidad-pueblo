import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaClient,
  Prisma,
  StockAdjustmentReason,
  StockMoveType,
  Unit,
} from '@prisma/client';
import { convertToBase, convertFromBase } from '../common/units';
import { BomService } from '../bom/bom.service';
import { AccountingService } from '../accounting/accounting.service';

const prisma = new PrismaClient();
type OrderDir = 'asc' | 'desc';

@Injectable()
export class InventoryService {
  private prisma = prisma;
  constructor(
    private readonly bom: BomService,
    private readonly accounting: AccountingService,
  ) {}

  /** Conversiones centralizadas */
  private baseToDisplay(qtyBase: number, base: Unit, display: Unit) {
    return convertFromBase(qtyBase, base, display);
  }
  private displayToBase(qtyDisplay: number, base: Unit, display: Unit) {
    return convertToBase(qtyDisplay, display, base);
  }

  // ===== Bodegas =====
  async listWarehouses() {
    return this.prisma.warehouse.findMany({ orderBy: { id: 'asc' } });
  }
  async createWarehouse(name: string) {
    return this.prisma.warehouse.create({ data: { name } });
  }

  // ===== Stock =====
  async stockOf(itemId: number, warehouseId: number) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item no encontrado');

    // Sumamos qty (positivo entra, negativo sale) SIEMPRE en base
    const agg = await this.prisma.stockMove.aggregate({
      _sum: { qty: true },
      where: { itemId, warehouseId },
    });
    const totalBase = Number(agg._sum.qty ?? 0);

    // Próximo vencimiento entre capas con remanente > 0 y fecha definida
    const nextLayer = await this.prisma.stockLayer.findFirst({
      where: {
        itemId,
        warehouseId,
        remainingQty: { gt: 0 },
        expiryDate: { not: null },
      },
      orderBy: { expiryDate: 'asc' },
    });

    return {
      itemId,
      warehouseId,
      qtyBase: totalBase,
      qtyDisplay: this.baseToDisplay(
        totalBase,
        item.baseUnit,
        item.displayUnit,
      ),
      displayUnit: item.displayUnit,
      nextExpiry: nextLayer?.expiryDate ?? null,
    };
  }

  async stockSummary(itemId: number) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item no encontrado');

    const agg = await this.prisma.stockMove.aggregate({
      _sum: { qty: true },
      where: { itemId },
    });
    const totalBase = Number(agg._sum.qty ?? 0);

    return {
      itemId,
      totalQtyBase: totalBase,
      totalQtyDisplay: this.baseToDisplay(
        totalBase,
        item.baseUnit,
        item.displayUnit,
      ),
      displayUnit: item.displayUnit,
    };
  }

  // ===== Kardex =====
  async kardex(params: {
    itemId: number;
    warehouseId?: number;
    from?: Date;
    to?: Date;
  }) {
    const { itemId, warehouseId, from, to } = params;
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item no encontrado');

    const where: any = { itemId };
    if (warehouseId) where.warehouseId = warehouseId;
    if (from || to) where.ts = {};
    if (from) where.ts.gte = from;
    if (to) where.ts.lte = to;

    const rows = await this.prisma.stockMove.findMany({
      where,
      orderBy: { ts: 'asc' },
    });

    let balanceBase = 0;
    const out = rows.map((r) => {
      const qBase = Number(r.qty); // puede ser negativo en OUT
      balanceBase += qBase;
      return {
        id: r.id,
        date: r.ts,
        type: r.type,
        qtyDisplay: this.baseToDisplay(qBase, item.baseUnit, item.displayUnit),
        balanceDisplay: this.baseToDisplay(
          balanceBase,
          item.baseUnit,
          item.displayUnit,
        ),
        displayUnit: item.displayUnit,
        refType: r.refType ?? undefined,
        refId: r.refId ?? undefined,
        note: r.note ?? undefined,
      };
    });
    return out;
  }

  // ===== Movimientos (lista paginada) =====
  async listMoves(params: {
    itemId?: number;
    warehouseId?: number;
    take?: number;
    skip?: number;
    orderDir?: OrderDir;
  }) {
    const {
      itemId,
      warehouseId,
      take = 20,
      skip = 0,
      orderDir = 'asc',
    } = params;
    const where: any = {};
    if (itemId) where.itemId = itemId;
    if (warehouseId) where.warehouseId = warehouseId;

    const [total, items] = await Promise.all([
      this.prisma.stockMove.count({ where }),
      this.prisma.stockMove.findMany({
        where,
        include: { item: true, warehouse: true },
        orderBy: { ts: orderDir },
        take,
        skip,
      }),
    ]);

    return {
      total,
      items: items.map((m) => {
        const qtyBase = Number(m.qty);
        const qtyDisplay = this.baseToDisplay(
          qtyBase,
          m.item.baseUnit,
          m.item.displayUnit,
        );
        return {
          id: m.id,
          createdAt: m.ts,
          type: m.type,
          qtyBase,
          qtyDisplay,
          displayUnit: m.item.displayUnit,
          warehouse: { id: m.warehouseId, name: (m as any).warehouse?.name },
          item: {
            id: m.itemId,
            name: (m as any).item?.name,
            displayUnit: (m as any).item?.displayUnit,
          },
          refType: m.refType ?? undefined,
          refId: m.refId ?? undefined,
          note: m.note ?? undefined,
        };
      }),
    };
  }

  // ===== Capas vigentes =====
  async listLayers(itemId: number, warehouseId: number) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item no encontrado');

    const layers = await this.prisma.stockLayer.findMany({
      where: { itemId, warehouseId, remainingQty: { gt: 0 } },
      orderBy: { createdAt: 'asc' }, // FIFO visual
    });

    return layers.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      warehouseId: l.warehouseId,
      remainingQtyBase: Number(l.remainingQty),
      remainingQtyDisplay: this.baseToDisplay(
        Number(l.remainingQty),
        item.baseUnit,
        item.displayUnit,
      ),
      displayUnit: item.displayUnit,
      unitCost: Number(l.unitCost),
      createdAt: l.createdAt,
      expiryDate: l.expiryDate ?? undefined,
      lotCode: l.lotCode ?? undefined,
      productionDate: l.productionDate ?? undefined,
      moveInId: (l as any).moveInId ?? undefined,
    }));
  }

  /** ===== Helper: consumo de capas (FEFO por defecto; nulls al final) ===== */
  private async consumeLayers(
    tx: Prisma.TransactionClient,
    params: {
      itemId: number;
      warehouseId: number;
      qtyBase: number;
      strategy?: 'FEFO' | 'FIFO';
    },
  ) {
    const { itemId, warehouseId, strategy = 'FEFO' } = params;
    let remaining = params.qtyBase;
    const consumed: Array<{ layerId: number; qty: number; unitCost: number }> =
      [];

    let layers: Awaited<ReturnType<typeof tx.stockLayer.findMany>> = [];
    if (strategy === 'FEFO') {
      const withDate = await tx.stockLayer.findMany({
        where: {
          itemId,
          warehouseId,
          remainingQty: { gt: 0 },
          expiryDate: { not: null },
        },
        orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
      });
      const noDate = await tx.stockLayer.findMany({
        where: {
          itemId,
          warehouseId,
          remainingQty: { gt: 0 },
          expiryDate: null,
        },
        orderBy: { createdAt: 'asc' },
      });
      layers = [...withDate, ...noDate];
    } else {
      layers = await tx.stockLayer.findMany({
        where: { itemId, warehouseId, remainingQty: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      });
    }

    for (const layer of layers) {
      if (remaining <= 0) break;
      const avail = Number(layer.remainingQty);
      if (avail <= 0) continue;
      const take = Math.min(avail, remaining);
      await tx.stockLayer.update({
        where: { id: layer.id },
        data: { remainingQty: (avail - take) as any },
      });
      consumed.push({
        layerId: layer.id,
        qty: take,
        unitCost: Number(layer.unitCost),
      });
      remaining -= take;
    }

    if (remaining > 0) {
      throw new BadRequestException('Stock insuficiente para salida');
    }
    return consumed;
  }

  /** ===== Helper: consumo con negativos permitidos ===== */
  private async consumeLayersAllowNegative(
    tx: Prisma.TransactionClient,
    params: {
      itemId: number;
      warehouseId: number;
      qtyBase: number;
      strategy?: 'FEFO' | 'FIFO';
    },
  ) {
    const { itemId, warehouseId } = params;
    let remaining = params.qtyBase;
    const consumed: Array<{ layerId: number; qty: number; unitCost: number }> =
      [];

    try {
      const c = await this.consumeLayers(tx, params);
      consumed.push(...c);
      remaining = 0;
    } catch {
      // consumir lo disponible y dejar el resto como faltante
      // 1) intentar consumir todo lo posible sin lanzar
      const layers = await tx.stockLayer.findMany({
        where: { itemId, warehouseId, remainingQty: { gt: 0 as any } },
        orderBy: { createdAt: 'asc' },
      });
      for (const layer of layers) {
        if (remaining <= 0) break;
        const avail = Number(layer.remainingQty);
        if (avail <= 0) continue;
        const take = Math.min(avail, remaining);
        await tx.stockLayer.update({
          where: { id: layer.id },
          data: { remainingQty: (avail - take) as any },
        });
        consumed.push({
          layerId: layer.id,
          qty: take,
          unitCost: Number(layer.unitCost),
        });
        remaining -= take;
      }
    }

    return { consumed, shortageBase: Math.max(0, remaining) };
  }

  // ===== Ajuste (IN/OUT) =====
  async adjust(dto: {
    itemId: number;
    warehouseId: number;
    direction: 'IN' | 'OUT';
    qty: number; // en la UOM 'uom' (o displayUnit si no se pasa)
    uom?: Unit; // si no viene, se usa displayUnit del ítem
    unitCost?: number; // requerido en IN
    note?: string;
    refType?: string;
    refId?: number;
    expiryDate?: string;
    lotCode?: string;
    productionDate?: string;
    reason?: StockAdjustmentReason;
  }) {
    const {
      itemId,
      warehouseId,
      direction,
      qty,
      uom,
      unitCost,
      note,
      refType,
      refId,
      expiryDate,
      lotCode,
      productionDate,
      reason,
    } = dto;
    if (qty <= 0) throw new BadRequestException('qty debe ser > 0');
    if (direction === 'IN' && (unitCost === undefined || unitCost < 0)) {
      throw new BadRequestException('unitCost requerido para IN');
    }

    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    const wh = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!item) throw new NotFoundException('Item no encontrado');
    if (!wh) throw new NotFoundException('Bodega no encontrada');

    const usedUom = uom ?? item.displayUnit;
    const qtyBase = this.displayToBase(Number(qty), item.baseUnit, usedUom);
    const qtySigned = direction === 'IN' ? qtyBase : -qtyBase;
    const adjustmentReason =
      reason ??
      (refType && refType.toUpperCase() === 'PRODUCTION'
        ? StockAdjustmentReason.PRODUCTION
        : StockAdjustmentReason.ACCOUNTING);
    const appliedRefType: string | null =
      refType ??
      (adjustmentReason === StockAdjustmentReason.ACCOUNTING
        ? null
        : adjustmentReason);

    // IDs de movimientos a postear en contabilidad
    const { moveId, postMoveIds } = await this.prisma.$transaction(
      async (tx) => {
        // Registrar movimiento de ajuste (qty en BASE, puede ser negativa)
        // Convert unitCost provided in display UOM to price per base unit
        const itemRec = await tx.item.findUnique({
          where: { id: itemId },
          select: { baseUnit: true },
        });
        const baseUom = itemRec?.baseUnit;
        const rawUnitCost = Number(unitCost ?? 0);
        const factorIn = baseUom ? convertToBase(1, usedUom, baseUom) : 1;
        const unitCostBase =
          factorIn > 0
            ? Number((rawUnitCost / factorIn).toFixed(6))
            : rawUnitCost;

        const move = await tx.stockMove.create({
          data: {
            itemId,
            warehouseId,
            type: StockMoveType.ADJUSTMENT,
            qty: qtySigned as any,
            // store movement qty in base unit and set uom to base for clarity
            uom: baseUom ?? usedUom,
            unitCost: (direction === 'IN' ? unitCostBase : 0) as any,
            note: note ?? null,
            refType: appliedRefType,
            refId: refId ?? null,
            adjustmentReason,
          },
        });

        const toPost: number[] = [move.id];

        if (direction === 'IN') {
          // Crear capa con remanente = qtyBase y metadatos
          await tx.stockLayer.create({
            data: {
              itemId,
              warehouseId,
              remainingQty: qtyBase as any,
              unitCost: unitCostBase as any,
              expiryDate: expiryDate ? new Date(expiryDate) : null,
              lotCode: lotCode ?? null,
              productionDate: productionDate ? new Date(productionDate) : null,
              moveInId: move.id,
            },
          });
        } else {
          // OUT: consumir capas (FEFO) y registrar consumos + costear
          const consumed = await this.consumeLayers(tx, {
            itemId,
            warehouseId,
            qtyBase,
            strategy: 'FEFO',
          });
          const totalCost = consumed.reduce(
            (s, c) => s + c.qty * c.unitCost,
            0,
          );
          const avgCost = qtyBase > 0 ? totalCost / qtyBase : 0;

          for (const c of consumed) {
            await tx.stockConsumption.create({
              data: {
                moveOutId: move.id,
                layerId: c.layerId,
                itemId,
                warehouseId,
                qty: c.qty as any,
                unitCost: c.unitCost as any,
              },
            });
          }

          // Actualiza unitCost del movimiento con el promedio
          await tx.stockMove.update({
            where: { id: move.id },
            data: { unitCost: avgCost as any },
          });
        }

        return { moveId: move.id, postMoveIds: toPost };
      },
    );

    // Postear en contabilidad (ADJUSTMENT) DESPUÉS de confirmar la transacción
    for (const id of postMoveIds) {
      await this.accounting.postStockMove(id);
    }

    return { ok: true, moveId };
  }

  // ===== Transferencia entre bodegas (preserva capas) =====
  async transfer(dto: {
    itemId: number;
    fromWarehouseId: number;
    toWarehouseId: number;
    qty: number;
    uom?: Unit;
    note?: string;
  }) {
    const { itemId, fromWarehouseId, toWarehouseId, qty, uom, note } = dto;
    if (fromWarehouseId === toWarehouseId)
      throw new BadRequestException('Origen y destino no pueden ser iguales');
    if (qty <= 0) throw new BadRequestException('qty debe ser > 0');

    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item no encontrado');

    const usedUom = uom ?? item.displayUnit;
    const qtyBase = this.displayToBase(Number(qty), item.baseUnit, usedUom);

    return await this.prisma.$transaction(async (tx) => {
      // OUT en origen
      // create out move in base unit
      const itemFrom = await tx.item.findUnique({
        where: { id: itemId },
        select: { baseUnit: true },
      });
      const baseUomFrom = itemFrom?.baseUnit;
      const outMove = await tx.stockMove.create({
        data: {
          itemId,
          warehouseId: fromWarehouseId,
          type: StockMoveType.TRANSFER_OUT,
          qty: -qtyBase as any,
          uom: baseUomFrom ?? usedUom,
          unitCost: 0 as any,
          note: note ?? null,
          refType: 'TRANSFER',
        },
      });

      const consumed = await this.consumeLayers(tx, {
        itemId,
        warehouseId: fromWarehouseId,
        qtyBase,
        strategy: 'FEFO',
      });
      const totalCost = consumed.reduce((s, c) => s + c.qty * c.unitCost, 0);
      const avgCost = qtyBase > 0 ? totalCost / qtyBase : 0;

      // registra consumos del OUT
      for (const c of consumed) {
        await tx.stockConsumption.create({
          data: {
            moveOutId: outMove.id,
            layerId: c.layerId,
            itemId,
            warehouseId: fromWarehouseId,
            qty: c.qty as any,
            unitCost: c.unitCost as any,
          },
        });
      }
      await tx.stockMove.update({
        where: { id: outMove.id },
        data: { unitCost: avgCost as any },
      });

      // IN en destino (recrear capas espejo)
      // create mirrored IN move also in base unit
      const itemTo = await tx.item.findUnique({
        where: { id: itemId },
        select: { baseUnit: true },
      });
      const baseUomTo = itemTo?.baseUnit;
      const inMove = await tx.stockMove.create({
        data: {
          itemId,
          warehouseId: toWarehouseId,
          type: StockMoveType.TRANSFER_IN,
          qty: qtyBase as any,
          uom: baseUomTo ?? usedUom,
          unitCost: avgCost as any,
          note: note ?? null,
          refType: 'TRANSFER',
        },
      });

      for (const c of consumed) {
        const src = await tx.stockLayer.findUnique({
          where: { id: c.layerId },
        });
        if (!src) continue;
        await tx.stockLayer.create({
          data: {
            itemId,
            warehouseId: toWarehouseId,
            remainingQty: c.qty as any,
            unitCost: src.unitCost,
            expiryDate: src.expiryDate,
            lotCode: src.lotCode,
            productionDate: src.productionDate,
            moveInId: inMove.id,
          },
        });
      }

      return { ok: true, outMoveId: outMove.id, inMoveId: inMove.id, avgCost };
    });
  }

  // ===== Producción (consumir hojas BOM y crear stock del terminado) =====
  async produce(dto: {
    itemId: number;
    warehouseId: number;
    qty: number;
    note?: string;
    allowNegative?: boolean;
  }) {
    const { itemId, warehouseId, qty, note, allowNegative } = dto;
    if (!itemId || !warehouseId || !qty || qty <= 0) {
      throw new BadRequestException('Parámetros inválidos para producción');
    }

    const item = await this.prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item no encontrado');

    // Explota requerimientos (hojas) para producir qty del terminado
    const exploded = await this.bom.explodeRequirements({
      items: [{ itemId, qty }],
      warehouseId: undefined, // no priorizamos preparado para producir, bajamos a hojas
    });
    const leaves = (exploded?.leaves ?? []).map((l: any) => ({
      itemId: l.itemId,
      qtyBase: Number(l.qtyBase ?? l.qty ?? 0),
    }));
    if (!leaves.length) {
      throw new BadRequestException('No hay receta/hojas para este producto');
    }

    // Convertimos qty producida a base del TERMINADO para crear la capa de entrada
    const qtyBaseOut = this.displayToBase(
      Number(qty),
      item.baseUnit,
      item.displayUnit,
    );

    // Ejecutamos y devolvemos además los IDs a postear
    const result = await this.prisma.$transaction(async (tx) => {
      const toPost: number[] = [];

      // 1) Consumir hojas (permitir negativos si aplica)
      let totalCost = 0;
      for (const leaf of leaves) {
        if (leaf.qtyBase <= 0) continue;
        if (allowNegative) {
          const { consumed, shortageBase } =
            await this.consumeLayersAllowNegative(tx, {
              itemId: leaf.itemId,
              warehouseId,
              qtyBase: leaf.qtyBase,
              strategy: 'FEFO',
            });

          // registrar movimiento de salida por TOTAL (consumido + faltante) con costo promedio de lo consumido
          const costSum = consumed.reduce((s, c) => s + c.qty * c.unitCost, 0);
          const avgCost =
            consumed.reduce((s, c) => s + c.qty, 0) > 0
              ? costSum / consumed.reduce((s, c) => s + c.qty, 0)
              : 0;

          const move = await tx.stockMove.create({
            data: {
              type: StockMoveType.ADJUSTMENT, // salida de insumo como ajuste de producción
              itemId: leaf.itemId,
              warehouseId,
              qty: -leaf.qtyBase as any,
              uom: Unit.UN, // rastro; no afecta costo
              unitCost: avgCost as any,
              refType: 'PRODUCTION',
              note: note ?? null,
              adjustmentReason: StockAdjustmentReason.PRODUCTION,
            },
          });

          toPost.push(move.id);

          for (const c of consumed) {
            totalCost += c.qty * c.unitCost;
            await tx.stockConsumption.create({
              data: {
                moveOutId: move.id,
                layerId: c.layerId,
                itemId: leaf.itemId,
                warehouseId,
                qty: c.qty as any,
                unitCost: c.unitCost as any,
              },
            });
          }

          // el faltante se queda sin stockConsumption (queda como negativo por el movimiento)
          if (shortageBase > 0) {
            // nada extra; ya el move total dejó el negativo
          }
        } else {
          const consumed = await this.consumeLayers(tx, {
            itemId: leaf.itemId,
            warehouseId,
            qtyBase: leaf.qtyBase,
            strategy: 'FEFO',
          });
          const move = await tx.stockMove.create({
            data: {
              type: StockMoveType.ADJUSTMENT,
              itemId: leaf.itemId,
              warehouseId,
              qty: -leaf.qtyBase as any,
              uom: Unit.UN,
              unitCost: 0 as any, // se seteará al promedio real abajo
              refType: 'PRODUCTION',
              note: note ?? null,
              adjustmentReason: StockAdjustmentReason.PRODUCTION,
            },
          });
          toPost.push(move.id);

          const costSum = consumed.reduce((s, c) => s + c.qty * c.unitCost, 0);
          const avgCost = leaf.qtyBase > 0 ? costSum / leaf.qtyBase : 0;
          totalCost += costSum;

          for (const c of consumed) {
            await tx.stockConsumption.create({
              data: {
                moveOutId: move.id,
                layerId: c.layerId,
                itemId: leaf.itemId,
                warehouseId,
                qty: c.qty as any,
                unitCost: c.unitCost as any,
              },
            });
          }
          await tx.stockMove.update({
            where: { id: move.id },
            data: { unitCost: avgCost as any },
          });
        }
      }

      // 2) Crear movimiento de ENTRADA y capa del terminado con costo promedio
      const unitCostOut = qtyBaseOut > 0 ? totalCost / qtyBaseOut : 0;

      const moveIn = await tx.stockMove.create({
        data: {
          type: StockMoveType.ADJUSTMENT,
          itemId: itemId,
          warehouseId,
          qty: qtyBaseOut as any,
          uom: item.displayUnit,
          unitCost: unitCostOut as any,
          refType: 'PRODUCTION',
          note: note ?? null,
          adjustmentReason: StockAdjustmentReason.PRODUCTION,
        },
      });
      toPost.push(moveIn.id);

      const layer = await tx.stockLayer.create({
        data: {
          itemId,
          warehouseId,
          remainingQty: qtyBaseOut as any,
          unitCost: unitCostOut as any,
          moveInId: moveIn.id,
        },
      });

      return {
        postMoveIds: toPost,
        result: {
          ok: true,
          producedItemId: itemId,
          producedQtyBase: qtyBaseOut,
          unitCost: unitCostOut,
          inputCostTotal: totalCost,
          layerId: layer.id,
        },
      };
    });

    // Postear en contabilidad (ADJUSTMENTs de producción) tras commit
    for (const id of result.postMoveIds) {
      await this.accounting.postStockMove(id);
    }

    return result.result;
  }
}
