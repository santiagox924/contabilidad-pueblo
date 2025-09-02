import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SalesService } from './sales.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

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
}
