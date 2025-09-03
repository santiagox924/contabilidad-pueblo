// src/sales/sales.controller.ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SalesService } from './sales.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post('invoices')
  create(@Body() dto: CreateInvoiceDto) {
    return this.sales.create(dto);
  }

  @Get('invoices/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.sales.findOne(id);
  }

  // ✅ NUEVO: anulación de factura
  @Post('invoices/:id/void')
  voidInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.sales.voidInvoice(id);
  }

  // Notas crédito
  @Post('credit-notes')
  createCredit(@Body() dto: CreateCreditNoteDto) {
    return this.sales.createCreditNote(dto);
  }

  @Get('credit-notes/:id')
  getCredit(@Param('id', ParseIntPipe) id: number) {
    return this.sales.getCreditNote(id); // usa un método del service
  }
}
