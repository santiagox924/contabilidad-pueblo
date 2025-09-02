import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InventoryService } from './inventory.service';
import { CreateMoveDto } from './dto/create-move.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';

@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  // Warehouses
  @Get('warehouses')
  listWarehouses() {
    return this.inv.listWarehouses();
  }

  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inv.createWarehouse(dto.name);
  }

  // Stock puntual
  @Get('stock')
  stockOf(@Query('itemId') itemId?: string, @Query('warehouseId') warehouseId?: string) {
    if (!itemId || !warehouseId) return { error: 'itemId y warehouseId son requeridos' };
    return this.inv.stockOf(Number(itemId), Number(warehouseId));
  }

  // Resumen por bodegas
  @Get('stock-summary')
  stockSummary(@Query('itemId') itemId?: string) {
    if (!itemId) return { error: 'itemId es requerido' };
    return this.inv.stockSummary(Number(itemId));
  }
@Get('kardex')
//Kardex
kardex(
  @Query('itemId') itemIdRaw?: string,
  @Query('warehouseId') warehouseIdRaw?: string,
  @Query('from') fromRaw?: string,   // YYYY-MM-DD
  @Query('to') toRaw?: string,       // YYYY-MM-DD
) {
  if (!itemIdRaw || !warehouseIdRaw) {
    return { error: 'itemId y warehouseId son requeridos' };
  }
  const itemId = Number(itemIdRaw);
  const warehouseId = Number(warehouseIdRaw);

  const from = fromRaw ? new Date(fromRaw) : undefined;
  const to = toRaw ? new Date(toRaw) : undefined;

  return this.inv.kardex({ itemId, warehouseId, from, to });
}
  // Movimientos
  @Get('moves')
  listMoves(
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.inv.listMoves(
      itemId ? Number(itemId) : undefined,
      warehouseId ? Number(warehouseId) : undefined,
      Number(take ?? 50),
      Number(skip ?? 0),
    );
  }

  // Crear movimiento
  @Post('moves')
  createMove(@Body() dto: CreateMoveDto) {
    return this.inv.createMove(dto);
  }

  // 👇 NUEVO: ver capas FIFO vigentes para un item/bodega
  @Get('layers')
  layers(@Query('itemId') itemId?: string, @Query('warehouseId') warehouseId?: string) {
    if (!itemId || !warehouseId) return { error: 'itemId y warehouseId son requeridos' };
    return this.inv.listLayers(Number(itemId), Number(warehouseId));
  }
}
