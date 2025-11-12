import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';

@UseGuards(JwtAuthGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly svc: PurchasesService) {}

  /**
   * LISTADO DE FACTURAS DE COMPRA
   */
  @Get()
  findMany(
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.findMany({ q, from, to });
  }

  /**
   * CREAR factura de compra (solo cabecera + líneas, SIN afectar inventario)
   * Acepta líneas con itemId, qty, unitCost, (opcional uom) y warehouseId.
   * Si no se envía uom, el backend utilizará la displayUnit del ítem.
   */
  @Post()
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  create(@Body() dto: CreatePurchaseInvoiceDto) {
    return this.svc.create(dto);
  }

  /**
   * CREAR factura de compra + ingreso a inventario.
   * Requisitos por línea:
   *  - itemId, qty, unitCost, warehouseId
   *  - uom opcional; si viene, DEBE ser de la misma familia que la baseUnit del ítem.
   * Comportamiento:
   *  - Convierte qty a la baseUnit del ítem y crea StockMove + StockLayer.
   *  - Si uom no viene, usa displayUnit del ítem.
   */
  @Post('with-stock')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  createWithStock(@Body() dto: CreatePurchaseInvoiceDto) {
    // Toda la lógica de validación de familia de unidades y conversión vive en el service.
    return this.svc.createWithStock(dto);
  }

  /**
   * DETALLE de factura de compra
   */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  /**
   * ANULAR factura de compra
   */
  @Post(':id/void')
  void(@Param('id', ParseIntPipe) id: number) {
    return this.svc.void(id);
  }

  /**
   * 🚀 Endpoint de ayuda para la UI:
   * Devuelve las UOM válidas para comprar un ítem (según su UnitKind).
   * Ej.: LENGTH => ['MM','CM','M','KM', ...]
   */
  @Get('uoms/allowed/:itemId')
  getAllowedUoms(@Param('itemId', ParseIntPipe) itemId: number) {
    // Implementado en el service: busca el item, toma su unitKind y devuelve la lista de UOM compatibles.
    return this.svc.getAllowedUomsForItem(itemId);
  }
}
