import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@UseGuards(JwtAuthGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Post('invoices')
  create(@Body() dto: CreatePurchaseDto) {
    return this.purchases.create(dto);
  }

  @Get('invoices/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.purchases.findOne(id);
  }
}
