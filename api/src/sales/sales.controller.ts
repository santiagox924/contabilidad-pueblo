// api/src/sales/sales.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { ListSalesQueryDto } from './dto/list-sales.dto';
import { CreateSalesInvoiceWithStockDto } from './dto/create-sales-invoice-with-stock.dto';
import { CreateSalesInvoiceWithPaymentsDto } from './dto/create-sales-invoice-with-payments.dto';

/**
 * Controlador de Ventas
 * - Acepta DTOs que incluyen impuestos (IVA) y retenciones por línea/factura.
 * - Expone endpoint para "postear" la factura y generar asientos contables.
 */
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  /** Listado paginado/filtrado de facturas de venta */
  @Get()
  list(@Query() query: ListSalesQueryDto) {
    return this.salesService.list(query);
  }

  /** Obtener una factura por id (incluye líneas, impuestos y retenciones) */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.findOne(id);
  }

  /**
   * Crear factura de venta
   * - DTO soporta: taxId/vatPct/priceIncludesTax/withholdings[] a nivel línea
   * - Totales: taxTotal, withholdingTotal a nivel factura
   * - El cálculo definitivo se realiza en SalesService (TaxesService / WithholdingsService)
   */
  @Post()
  create(@Body() dto: CreateSalesInvoiceDto) {
    return this.salesService.create(dto).catch((e) => {
      // Superficie de error más amigable para diagnósticos desde UI
      const msg =
        (e && (e.message || e?.response?.message)) || 'Error creando la venta';
      throw new (require('@nestjs/common').BadRequestException)(msg);
    });
  }

  /**
   * Crear venta y descontar stock FIFO.
   * Integra BOM para productos compuestos; servicios no afectan inventario.
   * También soporta campos fiscales en las líneas.
   */
  @Post('with-stock')
  createWithStock(@Body() dto: CreateSalesInvoiceWithStockDto) {
    return this.salesService.createWithStock(dto).catch((e) => {
      const msg =
        (e && (e.message || e?.response?.message)) ||
        'Error creando la venta (stock)';
      throw new (require('@nestjs/common').BadRequestException)(msg);
    });
  }

  /**
   * Crear venta, descontar stock y registrar recibos (pagos) vinculados a la factura.
   * También soporta campos fiscales en las líneas.
   */
  @Post('with-payments')
  createWithPayments(
    @Body() dto: CreateSalesInvoiceWithPaymentsDto,
    @Req() req: any,
  ) {
    const userId = Number(req?.user?.id ?? req?.user?.userId ?? req?.user?.sub);
    return this.salesService
      .createWithPayments(dto, userId || undefined)
      .catch((e) => {
        const msg =
          (e && (e.message || e?.response?.message)) ||
          'Error creando la venta (pagos)';
        throw new (require('@nestjs/common').BadRequestException)(msg);
      });
  }

  /** Modificar factura completa (recalcula impuestos/retenciones en el servicio) */
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSalesInvoiceDto,
  ) {
    return this.salesService.update(id, dto);
  }

  /**
   * Postear factura (generar asientos contables):
   *  - Caja/Bancos/CxC vs Ingresos + IVA Débito – Retenciones por pagar.
   *  - Mantiene movimiento de inventario/COGS si aplica.
   */
  @Post(':id/post')
  post(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.postSalesInvoice(id);
  }

  /** Anular factura (VOID) con razón opcional */
  @Post(':id/void')
  void(
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: { reason?: string },
  ) {
    return this.salesService.void(id, body?.reason);
  }

  /** Alias para anular (compatibilidad con frontend que llama /cancel). */
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: { reason?: string },
  ) {
    return this.salesService.void(id, body?.reason);
  }
}
