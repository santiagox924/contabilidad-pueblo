import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { StockAdjustmentReason, Unit } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsIn,
  Min,
  IsISO8601,
  IsPositive,
  IsString,
  IsBoolean,
} from 'class-validator';

/** ===== DTOs (declarados fuera de la clase) ===== */
class CreateWarehouseDto {
  name!: string;
}

class AdjustDto {
  @IsInt() itemId!: number;
  @IsInt() warehouseId!: number;
  // Prisma solo tiene ADJUSTMENT; usamos direction para IN/OUT
  @IsIn(['IN', 'OUT']) direction!: 'IN' | 'OUT';
  @IsNumber() @Min(0.0001) qty!: number;
  @IsOptional() @IsEnum(Unit) uom?: Unit; // ⬅️ unidad de captura (se convierte a base en el service)
  @IsOptional() @IsNumber() @Min(0) unitCost?: number; // requerido cuando IN
  @IsOptional() note?: string;
  @IsOptional() @IsISO8601() expiryDate?: string; // yyyy-mm-dd o ISO completa
  @IsOptional() lotCode?: string;
  @IsOptional() @IsISO8601() productionDate?: string;
  @IsOptional() @IsEnum(StockAdjustmentReason) reason?: StockAdjustmentReason;
}

class TransferDto {
  @IsInt() itemId!: number;
  @IsInt() fromWarehouseId!: number;
  @IsInt() toWarehouseId!: number;
  @IsNumber() @Min(0.0001) qty!: number;
  @IsOptional() @IsEnum(Unit) uom?: Unit; // ⬅️ unidad de captura
  @IsOptional() note?: string;
}

/** ===== Producción ===== */
class ProduceDto {
  @IsInt() @Min(1) itemId!: number; // terminado (ej. salsa especial)
  @IsInt() @Min(1) warehouseId!: number; // bodega donde se produce
  @IsNumber() @IsPositive() qty!: number; // cantidad a producir (en displayUnit del ítem)
  @IsOptional() @IsEnum(Unit) uom?: Unit; // ⬅️ unidad de captura (se convierte a base)
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsBoolean() allowNegative?: boolean; // permite faltantes de insumos
}

/** ===== Controller ===== */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  // ===== Bodegas =====
  @Get('warehouses')
  listWarehouses() {
    return this.inv.listWarehouses();
  }

  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    if (!dto?.name?.trim()) throw new BadRequestException('name requerido');
    return this.inv.createWarehouse(dto.name.trim());
  }

  // ===== Stock =====
  @Get('stock/:itemId/:warehouseId')
  stockOf(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
  ) {
    return this.inv.stockOf(itemId, warehouseId);
  }

  @Get('stock/:itemId')
  stockSummary(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.inv.stockSummary(itemId);
  }

  // ===== Kardex / Movimientos =====
  @Get('kardex')
  kardex(
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!itemId) throw new BadRequestException('itemId requerido');
    return this.inv.kardex({
      itemId: Number(itemId),
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get('moves')
  listMoves(
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('orderDir') orderDir?: 'asc' | 'desc',
  ) {
    return this.inv.listMoves({
      itemId: itemId ? Number(itemId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      take: take ? Number(take) : 20,
      skip: skip ? Number(skip) : 0,
      orderDir: orderDir ?? 'asc',
    });
  }

  // ===== Capas vigentes =====
  @Get('layers/:itemId/:warehouseId')
  listLayers(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
  ) {
    return this.inv.listLayers(Number(itemId), Number(warehouseId));
  }

  // ===== Ajuste manual (IN/OUT) =====
  @Post('adjust')
  adjust(@Body() dto: AdjustDto) {
    return this.inv.adjust(dto);
  }

  // ===== Transferencia entre bodegas =====
  @Post('transfer')
  transfer(@Body() dto: TransferDto) {
    return this.inv.transfer(dto);
  }

  // ===== Producción (consumir insumos de la BOM y crear stock del terminado) =====
  @Post('produce')
  produce(@Body() dto: ProduceDto) {
    return this.inv.produce(dto);
  }
}
