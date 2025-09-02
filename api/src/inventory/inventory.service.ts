import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMoveDto } from './dto/create-move.dto';
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // --- Warehouses ---
  listWarehouses() {
    return this.prisma.warehouse.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }
  async createWarehouse(name: string) {
    try {
      return await this.prisma.warehouse.create({ data: { name } });
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('El nombre de bodega ya existe');
      throw e;
    }
  }

  // --- Helpers numéricos (sin @ts-expect-error) ---
  private num(x: unknown): number {
    if (x == null) return 0;
    if (x instanceof Prisma.Decimal) return x.toNumber();
    const anyX = x as any;
    if (anyX && typeof anyX.toNumber === 'function') return anyX.toNumber();
    const n = Number(anyX);
    return Number.isFinite(n) ? n : 0;
  }

  // --- Stock fuera de transacción (vista rápida) ---
  async stockOf(itemId: number, warehouseId: number) {
    const rows = await this.prisma.stockMove.groupBy({
      by: ['itemId', 'warehouseId'],
      where: { itemId, warehouseId },
      _sum: { qty: true },
    });
    const qty = rows[0]?._sum.qty ?? new Prisma.Decimal(0);
    return { itemId, warehouseId, qty: this.num(qty) };
  }

  // --- Stock dentro de transacción (consistencia) ---
  private async stockOfTx(tx: Tx, itemId: number, warehouseId: number) {
    const rows = await tx.stockMove.groupBy({
      by: ['itemId', 'warehouseId'],
      where: { itemId, warehouseId },
      _sum: { qty: true },
    });
    const qty = rows[0]?._sum.qty ?? new Prisma.Decimal(0);
    return { itemId, warehouseId, qty: this.num(qty) };
  }

  // --- Resúmenes / lista de movimientos ---
  async stockSummary(itemId: number) {
    const rows = await this.prisma.stockMove.groupBy({
      by: ['warehouseId'],
      where: { itemId },
      _sum: { qty: true },
    });
    return rows.map((r) => ({
      warehouseId: r.warehouseId,
      qty: this.num(r._sum.qty),
    }));
  }

  listMoves(itemId?: number, warehouseId?: number, take = 50, skip = 0) {
    return this.prisma.stockMove.findMany({
      where: { ...(itemId ? { itemId } : {}), ...(warehouseId ? { warehouseId } : {}) },
      orderBy: { ts: 'desc' },
      take: Math.min(take, 200),
      skip,
    });
  }

  // --- Capas FIFO vigentes ---
  listLayers(itemId: number, warehouseId: number) {
    return this.prisma.stockLayer.findMany({
      where: { itemId, warehouseId, remainingQty: { gt: new Prisma.Decimal(0) } },
      orderBy: { id: 'asc' }, // FIFO: más antiguas primero
    });
  }
// --- Kardex (movimientos + saldo acumulado) ---
async kardex(params: { itemId: number; warehouseId: number; from?: Date; to?: Date }) {
  const { itemId, warehouseId, from, to } = params;

  // Filtro por fechas (inclusivo en 'to' a las 23:59:59.999)
  const dateFilter =
    from || to
      ? {
          ts: {
            gte: from ?? undefined,
            lte: to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : undefined,
          },
        }
      : {};

  const moves = await this.prisma.stockMove.findMany({
    where: { itemId, warehouseId, ...dateFilter },
    orderBy: [{ ts: 'asc' }, { id: 'asc' }],
  });

  let runQty = 0;
  let runVal = 0;

  const rows = moves.map((m) => {
    const qty = this.num(m.qty);                 // +entradas / -salidas
    const unitCost = this.num(m.unitCost);       // en ventas viene del FIFO
    const movVal = qty * unitCost;               // valor del movimiento

    runQty += qty;                               // saldo acumulado de cantidad
    runVal += movVal;                            // saldo acumulado de valor

    return {
      id: m.id,
      ts: m.ts,
      type: m.type,
      inQty: qty > 0 ? qty : 0,
      outQty: qty < 0 ? Math.abs(qty) : 0,
      unitCost,
      movCost: movVal,
      runQty,
      runVal,
      avgCost: runQty !== 0 ? runVal / runQty : 0,
      refType: m.refType,
      refId: m.refId,
      note: m.note,
    };
  });

  return {
    itemId,
    warehouseId,
    from: from ?? null,
    to: to ?? null,
    count: rows.length,
    ending: {
      qty: runQty,
      value: runVal,
      avgCost: runQty !== 0 ? runVal / runQty : 0,
    },
    rows,
  };
}
  // --- FIFO helpers (dentro de TX) ---
  private async addLayer(
    tx: Tx,
    params: { itemId: number; warehouseId: number; qty: number; unitCost: number; moveInId: number },
  ) {
    await tx.stockLayer.create({
      data: {
        itemId: params.itemId,
        warehouseId: params.warehouseId,
        remainingQty: new Prisma.Decimal(params.qty),
        unitCost: new Prisma.Decimal(params.unitCost),
        moveInId: params.moveInId,
      },
    });
  }

  private async consumeLayers(tx: Tx, params: { itemId: number; warehouseId: number; qty: number }) {
    let toConsume = params.qty; // cantidad POSITIVA a consumir
    let totalCost = 0;

    // Capas más antiguas primero (FIFO)
    const layers = await tx.stockLayer.findMany({
      where: { itemId: params.itemId, warehouseId: params.warehouseId, remainingQty: { gt: 0 } },
      orderBy: { id: 'asc' },
    });

    for (const layer of layers) {
      if (toConsume <= 0) break;

      const available = this.num(layer.remainingQty);
      const take = Math.min(available, toConsume);

      if (take > 0) {
        totalCost += take * this.num(layer.unitCost);

        await tx.stockLayer.update({
          where: { id: layer.id },
          data: { remainingQty: new Prisma.Decimal(available - take) },
        });

        toConsume -= take;
      }
    }

    if (toConsume > 1e-9) {
      throw new BadRequestException('Stock insuficiente para aplicar FIFO');
    }

    const unitCostWeighted = totalCost / params.qty;
    return { totalCost, unitCostWeighted };
  }

  // --- Crear movimiento con FIFO ---
  async createMove(dto: CreateMoveDto) {
    // Validaciones base
    const item = await this.prisma.item.findUnique({ where: { id: dto.itemId } });
    if (!item || !item.active) throw new NotFoundException('Ítem no válido');
    if (item.type === 'SERVICE') throw new BadRequestException('Un servicio no mueve inventario');

    const wh = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!wh || !wh.active) throw new NotFoundException('Bodega no válida');

    const isOut =
      dto.type === 'SALE' ||
      dto.type === 'TRANSFER_OUT' ||
      (dto.type === 'ADJUSTMENT' && dto.qty < 0);

    const isIn =
      dto.type === 'PURCHASE' ||
      dto.type === 'TRANSFER_IN' ||
      (dto.type === 'ADJUSTMENT' && dto.qty > 0);

    const signedQty = isOut ? -Math.abs(dto.qty) : Math.abs(dto.qty);

    if (isIn && (dto.unitCost ?? undefined) === undefined) {
      throw new BadRequestException('unitCost es requerido en entradas');
    }

    return await this.prisma.$transaction(async (tx) => {
      if (isIn) {
        // ENTRADA
        const moveIn = await tx.stockMove.create({
          data: {
            itemId: dto.itemId,
            warehouseId: dto.warehouseId,
            type: dto.type,
            qty: signedQty, // positivo
            unitCost: new Prisma.Decimal(dto.unitCost!),
            refType: dto.refType ?? null,
            refId: dto.refId ?? null,
            note: dto.note ?? null,
          },
        });

        await this.addLayer(tx, {
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          qty: Math.abs(signedQty),
          unitCost: dto.unitCost!,
          moveInId: moveIn.id,
        });

        // (opcional) actualizar costAvg referencial
        const agg = await tx.stockMove.groupBy({
          by: ['itemId'],
          where: { itemId: dto.itemId, qty: { gt: 0 } },
          _avg: { unitCost: true },
        });
        const avg = agg[0]?._avg.unitCost ?? 0;
        await tx.item.update({ where: { id: dto.itemId }, data: { costAvg: avg as any } });

        return moveIn;
      }

      // SALIDA
      const s = await this.stockOfTx(tx, dto.itemId, dto.warehouseId);
      if (s.qty + signedQty < 0) throw new BadRequestException('Stock insuficiente');

      const { unitCostWeighted } = await this.consumeLayers(tx, {
        itemId: dto.itemId,
        warehouseId: dto.warehouseId,
        qty: Math.abs(signedQty),
      });

      const moveOut = await tx.stockMove.create({
        data: {
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          type: dto.type,
          qty: signedQty, // negativo
          unitCost: new Prisma.Decimal(unitCostWeighted),
          refType: dto.refType ?? null,
          refId: dto.refId ?? null,
          note: dto.note ?? null,
        },
      });

      return moveOut;
    });
  }
}
